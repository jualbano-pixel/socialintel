import { requestClaude } from '../../../../lib/claude-api';
import { extractOpenRouterAnnotationUrls, requestGrokSearch } from '../../../../lib/grok-api';
import { requestOpenRouterChat } from '../../../../lib/openrouter-api';
import { cleanList } from '../../../../lib/topical-scan';

export const maxDuration = 120;
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_ENGINES = [
  { id: 'grok', label: 'Grok via OpenRouter', kind: 'grok', model: 'x-ai/grok-4.7' },
  { id: 'gemini', label: 'Gemini grounded', kind: 'gemini', model: GEMINI_MODEL },
  { id: 'sonar', label: 'Sonar via OpenRouter', kind: 'openrouter', model: 'perplexity/sonar-pro' },
];
const TRACKING = /^(utm_[^=]+|fbclid|gclid|dclid|mc_[^=]+|ref|ref_src)$/i;

function configured(value) { return Boolean(value) && !String(value).startsWith('your_'); }
function jsonError(message, status = 400) { return Response.json({ error: message }, { status }); }
function textFromClaude(data) { return data?.content?.filter(block => block.type === 'text').map(block => block.text).join('') || ''; }
function textFromOpenRouter(data) { const content = data?.choices?.[0]?.message?.content; return Array.isArray(content) ? content.map(part => part?.text || '').join('') : String(content || ''); }
function geminiUrls(data) { return (data?.candidates || []).flatMap(candidate => candidate?.groundingMetadata?.groundingChunks || []).map(chunk => chunk?.web?.uri).filter(Boolean); }
function geminiText(data) { return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''; }
function usageCost(data) { return Number(data?.usage?.cost ?? data?.usage?.total_cost ?? data?.usage?.cost_details?.upstream_inference_cost ?? 0) || null; }

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['aliases', 'exclusions', 'themes'],
  properties: {
    aliases: { type: 'array', items: { type: 'string' } },
    exclusions: { type: 'array', items: { type: 'string' } },
    themes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'queries', 'venues'], properties: {
      label: { type: 'string' }, queries: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
      venues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['venue', 'type', 'reason', 'discovered'], properties: { venue: { type: 'string' }, type: { type: 'string', enum: ['domain', 'subreddit', 'forum', 'platform', 'news outlet'] }, reason: { type: 'string' }, discovered: { type: 'boolean' } } } },
    } } },
  },
};
const FINDINGS_SCHEMA = { type: 'object', additionalProperties: false, required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'paraphrase', 'clientParaphrase', 'platform'], properties: { url: { type: 'string' }, paraphrase: { type: 'string' }, clientParaphrase: { type: 'string' }, platform: { type: 'string' } } } } } };
const SYNTHESIS_SCHEMA = { type: 'object', additionalProperties: false, required: ['signalStrength', 'inPeriod', 'older', 'narratives', 'counterexamples', 'riskFlags'], properties: { signalStrength: { type: 'string', enum: ['Strong', 'Moderate', 'Thin', 'None found'] }, inPeriod: { type: 'string' }, older: { type: 'string' }, narratives: { type: 'array', items: { type: 'string' } }, counterexamples: { type: 'array', items: { type: 'string' } }, riskFlags: { type: 'array', items: { type: 'string' } } } };

class StructuredOutputError extends Error {
  constructor(message, rawOutput = '') { super(message); this.rawOutput = rawOutput; }
}

function fallbackJson(text) {
  const raw = String(text || '').trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = unfenced.indexOf('{'); const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No complete JSON object was returned.');
  return JSON.parse(unfenced.slice(start, end + 1));
}

function schemaShapeValid(value, toolName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (toolName === 'build_search_plan') return Array.isArray(value.aliases) && Array.isArray(value.exclusions) && Array.isArray(value.themes) && value.themes.every(theme => theme?.label && Array.isArray(theme.queries) && theme.queries.length >= 3 && theme.queries.length <= 5 && Array.isArray(theme.venues));
  if (toolName === 'structure_findings') return Array.isArray(value.findings);
  if (toolName === 'write_synthesis') return ['Strong', 'Moderate', 'Thin', 'None found'].includes(value.signalStrength) && Array.isArray(value.narratives) && Array.isArray(value.counterexamples) && Array.isArray(value.riskFlags);
  return true;
}

