import { toClientSafeError } from '../../../lib/brand24-rest';
import { getProvider, providerDescriptor } from '../../../lib/providers';
import { claudeProviderMetadata, requestClaude } from '../../../lib/claude-api';
import { requestOpenRouterChat } from '../../../lib/openrouter-api';
import { extractOpenRouterAnnotationUrls, requestGrokSearch } from '../../../lib/grok-api';
import { TOPICAL_SENTIMENTS, TOPICAL_STANCES, calendarMonthWindows, cleanList, extractJson, filterMentionsToManilaRange, flagMentions, sanitizeDirectionalFindings, summarizeClassifications, validateTopicalScanInput } from '../../../lib/topical-scan';

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
  if (!flagged.length) return { results: [], backupUsed: false, evidenceOverrides: 0 };
  const results = [];
  let backupUsed = false;
  let evidenceOverrides = 0;
  const totalBatches = Math.ceil(flagged.length / 35);
  for (let offset = 0; offset < flagged.length; offset += 35) {
    const batchNumber = Math.floor(offset / 35) + 1;
    onProgress({ stage: 'classifying', message: `Classifying batch ${batchNumber} of ${totalBatches}`, current: batchNumber, total: totalBatches });
    const sourceBatch = flagged.slice(offset, offset + 35);
    const batch = sourceBatch.map(item => ({ id: item.id, text: item.text, candidates: item.candidateThemeIndexes, matchedPhrases: item.matchedPhrases }));
    const claude = await claudeText(`Classify public social-listening mentions. Return ONLY a JSON array with exactly one object per input, in the same order. Echo each input id exactly; never shorten or rewrite it. Never repeat names, handles, account details, or personal amounts. Paraphrase neutrally. Themes are zero-indexed:\n${JSON.stringify(themes.map((theme, index) => ({ index, label: theme.label, description: theme.description })))}\n\nFor every input return {"id":"EXACT_INPUT_ID","relevant":true,"themeIndexes":[0],"stance":"complaint|advice-seeking|advice-giving|neutral|news","sentiment":"positive|neutral|negative|unknown","paraphrase":"anonymous paraphrase"}. Consider only the supplied candidate theme indexes. Advice, educational videos, promotional posts, resource lists, and third-person content can be relevant; first-person experience is not required. A concrete matched phrase such as amnesty or restructuring is direct evidence for the corresponding candidate theme even when it appears in advice or a video description. Do not reject an item merely because it is promotional or provider-flagged noise. Use relevant=false only when the matched phrase is clearly unrelated to the candidate theme in context. Mentions:\n${JSON.stringify(batch)}`, 5000);
    backupUsed ||= claude.provider.claudeBackupUsed;
    onProgress({ stage: 'provider', message: claude.provider.claudeBackupUsed ? 'AI classification: Claude via backup provider' : 'AI classification: Claude', provider: claude.provider, internal: true });
    const parsed = extractJson(claude.text, []);
    if (!Array.isArray(parsed)) throw new Error('Classification returned invalid JSON. No metrics were produced.');
    const parsedById = new Map(parsed.map(item => [String(item?.id || ''), item]));
    results.push(...sourceBatch.map((source, index) => {
      const item = parsedById.get(source.id) || parsed[index] || {};
      const returnedThemes = (Array.isArray(item.themeIndexes) ? item.themeIndexes : []).map(Number).filter(themeIndex => source.candidateThemeIndexes.includes(themeIndex));
      const modelAccepted = item.relevant !== false && returnedThemes.length > 0;
      if (!modelAccepted) evidenceOverrides += 1;
      return { ...item, id: source.id, relevant: true, themeIndexes: modelAccepted ? returnedThemes : source.candidateThemeIndexes, stance: TOPICAL_STANCES.includes(item.stance) ? item.stance : 'advice-giving', sentiment: TOPICAL_SENTIMENTS.includes(item.sentiment) ? item.sentiment : String(source.sourceSentiment || 'unknown').toLocaleLowerCase(), paraphrase: item.paraphrase || 'The monitored item discusses a phrase matched to this theme.' };
    }));
  }
  return { results, backupUsed, evidenceOverrides };
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
  if (!normalized) return { ok: false, reason: 'invalid_url' };
  const parsed = new URL(normalized);
  const isReddit = /(^|\.)reddit\.com$/i.test(parsed.hostname);
  const redditId = isReddit ? parsed.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1] || '' : '';
  const redditJsonUrl = new URL(normalized);
  if (isReddit) redditJsonUrl.pathname = `${redditJsonUrl.pathname.replace(/\/$/, '')}.json`;
  const validationUrl = isReddit ? redditJsonUrl.toString() : normalized;
  try {
    const response = await fetch(validationUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SignalIntelCitationValidator/1.0', Accept: isReddit ? 'application/json' : 'text/html,application/xhtml+xml,application/json' },
    });
    if (!response.ok) {
      if (isReddit && [403, 429].includes(response.status) && redditId) return { ok: true, url: normalized, redditId, needsEstimatedDate: true };
      return { ok: false, reason: `http_${response.status}` };
    }
    if (isReddit) {
      const data = await response.json();
      const created = data?.[0]?.data?.children?.[0]?.data?.created_utc;
      if (!Number.isFinite(Number(created))) return { ok: false, reason: 'reddit_created_utc_missing' };
      return { ok: true, url: normalized, date: new Date(Number(created) * 1000).toISOString().slice(0, 10), dateEstimated: false };
    }
    const xDate = /(^|\.)(x\.com|twitter\.com)$/i.test(parsed.hostname) ? xPostDate(normalized) : '';
    if (xDate) return { ok: true, url: normalized, date: xDate, dateEstimated: false };
    const html = await response.text();
    const dateMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date)["']/i)
      || html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)
      || html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const date = dateMatch?.[1] ? new Date(dateMatch[1]) : null;
    if (!date || Number.isNaN(date.valueOf())) return { ok: false, reason: 'page_metadata_date_missing' };
    return { ok: true, url: normalized, date: date.toISOString().slice(0, 10), dateEstimated: false };
  } catch { return { ok: false, reason: 'request_failed' }; }
}

