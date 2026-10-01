import { getMentions, getMentionsCount, getMentionsReach, toClientSafeError } from '../../../lib/brand24-rest';
import { claudeProviderMetadata, requestClaude } from '../../../lib/claude-api';
import { requestOpenRouterChat } from '../../../lib/openrouter-api';
import { extractOpenRouterAnnotationUrls, requestGrokSearch } from '../../../lib/grok-api';
import { calendarMonthWindows, cleanList, extractJson, filterMentionsToManilaRange, flagMentions, sanitizeDirectionalFindings, summarizeClassifications, validateTopicalScanInput } from '../../../lib/topical-scan';

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

function directionalPrompt(input, theme, sourceLine, limit = null) {
  const projectName = input.projectName || 'the selected brand';
  return `Search ${sourceLine} for public posts from the Philippines, ${input.dateFrom}–${input.dateTo}, about ${projectName} (${cleanList(input.aliases).join(', ') || 'brand name'}) related to: ${theme.description}. Relevant phrases: ${cleanList(theme.phrases).join(', ')}. Return ONLY a JSON array of objects with url, platform, date, paraphrase, and stance.${limit ? ` Return no more than ${limit} posts.` : ''} Include only posts explicitly about ${projectName}; each paraphrase must be exactly one sentence, must explicitly name ${projectName}, and must describe that specific cited post. Omit usernames, personal names, handles, account details, and personal amounts. Every object must have a working source URL and a non-empty paraphrase. If nothing qualifies, return []. Do not substitute generic content.`;
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const host = url.hostname.toLocaleLowerCase();
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function xPostDate(url) {
  const match = url.match(/\/status\/(\d+)/);
  if (!match) return '';
  try { return new Date(Number((BigInt(match[1]) >> 22n) + 1288834974657n)).toISOString().slice(0, 10); } catch { return ''; }
}

async function validateCitationUrl(url) {
  const normalized = normalizedUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  const isReddit = /(^|\.)reddit\.com$/i.test(parsed.hostname);
  const redditJsonUrl = new URL(normalized);
  if (isReddit) redditJsonUrl.pathname = `${redditJsonUrl.pathname.replace(/\/$/, '')}.json`;
  const validationUrl = isReddit ? redditJsonUrl.toString() : normalized;
  try {
    const response = await fetch(validationUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SignalIntelCitationValidator/1.0', Accept: isReddit ? 'application/json' : 'text/html,application/xhtml+xml,application/json' },
    });
    if (!response.ok) return null;
    if (isReddit) {
      const data = await response.json();
      const created = data?.[0]?.data?.children?.[0]?.data?.created_utc;
      if (!Number.isFinite(Number(created))) return null;
      return { url: normalized, date: new Date(Number(created) * 1000).toISOString().slice(0, 10) };
    }
    const xDate = /(^|\.)(x\.com|twitter\.com)$/i.test(parsed.hostname) ? xPostDate(normalized) : '';
    if (xDate) return { url: normalized, date: xDate };
    const html = await response.text();
    const dateMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date)["']/i)
      || html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)
      || html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const date = dateMatch?.[1] ? new Date(dateMatch[1]) : null;
    if (!date || Number.isNaN(date.valueOf())) return null;
    return { url: normalized, date: date.toISOString().slice(0, 10) };
  } catch { return null; }
}

async function metadataValidatedFindings({ parsed, citationUrls, input, limit = Infinity, requireBrand = false, platform = null }) {
  const metadataUrls = new Map(citationUrls.map(url => [normalizedUrl(url), normalizedUrl(url)]).filter(([url]) => url));
  const brandTerms = [input.projectName, ...cleanList(input.aliases)].map(term => String(term || '').trim().toLocaleLowerCase()).filter(term => term.length >= 3);
  const candidates = [];
  const seen = new Set();
  for (const finding of Array.isArray(parsed) ? parsed : []) {
    const hint = normalizedUrl(finding?.url);
    const citationUrl = metadataUrls.get(hint);
    const paraphrase = String(finding?.paraphrase || '').replace(/\s+/g, ' ').trim();
    if (!citationUrl || !paraphrase || seen.has(citationUrl)) continue;
    if (requireBrand && !brandTerms.some(term => paraphrase.toLocaleLowerCase().includes(term))) continue;
    seen.add(citationUrl);
    candidates.push({ ...finding, url: citationUrl, paraphrase, ...(platform ? { platform } : {}) });
    if (candidates.length >= limit) break;
  }
  const checked = await Promise.all(candidates.map(async finding => {
    const validated = await validateCitationUrl(finding.url);
    if (!validated || validated.date < input.dateFrom || validated.date > input.dateTo) return null;
    return { ...finding, url: validated.url, date: validated.date };
  }));
  const accepted = checked.filter(Boolean);
  const sanitized = sanitizeDirectionalFindings(accepted);
  return { ...sanitized, discarded: sanitized.discarded + Math.max(0, (Array.isArray(parsed) ? parsed.length : 0) - accepted.length) };
}