async function claudeToolJson({ prompt, label, toolName, description, schema, maxTokens }) {
  const body = { model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], tools: [{ name: toolName, description, input_schema: schema }], tool_choice: { type: 'tool', name: toolName } };
  const result = await requestClaude(body, { label, signal: AbortSignal.timeout(110000) });
  if (!result.ok) throw new StructuredOutputError(result.data?.error?.message || `${label} failed (${result.status}).`, textFromClaude(result.data));
  const rawOutput = textFromClaude(result.data) || JSON.stringify(result.data?.content || []); const stopReason = result.data?.stop_reason || '';
  if (stopReason === 'max_tokens') throw new StructuredOutputError(`${label} stopped because it reached max_tokens (${maxTokens}).`, rawOutput);
  const toolInput = result.data?.content?.find(block => block?.type === 'tool_use' && block?.name === toolName)?.input;
  if (schemaShapeValid(toolInput, toolName)) return { value: toolInput, rawOutput, provider: result.provider, stopReason };
  try {
    const parsed = fallbackJson(rawOutput);
    if (schemaShapeValid(parsed, toolName)) return { value: parsed, rawOutput, provider: result.provider, stopReason };
  } catch { /* repaired below */ }
  const repairPrompt = `Correct the following output to match the requested JSON schema. Return only one JSON object, without markdown fences or commentary. Schema: ${JSON.stringify(schema)}\n\nOutput to correct:\n${rawOutput || JSON.stringify(result.data?.content || [])}`;
  const repair = await requestClaude({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: repairPrompt }] }, { label: `${label} JSON repair`, signal: AbortSignal.timeout(110000) });
  const repairRaw = textFromClaude(repair.data);
  if (repair.data?.stop_reason === 'max_tokens') throw new StructuredOutputError(`${label} JSON repair stopped because it reached max_tokens (${maxTokens}).`, `${rawOutput}\n\nREPAIR:\n${repairRaw}`);
  try {
    const parsed = fallbackJson(repairRaw);
    if (schemaShapeValid(parsed, toolName)) return { value: parsed, rawOutput: `${rawOutput}\n\nREPAIR:\n${repairRaw}`, provider: repair.provider, stopReason: repair.data?.stop_reason || '' };
  } catch (error) { throw new StructuredOutputError(`${label} returned invalid structured JSON after one repair attempt: ${error.message}`, `${rawOutput}\n\nREPAIR:\n${repairRaw}`); }
  throw new StructuredOutputError(`${label} returned JSON that did not match the required schema after one repair attempt.`, `${rawOutput}\n\nREPAIR:\n${repairRaw}`);
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'localhost' || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return '';
    url.hostname = host === 'redd.it' ? 'reddit.com' : host;
    if (host === 'redd.it') url.pathname = `/comments/${url.pathname.split('/').filter(Boolean)[0] || ''}`;
    [...url.searchParams.keys()].forEach(key => { if (TRACKING.test(key)) url.searchParams.delete(key); });
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function platformFor(url) {
  const host = new URL(url).hostname;
  if (/(^|\.)reddit\.com$/.test(host)) return 'Reddit';
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return 'X';
  if (/(^|\.)threads\.net$/.test(host)) return 'Threads';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  return 'Web / news';
}

function venueFor(url) {
  const parsed = new URL(url); const host = parsed.hostname.replace(/^www\./, '');
  const subreddit = parsed.pathname.match(/^\/r\/([^/]+)/i)?.[1];
  if (subreddit) return { venue: `r/${subreddit}`, type: 'subreddit' };
  const path = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  if (/(facebook|instagram|threads)\.com$/.test(host) && path) return { venue: `${host}/${path}`, type: 'page/path' };
  return { venue: host, type: 'domain' };
}

function xDate(url) {
  const id = url.match(/\/status\/(\d+)/)?.[1];
  try { return id ? new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString().slice(0, 10) : ''; } catch { return ''; }
}

function instagramDate(url) {
  const code = url.match(/\/(?:p|reel|tv|post)\/([\w-]+)/)?.[1];
  if (!code) return '';
  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let id = 0n;
    for (const char of code) { const index = alphabet.indexOf(char); if (index < 0) return ''; id = id * 64n + BigInt(index); }
    const seconds = Number(id >> 23n) + 1314220020;
    const date = new Date(seconds * 1000); return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10);
  } catch { return ''; }
}

function publishedDate(html) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date|date)\b["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|datepublished|publish-date|publication_date|date)\b["']/i,
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) { const value = html.match(pattern)?.[1]; if (value) { const date = new Date(value); if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10); } }
  return '';
}

