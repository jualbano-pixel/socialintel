import { getMentions, getMentionsReach, toClientSafeError } from '../../../lib/brand24-rest';
import { claudeProviderMetadata, requestClaude } from '../../../lib/claude-api';
import { requestOpenRouterChat } from '../../../lib/openrouter-api';
import { cleanList, extractJson, flagMentions, sanitizeDirectionalFindings, summarizeClassifications, validateTopicalScanInput } from '../../../lib/topical-scan';

export const maxDuration = 300;
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL = 'gemini-3.6-flash';

function configured(key) { return key && !key.startsWith('your_'); }

async function readJson(response) {
  const raw = await response.text();
  try { return JSON.parse(raw); } catch { return { raw }; }
}

async function claudeText(prompt, maxTokens = 4000) {
  const result = await requestClaude({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }, { label: 'Topical Scan classification' });
  if (!result.ok) throw new Error(result.data?.error?.message || `Claude request failed (${result.status}).`);
  return { text: result.data?.content?.filter(block => block.type === 'text').map(block => block.text).join('') || '', provider: claudeProviderMetadata(result) };
}

async function classify(flagged, themes, onProgress = () => {}) {
  if (!flagged.length) return { results: [], backupUsed: false };
  const results = [];
  let backupUsed = false;
  const totalBatches = Math.ceil(flagged.length / 35);
  for (let offset = 0; offset < flagged.length; offset += 35) {
    const batchNumber = Math.floor(offset / 35) + 1;
    onProgress({ stage: 'classifying', message: `Classifying batch ${batchNumber} of ${totalBatches}`, current: batchNumber, total: totalBatches });
    const batch = flagged.slice(offset, offset + 35).map(item => ({ id: item.id, text: item.text, candidates: item.candidateThemeIndexes }));
    const claude = await claudeText(`Classify public social-listening mentions. Return ONLY a JSON array. Never repeat names, handles, account details, or personal amounts. Paraphrase neutrally. Themes are zero-indexed:\n${JSON.stringify(themes.map((theme, index) => ({ index, label: theme.label, description: theme.description })))}\n\nFor every input return {"id":"m1","relevant":true,"themeIndexes":[0],"stance":"complaint|advice-seeking|advice-giving|neutral|news","sentiment":"positive|neutral|negative|unknown","paraphrase":"anonymous paraphrase"}. Use relevant=false when it is not specifically about the stated theme. Mentions:\n${JSON.stringify(batch)}`, 5000);
    backupUsed ||= claude.provider.claudeBackupUsed;
    if (claude.provider.claudeBackupUsed) onProgress({ stage: 'provider', message: 'Claude via OpenRouter (backup)', provider: claude.provider });
    const parsed = extractJson(claude.text, []);
    if (!Array.isArray(parsed)) throw new Error('Classification returned invalid JSON. No metrics were produced.');
    results.push(...parsed);
  }
  return { results, backupUsed };
}

function directionalPrompt(input, theme, sourceLine) {
  return `Search ${sourceLine} for public posts from the Philippines, ${input.dateFrom}–${input.dateTo}, about ${input.projectName || 'the selected brand'} (${cleanList(input.aliases).join(', ') || 'brand name'}) related to: ${theme.description}. Relevant phrases: ${cleanList(theme.phrases).join(', ')}. Return ONLY a JSON array of objects with url, platform, date, paraphrase, and stance. Include only sources that explicitly reference the brand. Paraphrase; omit usernames, names, account details, and personal amounts. If nothing qualifies, return []. Do not substitute generic content.`;
}

async function pullGrok(input, theme) {
  if (!configured(process.env.XAI_API_KEY)) return { source: 'Grok', status: 'not configured', findings: [], discarded: 0 };
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({ model: 'grok-4.3', input: directionalPrompt(input, theme, 'X/Twitter and Reddit'), tools: [{ type: 'x_search' }, { type: 'web_search' }] }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error?.message || `Grok failed (${response.status}).`);
  const text = data?.output_text || data?.output?.find(block => block.type === 'message')?.content?.find(block => block.type === 'output_text')?.text || '';
  return { source: 'Grok', status: 'complete', ...sanitizeDirectionalFindings(extractJson(text, [])) };
}

async function pullGemini(input, theme) {
  if (!configured(process.env.GEMINI_API_KEY)) return { source: 'Gemini', status: 'not configured', findings: [], discarded: 0 };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: directionalPrompt(input, theme, 'the web, forums, YouTube and TikTok titles/descriptions, and Philippine news sites') }] }], tools: [{ google_search: {} }] }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error?.message || `Gemini failed (${response.status}).`);
  const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  return { source: 'Gemini', status: 'complete', ...sanitizeDirectionalFindings(extractJson(text, [])) };
}

async function pullSonar(input, theme) {
  const source = 'Sonar via OpenRouter';
  try {
    const data = await requestOpenRouterChat({ model: 'perplexity/sonar-pro', messages: [{ role: 'user', content: directionalPrompt(input, theme, 'the public web and social sources') }] });
    return { source, status: 'complete', ...sanitizeDirectionalFindings(extractJson(data?.choices?.[0]?.message?.content, [])) };
  } catch (error) {
    return { source, status: 'skipped', error: error.message, findings: [], discarded: 0 };
  }
}

