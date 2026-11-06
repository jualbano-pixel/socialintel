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
    title: document.title || '', content: [...new Set([document.content_snippet, document.content].filter(Boolean).map(value => String(value).trim()))].join(' '), lang: document.lang || '', sentiment: sentimentLabel(document.sentiment), sentimentScore: number(document.sentiment),
    platform: platformLabel(document), category: platformLabel(document), source: platformLabel(document), reach: number(document.reach || document.estimated_reach),
    engagement: number(document.engagement || extended.engagement || extended.total_engagement), author: { name: author.name || document.external_author_id || '', internalId: String(document.external_author_id || author.external_id || author.id || ''), country: scalar(world.country || world.country_code || author.country) || '' },
    country: scalar(world.country || world.country_code || author.country) || 'ph', noise_level: number(document.noise_level), noise_category: document.noise_category || '',
  };
}

function histogram(data) { return data?.result_histogram || {}; }
function histogramTotal(data) { return (histogram(data).data || []).reduce((sum, item) => sum + (Array.isArray(item.v) ? item.v.reduce((a, b) => a + number(b), 0) : number(item.v)), 0); }
function histogramValueSum(data) { return (histogram(data).data || []).reduce((sum, item) => { const values = Array.isArray(item.val) ? item.val : [item.val]; return sum + values.reduce((subtotal, value) => subtotal + number(value?.sum), 0); }, 0); }
function platformFromHistogram(value) { const key = String(value || '').toUpperCase(); if (key.includes('REDDIT')) return 'Reddit'; if (key.includes('FACEBOOK')) return 'Facebook'; if (key.includes('INSTAGRAM')) return 'Instagram'; if (key.includes('TIKTOK')) return 'TikTok'; if (key.includes('TWITTER')) return 'X'; if (key.includes('YOUTUBE')) return 'YouTube'; if (key.includes('ONLINENEWS')) return 'News'; if (key.includes('MESSAGEBOARD') || key.includes('FORUM') || key.includes('BLOG')) return 'Forums'; return 'Other'; }
function distribution(data) { const result = histogram(data); const labels = result.header?.v || []; const totals = new Map(); for (const item of result.data || []) { const values = Array.isArray(item.v) ? item.v : [item.v]; if (labels.length > 1) labels.forEach((label, index) => totals.set(String(label), (totals.get(String(label)) || 0) + number(values[index]))); else { const label = item.k ?? item.key ?? item.t; const value = values[0] ?? item.val; if (label != null) totals.set(String(label), (totals.get(String(label)) || 0) + number(value)); } } return [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); }
function clientPost(document, source = 'Talkwalker API') { const mention = normalizeMention(document); const subject = String(mention.title || mention.content).replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+|@[\w.-]+/g, '').replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 180); const textAvailable = Boolean(subject); if (mention.platform === 'X' && !textAvailable) return null; return { id: mention.id, url: mention.url, date: mention.date, platform: mention.platform, engagement: mention.engagement, sentiment: mention.sentiment, source, paraphrase: subject ? `This ${mention.platform} item focuses on ${subject}.` : `A ${mention.platform} item discusses the monitored topic.`, textAvailable }; }