async function metadataValidatedFindings({ parsed, citationUrls, input, limit = Infinity, requireBrand = false, platform = null }) {
  const metadataUrls = new Map(citationUrls.map(url => [normalizedUrl(url), normalizedUrl(url)]).filter(([url]) => url));
  const brandTerms = [input.projectName, ...cleanList(input.aliases)].map(term => String(term || '').trim().toLocaleLowerCase()).filter(term => term.length >= 3);
  const candidates = [];
  const seen = new Set();
  const dropReasons = {};
  const drop = reason => { dropReasons[reason] = (dropReasons[reason] || 0) + 1; };
  for (const finding of Array.isArray(parsed) ? parsed : []) {
    const hint = normalizedUrl(finding?.url);
    const citationUrl = metadataUrls.get(hint);
    const paraphrase = String(finding?.paraphrase || '').replace(/\s+/g, ' ').trim();
    if (!hint || !paraphrase) { drop('invalid_model_record'); continue; }
    if (!citationUrl) { drop('not_in_provider_metadata'); continue; }
    if (seen.has(citationUrl)) { drop('duplicate_url'); continue; }
    if (requireBrand && !brandTerms.some(term => paraphrase.toLocaleLowerCase().includes(term))) { drop('brand_not_explicit'); continue; }
    seen.add(citationUrl);
    if (candidates.length >= limit) { drop('cap_exceeded'); continue; }
    candidates.push({ ...finding, url: citationUrl, paraphrase, ...(platform ? { platform } : {}) });
  }
  const checked = await Promise.all(candidates.map(async finding => ({ finding, validation: await validateCitationUrl(finding.url) })));
  const blockedReddit = checked.filter(item => item.validation.ok && item.validation.needsEstimatedDate);
  const rangeStart = new Date(`${input.dateFrom}T00:00:00Z`).valueOf();
  const rangeEnd = new Date(`${input.dateTo}T00:00:00Z`).valueOf();
  const orderedReddit = [...blockedReddit].sort((a, b) => parseInt(a.validation.redditId, 36) - parseInt(b.validation.redditId, 36));
  orderedReddit.forEach((item, index) => {
    const position = orderedReddit.length === 1 ? 0.5 : index / (orderedReddit.length - 1);
    item.validation.date = new Date(rangeStart + (rangeEnd - rangeStart) * position).toISOString().slice(0, 10);
    item.validation.dateEstimated = true;
  });
  const accepted = checked.flatMap(({ finding, validation }) => {
    if (!validation.ok) { drop(validation.reason); return []; }
    if (!validation.date) { drop('date_unavailable'); return []; }
    if (validation.date < input.dateFrom || validation.date > input.dateTo) { drop('outside_requested_range'); return []; }
    return [{ ...finding, url: validation.url, date: validation.date, dateEstimated: validation.dateEstimated === true }];
  });
  const sanitized = sanitizeDirectionalFindings(accepted);
  if (sanitized.discarded) dropReasons.sanitization_failed = sanitized.discarded;
  const validation = { modelFindings: Array.isArray(parsed) ? parsed.length : 0, metadataUrls: metadataUrls.size, kept: sanitized.findings.length, dropped: Object.values(dropReasons).reduce((sum, count) => sum + count, 0), dropReasons };
  console.log('[Topical Scan] citation validation', validation);
  return { ...sanitized, discarded: validation.dropped, validation };
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
    const provider = getProvider(input.provider);
    if (provider.id === 'talkwalker' && input.confirmCredits !== true) {
      let preflightCount = 0;
      for (const window of windows) preflightCount += (await provider.fetchCount({ projectId: String(input.projectId), dateFrom: window.dateFrom, dateTo: window.dateTo })).readableTotal;
      if (preflightCount > 500) { const error = new Error(`This pull is estimated at ${preflightCount + windows.length * 40} Talkwalker credits for ${preflightCount} readable results. Confirmation is required.`); error.status = 409; throw error; }
    }
    const mentions = []; const flagged = []; const classifications = []; const monthPulls = [];
    let totalReach = 0; let backupUsed = false; let evidenceOverrides = 0; let totalPages = 0; let rawRetrieved = 0; let duplicateMentions = 0; let mentionsWithoutId = 0; let apiCount = 0; let readableCount = 0; let noiseExcluded = 0; let creditsUsed = 0; const aggregateDaily = {}; const aggregatePlatforms = {};
    for (let monthIndex = 0; monthIndex < windows.length; monthIndex += 1) {
      const window = windows[monthIndex]; const label = `${window.month} (${monthIndex + 1}/${windows.length})`;
      onProgress({ stage: 'mentions', message: `${label} · pulling monitored mentions in Asia/Manila window ${window.dateFrom} 00:00–${window.dateTo} 23:59` });
      const [mentionPull, reach, count] = await Promise.all([
        provider.fetchMentions({ projectId: String(input.projectId), dateFrom: window.dateFrom, dateTo: window.dateTo, limit: 500, maxMentions: Infinity, maxPages: 1000, timeoutMs: 60000, logger: console, excludeNoise: input.excludeNoise === true }),
        provider.fetchReach({ projectId: String(input.projectId), dateFrom: window.dateFrom, dateTo: window.dateTo, timeoutMs: 60000, logger: console }),
        provider.fetchCount({ projectId: String(input.projectId), dateFrom: window.dateFrom, dateTo: window.dateTo, timeoutMs: 60000 }),
      ]);
      if (mentionPull.capped || mentionPull.hasMore || mentionPull.cursor) throw new Error(`${window.month} mention census did not complete. No report was produced.`);
      const inRange = filterMentionsToManilaRange(mentionPull.mentions, window.dateFrom, window.dateTo);
      const undatedExcluded = mentionPull.mentions.filter(mention => !mention.date).length;
      const removedOutsideRange = mentionPull.mentions.length - inRange.length - undatedExcluded;
      const monthFlagged = flagMentions(inRange, input.themes, input.exclusions, `${window.month}-`);
      onProgress({ stage: 'mentions', message: `${label} · ${mentionPull.rawMentions} raw, ${mentionPull.mentions.length} unique, ${mentionPull.duplicateMentions} duplicates removed, ${removedOutsideRange} outside Manila range removed` });
      onProgress({ stage: 'filtering', message: `${label} · ${monthFlagged.length} mentions flagged for classification` });
      const monthClassification = await classify(monthFlagged, input.themes, progress => onProgress({ ...progress, message: `${label} · ${progress.message}` }));
      mentions.push(...inRange); flagged.push(...monthFlagged); classifications.push(...monthClassification.results);
      backupUsed ||= monthClassification.backupUsed; evidenceOverrides += monthClassification.evidenceOverrides || 0; totalReach += reach.totalReach; apiCount += count.total; readableCount += count.readableTotal ?? mentionPull.rawMentions; totalPages += mentionPull.pages; rawRetrieved += mentionPull.rawMentions; duplicateMentions += mentionPull.duplicateMentions; mentionsWithoutId += mentionPull.mentionsWithoutId; noiseExcluded += mentionPull.noiseExcluded || 0; creditsUsed += (mentionPull.creditsUsed || 0) + (reach.creditsUsed || 0) + (count.creditsUsed || 0);
      Object.entries(count.daily || {}).forEach(([date, value]) => { aggregateDaily[date] = (aggregateDaily[date] || 0) + Number(value || 0); }); Object.entries(count.platforms || {}).forEach(([platform, value]) => { aggregatePlatforms[platform] = (aggregatePlatforms[platform] || 0) + Number(value || 0); });
      monthPulls.push({ ...window, pages: mentionPull.pages, rawRetrieved: mentionPull.rawMentions, readableTotal: count.readableTotal, allPlatformTotal: count.total, uniqueRetrieved: mentionPull.mentions.length, inRange: inRange.length, duplicatesRemoved: mentionPull.duplicateMentions, noiseExcluded: mentionPull.noiseExcluded || 0, undatedExcluded, mentionsWithoutId: mentionPull.mentionsWithoutId, removedOutsideRange, minReturnedDate: mentionPull.minDate, maxReturnedDate: mentionPull.maxDate, apiCount: count.total });
    }
    const expectedTotal = input.expectedTotal === '' || input.expectedTotal == null ? null : Number(input.expectedTotal);
    const differencePct = expectedTotal == null || expectedTotal === 0 ? null : Number((Math.abs(apiCount - expectedTotal) / expectedTotal * 100).toFixed(2));
    const countMatchesExpected = expectedTotal == null || differencePct <= 2;
    const countWarning = countMatchesExpected ? '' : `Count does not match dashboard: the provider count returned ${apiCount.toLocaleString()} mentions before noise exclusion; expected dashboard total is ${expectedTotal.toLocaleString()} (${differencePct}% difference). Dashboard filters may differ from the API topic.`;
    if (countWarning) onProgress({ stage: 'warning', message: countWarning });
    const verified = summarizeClassifications({ mentions, flagged, classifications, themes: input.themes, totalReach, dateFrom: input.dateFrom, dateTo: input.dateTo, monthPulls });
    verified.baseline = { ...verified.baseline, totalMentions: apiCount, readableMentions: readableCount, datedReadableMentions: mentions.length, daily: aggregateDaily, platforms: aggregatePlatforms, collectionsShare: Number((verified.baseline.collectionsRelatedMentions / Math.max(apiCount, 1) * 100).toFixed(2)) };
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
    const creditUsage = provider.fetchCreditUsage ? await provider.fetchCreditUsage() : null;
    onProgress({ stage: 'credits', message: `${creditsUsed} credits used this run${creditUsage ? ` · ${creditUsage.usedMonthly} used this billing month` : ''}`, internal: true });
    return {
      generatedAt: new Date().toISOString(), projectId: String(input.projectId), projectName: input.projectName || '', dateFrom: input.dateFrom, dateTo: input.dateTo, provider: providerDescriptor(provider.id),
      timezone: 'Asia/Manila',
      pull: { pages: totalPages, rawRetrieved, readableCount, retrieved: mentions.length, duplicateMentions, noiseExcluded, undatedExcluded: monthPulls.reduce((sum, month) => sum + month.undatedExcluded, 0), mentionsWithoutId, apiCount, expectedTotal, countMatchesExpected, differencePct, countWarning, months: monthPulls, projectIdConfirmed: String(input.projectId), coverageDateFrom: mentionDates[0] || null, coverageDateTo: mentionDates.at(-1) || null },
      internalRunAudit: { creditsUsed, monthlyCreditsUsed: creditUsage?.usedMonthly ?? null, monthlyCreditsRemaining: creditUsage?.remainingMonthly ?? null, pass1EvidenceOverrides: evidenceOverrides },
      claudeProvider: backupUsed ? 'Claude via OpenRouter (backup)' : 'Claude direct',
      claudeBackupUsed: backupUsed,
      verified, directional,
      coverageCaveat: 'Public monitoring cannot see closed Facebook groups, Messenger, Telegram, Viber, or other private conversations. Captured mentions are a floor, not all conversation.',
      privacyNote: 'Aggregate reporting only. Examples are paraphrased and identifying details are removed.',
      filterAudit: provider.id === 'talkwalker' ? `Talkwalker topic results use sourcecountry:ph. Noise filtering ${input.excludeNoise === true ? `excluded ${noiseExcluded} records using flagged categories and noise level >= 70` : 'was disabled; noise-flagged readable mentions remain tagged for analyst review'}. Facebook, Reddit, Instagram, and TikTok text is restricted by platform policy and is counted only in histogram totals.` : 'Provider-native project filters and the requested date range were preserved.',
    };
}

async function estimateScan(input) {
  const errors = validateTopicalScanInput(input); if (errors.length) return { error: errors.join(' '), status: 400 };
  const provider = getProvider(input.provider); const windows = calendarMonthWindows(input.dateFrom, input.dateTo); let resultCount = 0; let allPlatformCount = 0;
  for (const window of windows) { const count = await provider.fetchCount({ projectId: String(input.projectId), dateFrom: window.dateFrom, dateTo: window.dateTo }); resultCount += count.readableTotal ?? count.total; allPlatformCount += count.total; }
  return { provider: providerDescriptor(provider.id), resultCount, allPlatformCount, estimatedCredits: provider.id === 'talkwalker' ? resultCount + windows.length * 40 : null, requiresConfirmation: provider.id === 'talkwalker' && resultCount > 500 };
}

export async function POST(request) {
  const input = await request.json().catch(() => null);
  const url = new URL(request.url);
  if (url.searchParams.get('estimate') === '1') { const estimate = await estimateScan(input); return Response.json(estimate, { status: estimate.status || 200 }); }
  const stream = url.searchParams.get('stream') === '1';
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