function bodyText(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').slice(0, 200000); }

async function validateUrl(rawUrl, aliases) {
  const url = normalizeUrl(rawUrl); if (!url) return { ok: false, reason: 'invalid_url' };
  const platform = platformFor(url); const parsed = new URL(url);
  const redditId = platform === 'Reddit' ? parsed.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1] : '';
  const attempts = platform === 'Reddit' && redditId
    ? [`https://www.reddit.com/comments/${redditId}.json?raw_json=1`, `https://old.reddit.com/comments/${redditId}.json?raw_json=1`]
    : [url];
  let lastReason = 'request_failed';
  for (const target of attempts) {
    try {
      const response = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'SignalIntelCitationValidator/2.0', Accept: platform === 'Reddit' ? 'application/json' : 'text/html,application/xhtml+xml' } });
      if (!response.ok) { lastReason = `http_${response.status}`; continue; }
      if (platform === 'Reddit') {
        const data = await response.json(); const post = data?.[0]?.data?.children?.[0]?.data; const created = Number(post?.created_utc);
        if (!created) { lastReason = 'reddit_created_utc_missing'; continue; }
        const searchable = `${post?.title || ''} ${post?.selftext || ''}`.toLowerCase();
        if (!aliases.some(alias => searchable.includes(alias.toLowerCase()))) return { ok: false, reason: 'brand_not_explicit' };
        return { ok: true, url: normalizeUrl(`https://reddit.com${post?.permalink || parsed.pathname}`), date: new Date(created * 1000).toISOString().slice(0, 10), dateEstimated: false, platform, searchable };
      }
      const html = await response.text(); const searchable = bodyText(html).toLowerCase();
      if (!aliases.some(alias => searchable.includes(alias.toLowerCase()))) return { ok: false, reason: 'brand_not_explicit' };
      const date = platform === 'X' ? xDate(response.url || url) : ['Instagram', 'Threads'].includes(platform) ? instagramDate(response.url || url) : publishedDate(html);
      if (!date) return { ok: false, reason: 'date_unavailable' };
      return { ok: true, url: normalizeUrl(response.url || url), date, dateEstimated: false, platform, searchable };
    } catch { lastReason = 'request_failed'; }
  }
  if (platform === 'Reddit' && redditId && ['http_403', 'http_429', 'request_failed'].includes(lastReason)) return { ok: true, url, redditId, platform, needsEstimate: true, searchable: '' };
  return { ok: false, reason: lastReason };
}

function estimateBlockedReddit(items, rangeStart, rangeEnd) {
  const sorted = items.filter(item => item.validation?.needsEstimate).sort((a, b) => parseInt(a.validation.redditId, 36) - parseInt(b.validation.redditId, 36));
  sorted.forEach((item, index) => {
    const position = sorted.length === 1 ? .5 : index / (sorted.length - 1);
    item.validation.date = new Date(rangeStart + ((rangeEnd - rangeStart) * position)).toISOString().slice(0, 10);
    item.validation.dateEstimated = true;
  });
}

async function runEngine(engine, prompt, { cap = 8 } = {}) {
  const started = Date.now(); let text = ''; let citationUrls = []; let data = {}; let provider = engine.label;
  if (engine.kind === 'grok') {
    const result = await requestGrokSearch({ input: prompt, maxTokens: 4500, maxResults: cap, signal: AbortSignal.timeout(90000) }); text = result.text; citationUrls = result.sourceUrls; data = result.data; provider = result.provider;
  } else if (engine.kind === 'gemini') {
    if (!configured(process.env.GEMINI_API_KEY)) throw new Error('Gemini unavailable this run');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${engine.model || GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }) });
    data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `Gemini failed (${response.status}).`); text = geminiText(data); citationUrls = geminiUrls(data);
  } else {
    data = await requestOpenRouterChat({ model: engine.model, messages: [{ role: 'user', content: prompt }], maxTokens: 4500, tools: [{ type: 'openrouter:web_search' }] });
    text = textFromOpenRouter(data); citationUrls = extractOpenRouterAnnotationUrls(data);
  }
  return { text, citationUrls: [...new Set(citationUrls.map(normalizeUrl).filter(Boolean))], provider, log: { engine: provider, model: engine.model, runtimeMs: Date.now() - started, costUsd: usageCost(data), citations: citationUrls.length } };
}

function engineList(input) {
  const configuredEngines = Array.isArray(input.engines) && input.engines.length ? input.engines : DEFAULT_ENGINES;
  return configuredEngines.filter(engine => engine?.id && engine?.kind && engine?.model && engine.enabled !== false);
}