function geminiGroundingUrls(data) {
  return (data?.candidates || []).flatMap(candidate => candidate?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk?.web?.uri).filter(uri => typeof uri === 'string');
}

async function pullGrok(input, theme) {
  try {
    const result = await requestGrokSearch({ input: directionalPrompt(input, theme, 'X/Twitter; include the x.com URL for every returned post', 5) });
    const parsed = extractJson(result.text, []);
    const findings = await metadataValidatedFindings({ parsed, citationUrls: result.sourceUrls, input, limit: 5, requireBrand: true, platform: 'X' });
    return { source: 'Grok via OpenRouter', status: 'complete', ...findings };
  } catch (error) {
    if (error.message === 'Grok unavailable this run') return { source: 'Grok via OpenRouter', status: 'Grok unavailable this run', findings: [], discarded: 0 };
    throw error;
  }
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
  const findings = await metadataValidatedFindings({ parsed: extractJson(text, []), citationUrls: geminiGroundingUrls(data), input });
  return { source: 'Gemini', status: 'complete', ...findings };
}

async function pullSonar(input, theme) {
  const source = 'Sonar via OpenRouter';
  const data = await requestOpenRouterChat({ model: 'perplexity/sonar-pro', messages: [{ role: 'user', content: directionalPrompt(input, theme, 'the public web and social sources') }] });
  const findings = await metadataValidatedFindings({ parsed: extractJson(data?.choices?.[0]?.message?.content, []), citationUrls: extractOpenRouterAnnotationUrls(data), input });
  return { source, status: 'complete', ...findings };
}

