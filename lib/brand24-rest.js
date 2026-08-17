const BASE_URL = 'https://api-data.brand24.com/api-data/v1';
const MAX_LIMIT = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 45000;

export class Brand24RestError extends Error {
  constructor(message, { status, cause, code } = {}) {
    super(message);
    this.name = 'Brand24RestError';
    this.status = status;
    this.cause = cause;
    this.code = code;
  }
}

function apiKey() {
  const key = process.env.BRAND24_API_KEY;
  if (!key || key.startsWith('your_')) throw new Brand24RestError('Tracking data access is not configured.');
  return key;
}

function requireAccountId(accountId) {
  if (!accountId || String(accountId).startsWith('your_')) {
    throw new Brand24RestError('Tracking workspace is not configured.');
  }
  return accountId;
}

function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url;
}

function timeoutError(label, timeoutMs) {
  return new Brand24RestError(
    `${label} took longer than ${Math.round(timeoutMs / 1000)}s. Try a narrower date range or retry shortly.`,
    { code: 'TIMEOUT' }
  );
}

async function request(path, { method = 'GET', params, body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, label = 'Tracking request' } = {}) {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(timeoutError(label, timeoutMs)), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'X-Api-Key': apiKey(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') throw timeoutError(label, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
  if (!response.ok) {
    throw new Brand24RestError('Tracking service request failed.', { status: response.status, cause: data });
  }
  return data;
}

export function normalizeKeywords(keywords = []) {
  return keywords
    .map(item => {
      const keyword = String(item.keyword || '').trim();
      if (!keyword) return null;
      const required = Array.isArray(item.required)
        ? item.required.map(v => String(v).trim()).filter(Boolean)
        : [];
      const excluded = Array.isArray(item.excluded)
        ? item.excluded.map(v => String(v).trim()).filter(Boolean)
        : [];
      return {
        keyword,
        ...(required.length ? { required } : {}),
        ...(excluded.length ? { excluded } : {}),
      };
    })
    .filter(Boolean);
}

export async function createProject(accountId, projectName, keywords, language) {
  accountId = requireAccountId(accountId);
  const normalizedKeywords = normalizeKeywords(keywords);
  if (!String(projectName || '').trim()) throw new Brand24RestError('Monitor name is required.');
  if (!normalizedKeywords.length) throw new Brand24RestError('At least one keyword is required.');
  return request(`/account/${accountId}/create_project`, {
    method: 'POST',
    params: {
      project_name: projectName,
      ...(language ? { language } : {}),
    },
    body: { keywords: normalizedKeywords },
  });
}

export async function listProjects(accountId) {
  accountId = requireAccountId(accountId);
  const data = await request(`/account/${accountId}/projects_list/`, { label: 'Project list lookup' });
  if (Array.isArray(data?.data)) return data.data;
  if (data?.data && typeof data.data === 'object') {
    return Object.entries(data.data).map(([id, name]) => ({ id, name }));
  }
  if (Array.isArray(data?.projects)) return data.projects;
  if (data?.projects && typeof data.projects === 'object') {
    return Object.entries(data.projects).map(([id, name]) => ({ id, name }));
  }
  if (Array.isArray(data)) return data;
  return [];
}

export async function getMentions(projectId, dateFrom, dateTo, options = {}) {
  if (!projectId) throw new Brand24RestError('Monitor was not found.');
  const limit = Math.min(Number(options.limit) || MAX_LIMIT, MAX_LIMIT);
  const maxMentions = Number(options.maxMentions) || Infinity;
  const logger = options.logger || console;
  const requestLabel = `Mentions page for project ${projectId}`;
  const mentions = [];
  let cursor = options.cursor || null;
  let pages = 0;
  let capped = false;
  let hasMore = false;

  logger.info?.('[Tracking getMentions] start', { projectId, dateFrom, dateTo, limit, maxPages: options.maxPages || 1000, maxMentions: Number.isFinite(maxMentions) ? maxMentions : 'none' });
  do {
    const pageNumber = pages + 1;
    logger.info?.('[Tracking getMentions] page start', { projectId, dateFrom, dateTo, page: pageNumber, cursor: cursor ? 'present' : 'initial' });
    const data = await request(`/project/${projectId}/mentions`, {
      params: {
        date_from: dateFrom,
        date_to: dateTo,
        limit,
        cursor,
        sentiment: Array.isArray(options.sentiment) ? options.sentiment.join(',') : options.sentiment,
        category: Array.isArray(options.category) ? options.category.join(',') : options.category,
      },
      timeoutMs: options.timeoutMs,
      label: `${requestLabel} ${pageNumber}`,
    });
    const pageMentions = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.mentions)
        ? data.mentions
        : Array.isArray(data?.message?.results)
          ? data.message.results
          : Array.isArray(data?.message?.mentions)
            ? data.message.mentions
            : [];
    mentions.push(...pageMentions);
    if (mentions.length >= maxMentions) {
      mentions.length = maxMentions;
      capped = true;
    }
    cursor = data?.cursor || data?.message?.cursor || null;
    pages += 1;
    hasMore = !!(data?.has_more_mentions ?? data?.message?.has_more_mentions);
    logger.info?.('[Tracking getMentions] page done', {
      projectId,
      dateFrom,
      dateTo,
      page: pages,
      pageMentions: pageMentions.length,
      totalMentions: mentions.length,
      hasMore,
      capped,
      nextCursor: cursor ? 'present' : 'none',
    });
    if (capped) break;
    if (!hasMore) break;
  } while (cursor && pages < (options.maxPages || 1000));

  if (cursor && pages >= (options.maxPages || 1000)) {
    logger.warn?.('[Tracking getMentions] stopped at max pages', { projectId, dateFrom, dateTo, pages, mentions: mentions.length });
  }
  logger.info?.('[Tracking getMentions] done', { projectId, dateFrom, dateTo, pages, mentions: mentions.length, capped, hasMore });
  return { mentions, pages, cursor, capped, hasMore };
}