export const talkwalkerProvider = {
  id: 'talkwalker', name: 'Talkwalker',
  capabilities: { mentions: true, count: true, reach: true, projects: true, analytics: true, topPosts: true, lumenUpload: true, createProjects: false, filteredSourceSample: false, enrichment: false, topics: false, authors: true, rawReddit: false, rawTikTok: false },
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
    const [{ safe }, { safe: sourceSafe }, countResult] = await Promise.all([
      request(`/api/v1/search/p/${projectId}/histogram/published`, { q: query, topic: topicId, ...dateParams(dateFrom, dateTo), interval: 'day', breakdown: 'sentiment' }),
      request(`/api/v1/search/p/${projectId}/histogram/published`, { q: query, topic: topicId, ...dateParams(dateFrom, dateTo), interval: '31d', breakdown: 'sourcetype' }),
      request(`/api/v1/search/p/${projectId}/results`, { q: queryForDates(dateFrom, dateTo, query), topic: topicId, hpp: 1, offset: 0, hl: 'false' }),
    ]);
    const result = histogram(safe); const header = result.header?.v || ['POSITIVE', 'NEUTRAL', 'NEGATIVE']; const daily = {}; const dailySentiment = {}; const sentiment = { Positive: 0, Neutral: 0, Negative: 0 };
    for (const item of result.data || []) { const values = Array.isArray(item.v) ? item.v : [item.v]; const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(number(item.t))); daily[date] = values.reduce((sum, value) => sum + number(value), 0); dailySentiment[date] = { Positive: 0, Neutral: 0, Negative: 0 }; header.forEach((label, index) => { const key = String(label).toLowerCase(); const bucket = key.startsWith('pos') ? 'Positive' : key.startsWith('neg') ? 'Negative' : 'Neutral'; sentiment[bucket] += number(values[index]); dailySentiment[date][bucket] += number(values[index]); }); }
    const sourceHistogram = histogram(sourceSafe); const platforms = {};
    for (const item of sourceHistogram.data || []) (sourceHistogram.header?.v || []).forEach((label, index) => { const platform = platformFromHistogram(label); platforms[platform] = (platforms[platform] || 0) + number((Array.isArray(item.v) ? item.v : [item.v])[index]); });
    return { total: histogramTotal(safe), readableTotal: countResult.total, aggregateTotal: histogramTotal(safe), daily, dailySentiment, sentiment, platforms, creditsUsed: 30, providerNote: 'Histogram totals include export-restricted platforms; readableTotal counts documents whose text can be exported.' };
  },
  async fetchReach({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph' }) {
    const { projectId } = config();
    const { safe } = await request(`/api/v1/search/p/${projectId}/histogram/published`, { q: query, topic: topicId, ...dateParams(dateFrom, dateTo), interval: 'day', value_type: 'reach' });
    return { socialMediaReach: {}, nonSocialMediaReach: {}, socialMediaReachTotal: 0, nonSocialMediaReachTotal: 0, totalReach: histogramValueSum(safe), creditsUsed: 10, providerNote: 'Talkwalker potential reach; social/non-social split is not available from this provider.' };
  },
  async fetchAnalytics({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph' }) {
    const { projectId } = config(); const datedQuery = queryForDates(dateFrom, dateTo, query); const interval = `${Math.max(1, Math.ceil((nextManilaDay(dateTo) - manilaStart(dateFrom)) / 86400000) + 1)}d`; const projects = await this.listProjects(); const selected = projects.find(item => String(item.id) === String(topicId)); const groupTopicIds = projects.filter(item => item.group === selected?.group).map(item => item.id);
    const calls = [
      ['shareOfVoice', 'published', { q: query, topic: groupTopicIds, ...dateParams(dateFrom, dateTo), interval, breakdown: 'topic' }],
      ['themes', 'theme_cloud', { q: datedQuery, topic: topicId, top_n: 10, percentage_relation: 'query', tokenizing_mode: 'noun_phrase' }],
      ['hashtags', 'hashtag', { q: datedQuery, topic: topicId, top_n: 10 }],
      ['brands', 'smart_theme', { q: datedQuery, topic: topicId, top_n: 10, smart_theme: 'brands' }],
      ['gender', 'gender', { q: datedQuery, topic: topicId, top_n: 10 }],
      ['age', 'age', { q: datedQuery, topic: topicId, top_n: 10 }],
      ['cities', 'source_city', { q: datedQuery, topic: topicId, top_n: 20 }],
      ['engagement', 'engagement', { q: datedQuery, topic: topicId, interval: 1000000000 }],
    ];
    const responses = await Promise.all(calls.map(async ([key, type, params]) => { try { const { safe } = await request(`/api/v1/search/p/${projectId}/histogram/${type}`, params); return [key, safe, null]; } catch (error) { return [key, null, error.message]; } })); const output = { creditsUsed: calls.length * 10, unavailable: {} };
    for (const [key, safe, error] of responses) { if (error) { output.unavailable[key] = error; continue; } output[key] = key === 'engagement' ? histogramValueSum(safe) : distribution(safe); }
    output.shareOfVoice = (output.shareOfVoice || []).map(item => ({ ...item, label: projects.find(project => String(project.id) === item.label)?.name || item.label })); output.topicGroup = selected?.group || ''; return output;
  },
  async fetchTopPosts({ projectId: topicId, dateFrom, dateTo, query = 'sourcecountry:ph' }) {
    const { projectId } = config(); const days = Math.ceil((nextManilaDay(dateTo) - manilaStart(dateFrom)) / 86400000); if (days > 30) return { overall: [], positive: [], negative: [], creditsUsed: 0, apiLimited: true, note: 'Talkwalker Results API top posts are limited to periods of 30 days or less. Top posts for this period come only from the Lumen upload.' };
    const sourceQuery = `${query} AND (sourcetype:ONLINENEWS OR sourcetype:BLOG OR sourcetype:MESSAGEBOARD OR sourcetype:YOUTUBE OR sourcetype:TWITTER)`; const pulls = await Promise.all([['overall', '', 10], ['positive', ' AND sentiment:positive', 5], ['negative', ' AND sentiment:negative', 5]].map(async ([key, sentiment, hpp]) => { const { safe } = await request(`/api/v1/search/p/${projectId}/results`, { q: `${queryForDates(dateFrom, dateTo, sourceQuery)}${sentiment}`, topic: topicId, hpp, offset: 0, sort_by: 'engagement', sort_order: 'desc', hl: 'false' }); return [key, unwrapDocuments(safe).map(document => clientPost(document)).filter(Boolean)]; })); return { ...Object.fromEntries(pulls), creditsUsed: 30, apiLimited: false, note: 'API top posts include exportable news, blogs, forums, YouTube and X only. X text appears only when returned by the API.' };
  },
  async fetchCreditUsage() { const { safe } = await request('/api/v1/status/credits'); const credit = safe?.result_creditinfo || {}; return { usedMonthly: number(credit.used_credits_monthly), remainingMonthly: number(credit.remaining_credits_monthly), monthlyTotal: number(credit.monthly_total) }; },
};