function plannerPrompt(input) {
  return `You are a Philippine social-listening search planner. Use the build_search_plan tool. Inputs: brand ${input.brand}; market ${input.market || 'Philippines'}; aliases ${JSON.stringify(input.aliases)}; exclusions ${JSON.stringify(input.exclusions)}; themes ${JSON.stringify(input.themes)}. Refine aliases and exclusions. Produce 3–5 useful query variants per theme, including relevant Philippine local-language or slang variants. Suggest candidate public venues based on research judgment and explain each. Do not invent URLs and do not include findings. Venues must be generated from these inputs, not a fixed template.`;
}

function discoveryPrompt(input, theme) {
  return `Perform one broad, untargeted public-web discovery search. Do not use site: filters or preselected venues. Brand: ${input.brand}. Aliases: ${input.plan.aliases.join(', ')}. Market: ${input.market}. Theme: ${theme.label}. Queries/phrases: ${(theme.queries || []).join(' | ')}. Find where relevant public conversation exists, including older still-public material from ${input.lookbackFrom} through ${input.dateTo}. Return a short summary; citation URLs must be supplied by your search system metadata. Do not write or invent URLs in the answer.`;
}

function targetPrompt(input, theme) {
  const venues = (theme.venues || []).map(item => item.venue).filter(Boolean);
  const queries = (theme.queries || []).slice(0, 5);
  return `Search public sources for specific posts/articles about ${input.brand} in ${input.market}, from ${input.lookbackFrom} through ${input.dateTo}. Theme: ${theme.label}. Approved queries: ${queries.join(' | ')}. Approved venues: ${venues.join(', ') || 'none; search broadly'}. Generate site-targeted variants from those approved venues and run them. Return ONLY a JSON array with at most ${input.cap || 8} records: {"url":"exact cited URL","paraphrase":"one sentence explicitly naming the brand and describing that item","clientParaphrase":"same sentence but replace third-party company names with their generic role","platform":"..."}. No usernames, handles, personal names, account details, personal amounts, volume claims, or uncited URLs. Include only items explicitly about the brand. URLs in the JSON are matching hints only; the server accepts a URL solely when it appears in provider citation metadata.`;
}

async function validateFindings(raw, citations, input, engine) {
  const allowed = new Map(citations.map(url => [normalizeUrl(url), url])); const aliases = [...new Set([input.brand, ...input.plan.aliases].filter(Boolean))];
  const reasons = {}; const drop = reason => { reasons[reason] = (reasons[reason] || 0) + 1; }; const candidates = []; const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const hint = normalizeUrl(item?.url); const paraphrase = String(item?.paraphrase || '').replace(/\s+/g, ' ').trim();
    if (!hint || !paraphrase) { drop('invalid_model_record'); continue; }
    if (!allowed.has(hint)) { drop('not_in_provider_metadata'); continue; }
    if (seen.has(hint)) { drop('duplicate_url'); continue; } seen.add(hint);
    if (!aliases.some(alias => paraphrase.toLowerCase().includes(alias.toLowerCase()))) { drop('brand_not_explicit'); continue; }
    if (candidates.length >= Number(input.cap || 8)) { drop('cap_exceeded'); continue; }
    candidates.push({ item, hint, paraphrase, validation: await validateUrl(allowed.get(hint), aliases) });
  }
  const start = new Date(`${input.lookbackFrom}T00:00:00Z`).valueOf(); const end = new Date(`${input.dateTo}T23:59:59Z`).valueOf();
  estimateBlockedReddit(candidates, start, end);
  const findings = [];
  for (const candidate of candidates) {
    const validation = candidate.validation;
    if (!validation.ok) { drop(validation.reason); continue; }
    if (!validation.date) { drop('date_unavailable'); continue; }
    if (validation.needsEstimate && !aliases.some(alias => candidate.paraphrase.toLowerCase().includes(alias.toLowerCase()))) { drop('brand_not_explicit'); continue; }
    if (validation.date < input.lookbackFrom || validation.date > input.dateTo) { drop('outside_lookback'); continue; }
    findings.push({ url: validation.url, date: validation.date, dateEstimated: Boolean(validation.dateEstimated), platform: validation.platform, paraphrase: candidate.paraphrase, clientParaphrase: String(candidate.item?.clientParaphrase || candidate.paraphrase).replace(/\s+/g, ' ').trim(), engine: engine.label, theme: input.theme.label, band: validation.date >= input.dateFrom ? 'In review period' : 'Older but still public' });
  }
  return { findings, validation: { modelFindings: Array.isArray(raw) ? raw.length : 0, metadataUrls: allowed.size, kept: findings.length, dropped: Object.values(reasons).reduce((a, b) => a + b, 0), dropReasons: reasons } };
}