export async function getMentionsReach(projectId, dateFrom, dateTo, options = {}) {
  if (!projectId) throw new Brand24RestError('Monitor was not found.');
  const logger = options.logger || console;
  logger.info?.('[Tracking getMentionsReach] start', { projectId, dateFrom, dateTo });
  const data = await request(`/project/${projectId}/mentions/reach`, {
    params: {
      date_from: dateFrom,
      date_to: dateTo,
    },
    timeoutMs: options.timeoutMs,
    label: `Mentions reach for project ${projectId}`,
  });
  const payload = data?.data || data?.message || {};
  const socialMediaReachTotal = Number(payload.social_media_reach_total) || 0;
  const nonSocialMediaReachTotal = Number(payload.non_social_media_reach_total) || 0;
  logger.info?.('[Tracking getMentionsReach] done', {
    projectId,
    dateFrom,
    dateTo,
    socialMediaReachTotal,
    nonSocialMediaReachTotal,
    totalReach: socialMediaReachTotal + nonSocialMediaReachTotal,
  });
  return {
    socialMediaReach: payload.social_media_reach || {},
    nonSocialMediaReach: payload.non_social_media_reach || {},
    socialMediaReachTotal,
    nonSocialMediaReachTotal,
    totalReach: socialMediaReachTotal + nonSocialMediaReachTotal,
  };
}

export async function getAiSummary(projectId, dateFrom, dateTo) {
  return request(`/project/${projectId}/ai-summary`, {
    params: { date_from: dateFrom, date_to: dateTo },
  });
}

export async function getAiInsights(projectId, dateFrom, dateTo) {
  return request(`/project/${projectId}/ai-insights`, {
    params: { date_from: dateFrom, date_to: dateTo },
  });
}

export function toClientSafeError(error) {
  if (error instanceof Brand24RestError) {
    if (error.code === 'TIMEOUT') return error.message;
    if (error.status >= 500) return 'Tracking source lookup failed. Check BRAND24_ACCOUNT_ID and try again.';
    return error.message;
  }
  return 'Tracking service is temporarily unavailable. Please try again in a moment.';
}
