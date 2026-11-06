const BASE_URL = 'https://api.talkwalker.com';
const DEFAULT_PROJECT_ID = '63946bf7-d099-4e63-9369-9368aab43fdf';
export const TALKWALKER_NOISE_THRESHOLD = 70;
const NOISE_CATEGORIES = new Set(['promotions', 'spam', 'seo_scam', 'free_content']);

export class TalkwalkerError extends Error {
  constructor(message, { status, code } = {}) { super(message); this.name = 'TalkwalkerError'; this.status = status; this.code = code; }
}

function config() {
  const accessToken = process.env.TALKWALKER_ACCESS_TOKEN;
  const projectId = process.env.TALKWALKER_PROJECT_ID || DEFAULT_PROJECT_ID;
  if (!accessToken || accessToken.startsWith('your_')) throw new TalkwalkerError('Talkwalker is not configured.');
  return { accessToken, projectId };
}

async function request(path, params = {}) {
  const { accessToken } = config();
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') (Array.isArray(value) ? value : [value]).forEach(item => url.searchParams.append(key, item)); });
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || String(data?.status_code) !== '0') throw new TalkwalkerError(data?.status_message || `Talkwalker request failed (${response.status}).`, { status: response.status });
  // Security: never pass through Talkwalker's token-bearing request or next-page fields.
  const { request: _request, pagination: _pagination, ...safe } = data;
  return { safe, total: Number(data?.pagination?.total) || 0 };
}

function manilaStart(date) { return new Date(`${date}T00:00:00+08:00`).getTime(); }
function nextManilaDay(date) { const value = new Date(`${date}T00:00:00+08:00`); value.setUTCDate(value.getUTCDate() + 1); return value.getTime(); }
function dateParams(dateFrom, dateTo) { return { min: manilaStart(dateFrom), max: nextManilaDay(dateTo), min_include: 'true', max_include: 'false', timezone: 'Asia/Manila' }; }
function queryForDates(dateFrom, dateTo, query = 'sourcecountry:ph') { return `${query} AND published:>${manilaStart(dateFrom) - 1} AND published:<${nextManilaDay(dateTo)}`; }
function unwrapDocuments(data) { const container = data?.result_content || {}; return (Array.isArray(container) ? container : container.data || []).map(item => item?.data || item); }
function scalar(value) { return Array.isArray(value) ? value[0] : value; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export function sentimentLabel(value) { const score = number(value); return score > 0 ? 'Positive' : score < 0 ? 'Negative' : 'Neutral'; }
export function isNoise(document) { return number(document?.noise_level) >= TALKWALKER_NOISE_THRESHOLD || NOISE_CATEGORIES.has(String(document?.noise_category || '').toLowerCase()); }
export function platformLabel(document) {
  const values = [...(Array.isArray(document?.source_type) ? document.source_type : [document?.source_type]), ...(Array.isArray(document?.post_type) ? document.post_type : [document?.post_type])].filter(Boolean).join(' ').toUpperCase();
  if (values.includes('REDDIT')) return 'Reddit'; if (values.includes('FACEBOOK')) return 'Facebook'; if (values.includes('TWITTER')) return 'X'; if (values.includes('YOUTUBE')) return 'YouTube'; if (values.includes('TIKTOK')) return 'TikTok'; if (values.includes('FORUM')) return 'Forums'; if (values.includes('ONLINENEWS')) return 'News'; if (values.includes('BLOG')) return 'Blogs'; return 'Web';
}

export function normalizeMention(document) {
  const publishedMs = number(document.published);
  const author = document.extra_author_attributes || {};
  const world = author.world_data || {};
  const extended = document.article_extended_attributes || {};
  return {
    id: String(document.external_id || document.id || document.url || `${publishedMs}:${document.title || ''}`), url: document.url || document.parent_url || '',
    published: publishedMs, date: publishedMs ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(publishedMs)) : '',
    title: document.title || '', content: document.content_snippet || document.content || '', lang: document.lang || '', sentiment: sentimentLabel(document.sentiment), sentimentScore: number(document.sentiment),
    platform: platformLabel(document), category: platformLabel(document), source: platformLabel(document), reach: number(document.reach || document.estimated_reach),
    engagement: number(document.engagement || extended.engagement || extended.total_engagement), author: { name: author.name || document.external_author_id || '', country: scalar(world.country || world.country_code || author.country) || '' },
    country: scalar(world.country || world.country_code || author.country) || 'ph', noise_level: number(document.noise_level), noise_category: document.noise_category || '',
  };
}

function histogram(data) { return data?.result_histogram || {}; }
function histogramTotal(data) { return (histogram(data).data || []).reduce((sum, item) => sum + (Array.isArray(item.v) ? item.v.reduce((a, b) => a + number(b), 0) : number(item.v)), 0); }
function histogramValueSum(data) { return (histogram(data).data || []).reduce((sum, item) => { const values = Array.isArray(item.val) ? item.val : [item.val]; return sum + values.reduce((subtotal, value) => subtotal + number(value?.sum), 0); }, 0); }