async function pool(tasks, concurrency = 2) {
  const results = new Array(tasks.length); let next = 0;
  async function worker() { while (next < tasks.length) { const index = next++; const task = tasks[index]; try { results[index] = { themeIndex: task.themeIndex, ...(await task.run()) }; } catch (error) { results[index] = { themeIndex: task.themeIndex, source: task.source, status: 'error', error: error.message, findings: [], discarded: 0 }; } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function executeScan(input, onProgress = () => {}) {
    const errors = validateTopicalScanInput(input);
    if (errors.length) { const error = new Error(errors.join(' ')); error.status = 400; throw error; }
    onProgress({ stage: 'mentions', message: 'Pulling every monitored mention with cursor pagination' });
    const mentionPull = await getMentions(String(input.projectId), input.dateFrom, input.dateTo, { limit: 500, maxMentions: Infinity, maxPages: 1000, timeoutMs: 60000, logger: console });
    if (mentionPull.capped || mentionPull.hasMore || mentionPull.cursor) throw new Error('The full mention census did not complete. Metrics were not produced.');
    onProgress({ stage: 'mentions', message: `Retrieved ${mentionPull.mentions.length} mentions across ${mentionPull.pages} pages` });
    onProgress({ stage: 'reach', message: 'Pulling monitored reach' });
    const reach = await getMentionsReach(String(input.projectId), input.dateFrom, input.dateTo, { timeoutMs: 60000, logger: console });
    const expectedTotal = input.expectedTotal === '' || input.expectedTotal == null ? null : Number(input.expectedTotal);
    const countMatchesExpected = expectedTotal == null || expectedTotal === mentionPull.mentions.length;
    if (!countMatchesExpected) { const error = new Error(`Retrieved ${mentionPull.mentions.length} mentions, but the expected dashboard total is ${expectedTotal}. Classification stopped.`); error.status = 409; throw error; }
    onProgress({ stage: 'filtering', message: 'Applying high-recall theme phrases and exclusions' });
    const flagged = flagMentions(mentionPull.mentions, input.themes, input.exclusions);
    onProgress({ stage: 'filtering', message: `${flagged.length} mentions flagged for classification` });
    const classification = await classify(flagged, input.themes, onProgress);
    const verified = summarizeClassifications({ mentions: mentionPull.mentions, flagged, classifications: classification.results, themes: input.themes, totalReach: reach.totalReach });
    onProgress({ stage: 'directional', message: `Checking Grok, Gemini, and Sonar via OpenRouter for ${input.themes.length} themes (maximum two concurrent)` });
    const tasks = input.themes.flatMap((theme, themeIndex) => [
      { themeIndex, source: 'Grok', run: () => pullGrok(input, theme) },
      { themeIndex, source: 'Gemini', run: () => pullGemini(input, theme) },
      { themeIndex, source: 'Sonar via OpenRouter', run: () => pullSonar(input, theme) },
    ]);
    const sourceResults = await pool(tasks, 2);
    const directional = input.themes.map((theme, themeIndex) => ({
      label: theme.label,
      manualNotes: String(theme.manualNotes || '').trim(),
      sources: sourceResults.filter(result => result.themeIndex === themeIndex),
    }));
    onProgress({ stage: 'report', message: 'Assembling the complete topical report' });
    return {
      generatedAt: new Date().toISOString(), projectId: String(input.projectId), projectName: input.projectName || '', dateFrom: input.dateFrom, dateTo: input.dateTo,
      pull: { pages: mentionPull.pages, retrieved: mentionPull.mentions.length, expectedTotal, countMatchesExpected },
      claudeProvider: classification.backupUsed ? 'Claude via OpenRouter (backup)' : 'Claude direct',
      claudeBackupUsed: classification.backupUsed,
      verified, directional,
      coverageCaveat: 'Public monitoring cannot see closed Facebook groups, Messenger, Telegram, Viber, or other private conversations. Captured mentions are a floor, not all conversation.',
      privacyNote: 'Aggregate reporting only. Examples are paraphrased and identifying details are removed.',
    };
}

export async function POST(request) {
  const input = await request.json().catch(() => null);
  const stream = new URL(request.url).searchParams.get('stream') === '1';
  if (stream) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        const emit = payload => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        try {
          const result = await executeScan(input, progress => emit({ type: 'progress', ...progress, at: new Date().toISOString() }));
          emit({ type: 'result', result });
        } catch (error) {
          console.error('[Topical Scan] failed', error);
          const safe = toClientSafeError(error);
          emit({ type: 'error', error: safe === 'Tracking service is temporarily unavailable. Please try again in a moment.' ? error.message : safe, status: error.status || 502 });
        } finally {
          controller.close();
        }
      },
    }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform' } });
  }
  try {
    return Response.json(await executeScan(input));
  } catch (error) {
    console.error('[Topical Scan] failed', error);
    const safe = toClientSafeError(error);
    return Response.json({ error: safe === 'Tracking service is temporarily unavailable. Please try again in a moment.' ? error.message : safe }, { status: error.status || 502 });
  }
}