export async function GET() { return Response.json({ engines: DEFAULT_ENGINES }); }

export async function POST(request) {
  const started = Date.now();
  try {
    const input = await request.json(); const action = input.action;
    if (!action) return jsonError('Missing qualitative-layer action.');
    if (action === 'planner') {
      const structured = await claudeToolJson({ prompt: plannerPrompt(input), label: 'Planner', toolName: 'build_search_plan', description: 'Return the editable qualitative search plan.', schema: PLAN_SCHEMA, maxTokens: 12000 });
      return Response.json({ plan: structured.value, provider: structured.provider, stopReason: structured.stopReason, runtimeMs: Date.now() - started });
    }
    if (action === 'discovery') {
      const theme = input.theme; if (!theme?.label) return jsonError('Missing theme.');
      const engine = DEFAULT_ENGINES.find(item => item.id === 'gemini'); const counts = new Map(); const logs = []; const errors = [];
      try { const result = await runEngine(engine, discoveryPrompt(input, theme), { cap: input.cap }); logs.push(result.log); result.citationUrls.forEach(url => { const venue = venueFor(url); const current = counts.get(venue.venue) || { ...venue, hitCount: 0, reason: 'Discovered from a provider-cited URL', discovered: true }; current.hitCount += 1; counts.set(venue.venue, current); }); }
      catch (error) { errors.push({ engine: engine.label, error: error.message }); logs.push({ engine: engine.label, runtimeMs: Date.now() - started, costUsd: null, error: error.message }); throw error; }
      return Response.json({ venues: [...counts.values()].sort((a, b) => b.hitCount - a.hitCount), logs, errors, runtimeMs: Date.now() - started });
    }
    if (action === 'targeted-search') {
      const engine = engineList(input).find(item => item.id === input.engineId); if (!engine) return jsonError('Unknown or disabled engine.');
      const result = await runEngine(engine, targetPrompt(input, input.theme), { cap: input.cap });
      return Response.json({ searchText: result.text, citationUrls: result.citationUrls, log: result.log, runtimeMs: Date.now() - started });
    }
    if (action === 'targeted-structure') {
      const engine = engineList(input).find(item => item.id === input.engineId); if (!engine) return jsonError('Unknown or disabled engine.');
      const structured = await claudeToolJson({ prompt: `Use structure_findings to convert the search response into at most ${input.cap || 8} findings. Only use URLs present in this provider citation allowlist: ${JSON.stringify(input.citationUrls || [])}. Each paraphrase must explicitly name ${input.brand}. No usernames, handles, personal names, account details, personal amounts, or volume claims. Replace third-party company names with generic roles in clientParaphrase.\n\nSearch response:\n${input.searchText || ''}`, label: `Finding structuring · ${engine.label}`, toolName: 'structure_findings', description: 'Structure provider-cited qualitative findings.', schema: FINDINGS_SCHEMA, maxTokens: 5000 });
      const validated = await validateFindings(structured.value.findings, input.citationUrls || [], input, engine);
      console.log('[Qualitative Layer] targeted run', { theme: input.theme.label, validation: validated.validation });
      return Response.json({ ...validated, runtimeMs: Date.now() - started });
    }
    if (action === 'synthesis') {
      const structured = await claudeToolJson({ prompt: `Use write_synthesis. Theme: ${input.theme.label}. Findings: ${JSON.stringify(input.findings)}. Synthesize what is being said in-period versus older-but-public without volume claims. Treat posts as user claims, not verified account data or company policy. Co-occurrence with business news is not causation. Use no usernames. Hide third-party company names by describing their role. None found is valid.`, label: 'Qualitative synthesis', toolName: 'write_synthesis', description: 'Return the guarded per-theme qualitative synthesis.', schema: SYNTHESIS_SCHEMA, maxTokens: 5000 });
      return Response.json({ synthesis: structured.value, provider: structured.provider, stopReason: structured.stopReason, runtimeMs: Date.now() - started });
    }
    return jsonError('Unknown qualitative-layer action.');
  } catch (error) {
    console.error('[Qualitative Layer] failed', { error: error.message });
    return Response.json({ error: error.message || 'Qualitative layer failed.', ...(error.rawOutput ? { rawOutput: error.rawOutput } : {}) }, { status: 500 });
  }
}