export const talkwalkerProvider = {
  id: 'talkwalker', name: 'Talkwalker',
  capabilities: { mentions: true, count: true, reach: true, projects: true, createProjects: false, filteredSourceSample: false, enrichment: false, topics: false, authors: true, rawReddit: false, rawTikTok: false },
  async listProjects() {
    const { projectId } = config();
    const { safe } = await request(`/api/v2/talkwalker/p/${projectId}/resources`, { type: 'search' });
    return (safe?.result_resources?.projects || []).flatMap(project => (project.topics || []).flatMap((topic, topicIndex) => (topic.nodes || []).map(node => ({ id: node.id, name: node.title || node.name, group: topic.title || topic.name || (topicIndex === 0 ? 'Personalities' : 'Other'), provider: 'talkwalker' }))));
  },
  async fetchMentions({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph', cursor = 0, limit = 500, maxMentions = Infinity, maxPages = 1000, excludeNoise = true, logger = console }) {
    const { projectId } = config(); const mentions = []; const seen = new Set(); let offset = number(cursor); let pages = 0; let rawMentions = 0; let duplicateMentions = 0; let noiseExcluded = 0; let total = 0;
    do {
      const hpp = Math.min(500, limit, 10000 - offset, Number.isFinite(maxMentions) ? Math.max(1, maxMentions - mentions.length) : 500);
      if (hpp <= 0) break;
      const { safe, total: responseTotal } = await request(`/api/v1/search/p/${projectId}/results`, { q: queryForDates(dateFrom, dateTo, query), topic: topicId, hpp, offset, sort_by: 'published', sort_order: 'asc', hl: 'false', timezone: 'Asia/Manila' });
      total = responseTotal; const documents = unwrapDocuments(safe); rawMentions += documents.length; pages += 1;
      for (const document of documents) { if (excludeNoise && isNoise(document)) { noiseExcluded += 1; continue; } const mention = normalizeMention(document); if (seen.has(mention.id)) { duplicateMentions += 1; continue; } seen.add(mention.id); mentions.push(mention); if (mentions.length >= maxMentions) break; }
      offset += documents.length; if (!documents.length || offset >= total || offset >= 10000 || mentions.length >= maxMentions || pages >= maxPages) break;
    } while (true);
    const capped = offset < total || total > 10000;
    if (total > 10000) logger.warn?.('[Talkwalker] result window exceeds 10,000; use smaller calendar windows.', { topicId, dateFrom, dateTo, total });
    return { mentions, pages, cursor: capped ? offset : null, capped, hasMore: capped, rawMentions, duplicateMentions, mentionsWithoutId: 0, noiseExcluded, totalAvailable: total, creditsUsed: pages * 10 + Math.max(0, rawMentions - pages * 10), minDate: mentions[0]?.date || null, maxDate: mentions.at(-1)?.date || null };
  },
  async fetchCount({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph' }) {
    const { projectId } = config();
    const [{ safe }, countResult] = await Promise.all([
      request(`/api/v1/search/p/${projectId}/histogram/published`, { q: query, topic: topicId, ...dateParams(dateFrom, dateTo), interval: 'day', breakdown: 'sentiment' }),
      request(`/api/v1/search/p/${projectId}/results`, { q: queryForDates(dateFrom, dateTo, query), topic: topicId, hpp: 1, offset: 0, hl: 'false' }),
    ]);
    const result = histogram(safe); const header = result.header?.v || ['POSITIVE', 'NEUTRAL', 'NEGATIVE']; const daily = {}; const sentiment = { Positive: 0, Neutral: 0, Negative: 0 };
    for (const item of result.data || []) { const values = Array.isArray(item.v) ? item.v : [item.v]; const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(number(item.t))); daily[date] = values.reduce((sum, value) => sum + number(value), 0); header.forEach((label, index) => { const key = String(label).toLowerCase(); sentiment[key.startsWith('pos') ? 'Positive' : key.startsWith('neg') ? 'Negative' : 'Neutral'] += number(values[index]); }); }
    return { total: countResult.total, aggregateTotal: histogramTotal(safe), daily, sentiment, creditsUsed: 20, providerNote: countResult.total === histogramTotal(safe) ? '' : 'Daily and sentiment histograms include aggregate-only channels that cannot be exported as raw documents.' };
  },
  async fetchReach({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph' }) {
    const { projectId } = config();
    const { safe } = await request(`/api/v1/search/p/${projectId}/histogram/published`, { q: query, topic: topicId, ...dateParams(dateFrom, dateTo), interval: 'day', value_type: 'reach' });
    return { socialMediaReach: {}, nonSocialMediaReach: {}, socialMediaReachTotal: 0, nonSocialMediaReachTotal: 0, totalReach: histogramValueSum(safe), creditsUsed: 10, providerNote: 'Talkwalker potential reach; social/non-social split is not available from this provider.' };
  },
};