async function pool(tasks, concurrency = 2, onProgress = () => {}) {
  const results = new Array(tasks.length); let next = 0;
  async function worker() { while (next < tasks.length) { const index = next++; const task = tasks[index]; try { results[index] = { themeIndex: task.themeIndex, ...(await task.run()) }; } catch (error) { console.error('[Topical Scan] directional source unavailable', { source: task.source, themeIndex: task.themeIndex, error: error.message }); onProgress({ stage: 'source', message: `${task.source} unavailable: ${error.message}`, internal: true }); results[index] = { themeIndex: task.themeIndex, source: task.source, status: 'unavailable', findings: [], discarded: 0 }; } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function executeScan(input, onProgress = () => {}) {
    const errors = validateTopicalScanInput(input);
    if (errors.length) { const error = new Error(errors.join(' ')); error.status = 400; throw error; }
    const windows = calendarMonthWindows(input.dateFrom, input.dateTo);
    const mentions = []; const flagged = []; const classifications = []; const monthPulls = [];
    let totalReach = 0; let backupUsed = false; let totalPages = 0; let rawRetrieved = 0; let duplicateMentions = 0; let mentionsWithoutId = 0; let apiCount = 0;
    for (let monthIndex = 0; monthIndex < windows.length; monthIndex += 1) {
      const window = windows[monthIndex]; const label = `${window.month} (${monthIndex + 1}/${windows.length})`;
      onProgress({ stage: 'mentions', message: `${label} · pulling monitored mentions in Asia/Manila window ${window.dateFrom} 00:00–${window.dateTo} 23:59` });
      const [mentionPull, reach, count] = await Promise.all([
        getMentions(String(input.projectId), window.dateFrom, window.dateTo, { limit: 500, maxMentions: Infinity, maxPages: 1000, timeoutMs: 60000, logger: console }),
        getMentionsReach(String(input.projectId), window.dateFrom, window.dateTo, { timeoutMs: 60000, logger: console }),
        getMentionsCount(String(input.projectId), window.dateFrom, window.dateTo, { timeoutMs: 60000 }),
      ]);
      if (mentionPull.capped || mentionPull.hasMore || mentionPull.cursor) throw new Error(`${window.month} mention census did not complete. No report was produced.`);
      const inRange = filterMentionsToManilaRange(mentionPull.mentions, window.dateFrom, window.dateTo);
      const removedOutsideRange = mentionPull.mentions.length - inRange.length;
      const monthFlagged = flagMentions(inRange, input.themes, input.exclusions, `${window.month}-`);
      onProgress({ stage: 'mentions', message: `${label} · ${mentionPull.rawMentions} raw, ${mentionPull.mentions.length} unique, ${mentionPull.duplicateMentions} duplicates removed, ${removedOutsideRange} outside Manila range removed` });
      onProgress({ stage: 'filtering', message: `${label} · ${monthFlagged.length} mentions flagged for classification` });
      const monthClassification = await classify(monthFlagged, input.themes, progress => onProgress({ ...progress, message: `${label} · ${progress.message}` }));
      mentions.push(...inRange); flagged.push(...monthFlagged); classifications.push(...monthClassification.results);
      backupUsed ||= monthClassification.backupUsed; totalReach += reach.totalReach; apiCount += count.total; totalPages += mentionPull.pages; rawRetrieved += mentionPull.rawMentions; duplicateMentions += mentionPull.duplicateMentions; mentionsWithoutId += mentionPull.mentionsWithoutId;
      monthPulls.push({ ...window, pages: mentionPull.pages, rawRetrieved: mentionPull.rawMentions, uniqueRetrieved: mentionPull.mentions.length, inRange: inRange.length, duplicatesRemoved: mentionPull.duplicateMentions, mentionsWithoutId: mentionPull.mentionsWithoutId, removedOutsideRange, minReturnedDate: mentionPull.minDate, maxReturnedDate: mentionPull.maxDate, apiCount: count.total });
    }
    const expectedTotal = input.expectedTotal === '' || input.expectedTotal == null ? null : Number(input.expectedTotal);
    const differencePct = expectedTotal == null || expectedTotal === 0 ? null : Number((Math.abs(mentions.length - expectedTotal) / expectedTotal * 100).toFixed(2));
    const countMatchesExpected = expectedTotal == null || differencePct <= 2;
    const countWarning = countMatchesExpected ? '' : `Count does not match dashboard: monitoring API returned ${mentions.length.toLocaleString()} unique in-range mentions; expected dashboard total is ${expectedTotal.toLocaleString()} (${differencePct}% difference). Dashboard filters are not represented by the raw API response.`;
    if (countWarning) onProgress({ stage: 'warning', message: countWarning });
    const verified = summarizeClassifications({ mentions, flagged, classifications, themes: input.themes, totalReach, dateFrom: input.dateFrom, dateTo: input.dateTo, monthPulls });
    onProgress({ stage: 'directional', message: `Checking Grok via OpenRouter, Gemini, and Sonar via OpenRouter for ${input.themes.length} themes (maximum two concurrent)` });
    const tasks = input.themes.flatMap((theme, themeIndex) => [
      { themeIndex, source: 'Grok via OpenRouter', run: () => pullGrok(input, theme) },
      { themeIndex, source: 'Gemini', run: () => pullGemini(input, theme) },
      { themeIndex, source: 'Sonar via OpenRouter', run: () => pullSonar(input, theme) },
    ]);
    const sourceResults = await pool(tasks, 2, onProgress);
    const directional = input.themes.map((theme, themeIndex) => ({
      label: theme.label,
      manualNotes: String(theme.manualNotes || '').trim(),
      sources: sourceResults.filter(result => result.themeIndex === themeIndex),
    }));
    onProgress({ stage: 'report', message: 'Assembling the complete topical report' });
    const mentionDates = mentions.map(mention => String(mention?.date || mention?.published_at || mention?.publishedAt || mention?.created_at || mention?.createdAt || '').slice(0, 10)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    return {
      generatedAt: new Date().toISOString(), projectId: String(input.projectId), projectName: input.projectName || '', dateFrom: input.dateFrom, dateTo: input.dateTo,
      timezone: 'Asia/Manila',
      pull: { pages: totalPages, rawRetrieved, retrieved: mentions.length, duplicateMentions, mentionsWithoutId, apiCount, expectedTotal, countMatchesExpected, differencePct, countWarning, months: monthPulls, projectIdConfirmed: String(input.projectId), coverageDateFrom: mentionDates[0] || null, coverageDateTo: mentionDates.at(-1) || null },
      claudeProvider: backupUsed ? 'Claude via OpenRouter (backup)' : 'Claude direct',
      claudeBackupUsed: backupUsed,
      verified, directional,
      coverageCaveat: 'Public monitoring cannot see closed Facebook groups, Messenger, Telegram, Viber, or other private conversations. Captured mentions are a floor, not all conversation.',
      privacyNote: 'Aggregate reporting only. Examples are paraphrased and identifying details are removed.',
      filterAudit: 'The Brand24 REST mention rows expose no deleted, hidden, excluded, spam, active, or visibility field. Its documented mention endpoint exposes date, category, and sentiment filters, but no supported parameter for reproducing dashboard deletion, muted-author/domain, saved-search, geo/language, or relevance filters.',
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
