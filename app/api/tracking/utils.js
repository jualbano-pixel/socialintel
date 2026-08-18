import { listProjects, getMentions, getMentionsReach } from '../../../lib/brand24-rest';
import { getFilteredProjectSources } from '../../../lib/brand24-mcp';

const SOURCE_COLORS = ['#2f86de', '#dc37a5', '#e74c3c', '#f78fb3', '#33b6b4', '#7155d9', '#f4d03f', '#7ed6df'];
const SOCIAL_CATEGORIES = new Set(['facebook', 'instagram', 'tiktok', 'twitter', 'x', 'youtube', 'reddit', 'socialmedia']);
const SNAPSHOT_STAGE_TIMEOUT_MS = 120000;
const LIVE_MENTION_SAMPLE_LIMIT = 2500;

export function brandKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bphilippines\b/g, '')
    .replace(/\bph\b/g, '')
    .replace(/\bvideo\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function itemName(project) {
  return project?.name || project?.project_name || project?.projectName || project?.title || '';
}

export function itemId(project) {
  return project?.id || project?.project_id || project?.projectId || project?.project_id_string;
}

export function resolveProject(projects, brand, aliases = []) {
  const keys = [brand, ...aliases].map(brandKey).filter(Boolean);
  const scored = projects
    .map(project => {
      const projectKey = brandKey(itemName(project));
      const score = keys.reduce((best, key) => {
        if (!key || !projectKey) return best;
        if (projectKey === key) return Math.max(best, 100);
        if (projectKey.includes(key)) return Math.max(best, 80);
        if (key.includes(projectKey)) return Math.max(best, 60);
        return best;
      }, 0);
      return { project, projectKey, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.project || null;
}

export function projectDiagnostics(projects, brand, aliases = []) {
  const keys = [brand, ...aliases].map(brandKey).filter(Boolean);
  return projects.map(project => {
    const projectKey = brandKey(itemName(project));
    return {
      id: itemId(project),
      name: itemName(project),
      normalizedName: projectKey,
      matches: keys.filter(key => projectKey === key || projectKey.includes(key) || key.includes(projectKey)),
    };
  });
}

function fieldNumber(item, fields) {
  for (const field of fields) {
    const value = Number(item?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function sourceLabel(mention) {
  const raw = mention?.category || mention?.source || mention?.domain || mention?.media_type || mention?.platform || mention?.host?.name || 'web';
  const normalized = String(raw).toLowerCase();
  if (normalized.includes('facebook')) return 'Facebook';
  if (normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('tiktok')) return 'TikTok';
  if (normalized === 'x' || normalized.includes('twitter') || normalized.includes('x.com')) return 'X';
  if (normalized.includes('youtube') || normalized.includes('video')) return 'Videos';
  if (normalized.includes('news')) return 'News';
  if (normalized.includes('blog')) return 'Blogs';
  if (normalized.includes('reddit')) return 'Reddit';
  return String(raw).replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim() || 'Web';
}

function sentimentLabel(value) {
  if (value === 1 || value === '1') return 'Positive';
  if (value === -1 || value === '-1') return 'Negative';
  if (value === 0 || value === '0') return 'Neutral';
  const sentiment = String(value || '').toLowerCase();
  if (sentiment.includes('pos')) return 'Positive';
  if (sentiment.includes('neg')) return 'Negative';
  return 'Neutral';
}

function mentionDate(mention) {
  const raw = mention?.date || mention?.published_at || mention?.publishedAt || mention?.created_at || mention?.createdAt || mention?.createdDate;
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw).slice(0, 10) : date.toISOString().slice(0, 10);
}

function mentionCountry(mention) {
  const value = mention?.country
    || mention?.country_code
    || mention?.countryCode
    || mention?.geo?.country
    || mention?.location?.country
    || mention?.author?.country
    || '';
  return String(value).toLowerCase().trim();
}

function isPhilippinesCountry(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return ['ph', 'phl', 'philippines', 'philippine', 'the philippines', 'pilipinas'].includes(normalized);
}

function applyCountryFilter(mentions, countryFilter) {
  if (countryFilter !== 'PH') {
    return {
      mentions,
      countryFilterApplied: false,
      countryFilterRequested: countryFilter || '',
      unfilteredMentions: mentions.length,
      filteredOutMentions: 0,
      mentionsWithCountry: mentions.filter(mention => mentionCountry(mention)).length,
    };
  }
  const mentionsWithCountry = mentions.filter(mention => mentionCountry(mention)).length;
  if (!mentionsWithCountry) {
    return {
      mentions,
      countryFilterApplied: false,
      countryFilterRequested: 'PH',
      countryFilterReason: 'No country field was present on returned mention records.',
      unfilteredMentions: mentions.length,
      filteredOutMentions: 0,
      mentionsWithCountry,
    };
  }
  const filtered = mentions.filter(mention => isPhilippinesCountry(mentionCountry(mention)));
  return {
    mentions: filtered,
    countryFilterApplied: true,
    countryFilterRequested: 'PH',
    unfilteredMentions: mentions.length,
    filteredOutMentions: mentions.length - filtered.length,
    mentionsWithCountry,
  };
}

export function summarizeMentions({ brand, project, mentions, reach, dateFrom, dateTo, pages, countryFilter, mentionPull = {} }) {
  const rawPulledMentions = mentions.length;
  mentions = mentions.filter(mention => {
    const date = mentionDate(mention);
    if (!date) return true;
    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  });
  const countryFilterDiagnostics = applyCountryFilter(mentions, countryFilter);
  mentions = countryFilterDiagnostics.mentions;
  const totalMentions = mentions.length;
  const totalReach = Number(reach?.totalReach) || 0;
  const socialMediaReach = Number(reach?.socialMediaReachTotal) || 0;
  const nonSocialMediaReach = Number(reach?.nonSocialMediaReachTotal) || 0;
  const sentiment = { Positive: 0, Negative: 0, Neutral: 0 };
  const sourceCounts = new Map();
  const daily = new Map();

  mentions.forEach(mention => {
    sentiment[sentimentLabel(mention.sentiment)] += 1;
    const label = sourceLabel(mention);
    sourceCounts.set(label, (sourceCounts.get(label) || 0) + 1);
    const day = mentionDate(mention);
    if (day) daily.set(day, (daily.get(day) || 0) + 1);
  });

  const sourceCategories = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count], index) => ({
      name,
      count,
      pct: Number(((count / Math.max(totalMentions, 1)) * 100).toFixed(1)),
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    }));

  const socialMentions = mentions.filter(mention => {
    const category = String(mention?.category || '').toLowerCase();
    return SOCIAL_CATEGORIES.has(category) || [...SOCIAL_CATEGORIES].some(token => category.includes(token));
  }).length;

  const topMentions = [...mentions]
    .sort((a, b) => fieldNumber(b, ['reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']) - fieldNumber(a, ['reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']))
    .slice(0, 6)
    .map((mention, index) => {
      const source = sourceLabel(mention);
      const title = mention.title || mention.author || mention.domain || mention.url || `${source} mention`;
      const reach = fieldNumber(mention, ['reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']);
      return {
        source,
        title: String(title).slice(0, 140),
        meta: [reach ? `${reach.toLocaleString()} reach` : '', mentionDate(mention)].filter(Boolean).join(' · '),
        sentiment: sentimentLabel(mention.sentiment),
        text: String(mention.content || mention.text || mention.description || mention.snippet || title).slice(0, 260),
        icon: source.slice(0, 2).toUpperCase(),
        color: SOURCE_COLORS[index % SOURCE_COLORS.length],
        url: mention.url || mention.link || '',
      };
    });

  const topSource = sourceCategories[0];
  return {
    found: true,
    brand,
    projectName: itemName(project),
    projectId: itemId(project),
    totalMentions,
    totalReach,
    socialMediaReach,
    nonSocialMediaReach,
    positiveMentions: sentiment.Positive,
    negativeMentions: sentiment.Negative,
    neutralMentions: sentiment.Neutral,
    dailyStats: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, mentions]) => ({ date, mentions })),
    sourceCategories,
    topMentions,
    sourceNarrative: topSource
      ? `${topSource.name} leads the source mix at ${topSource.pct}% of tracked mentions; ${Math.round((socialMentions / Math.max(totalMentions, 1)) * 100)}% of mentions came from social channels.`
      : 'No source mix was available for this tracking period.',
    diagnostics: {
      dateFrom,
      dateTo,
      pages,
      pulledMentions: mentions.length,
      rawPulledMentions,
      mentionSampleLimit: mentionPull.maxMentions || '',
      mentionSampleCapped: !!mentionPull.capped,
      hasMoreMentionPages: !!mentionPull.hasMore,
      socialMediaReach,
      nonSocialMediaReach,
      countryFilterRequested: countryFilterDiagnostics.countryFilterRequested,
      countryFilterApplied: countryFilterDiagnostics.countryFilterApplied,
      countryFilterReason: countryFilterDiagnostics.countryFilterReason,
      unfilteredMentions: countryFilterDiagnostics.unfilteredMentions,
      filteredOutMentions: countryFilterDiagnostics.filteredOutMentions,
      mentionsWithCountry: countryFilterDiagnostics.mentionsWithCountry,
      reachCountryFiltered: false,
      reachFallbackReason: reach?.fallbackReason || '',
    },
  };
}

function summarizeSourceSample({ mentions, brand, project, country, language }) {
  const sourceCounts = new Map();
  mentions.forEach(mention => {
    const label = sourceLabel(mention);
    sourceCounts.set(label, (sourceCounts.get(label) || 0) + 1);
  });
  const sourceCategories = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count], index) => ({
      name,
      count,
      pct: Number(((count / Math.max(mentions.length, 1)) * 100).toFixed(1)),
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    }));
  const topMentions = [...mentions]
    .sort((a, b) => fieldNumber(b, ['viewsCount', 'followersCount', 'reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']) - fieldNumber(a, ['viewsCount', 'followersCount', 'reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']))
    .slice(0, 6)
    .map((mention, index) => {
      const source = sourceLabel(mention);
      const reach = fieldNumber(mention, ['viewsCount', 'followersCount', 'reach', 'estimated_reach', 'estimatedReach', 'engagement', 'interactions']);
      return {
        source,
        title: String(mention.title || mention.author?.name || mention.url || `${source} mention`).slice(0, 140),
        meta: [reach ? `${reach.toLocaleString()} visible reach` : '', mentionDate(mention), mention.country ? `Country ${mention.country}` : ''].filter(Boolean).join(' · '),
        sentiment: sentimentLabel(mention.sentiment),
        text: String(mention.content || mention.text || mention.description || mention.snippet || mention.title || '').replace(/<[^>]+>/g, '').slice(0, 260),
        icon: source.slice(0, 2).toUpperCase(),
        color: SOURCE_COLORS[index % SOURCE_COLORS.length],
        url: mention.url || mention.link || '',
      };
    });
  const topSource = sourceCategories[0];
  return {
    sourceCategories,
    topMentions,
    sourceNarrative: topSource
      ? `${topSource.name} leads the ${country}-filtered source sample at ${topSource.pct}% of visible mentions. Reach remains the full project reach because filtered reach is not exposed.`
      : `No ${country}-filtered source sample was available for ${brand}.`,
    diagnostics: {
      mcpSourceFilterApplied: true,
      mcpSourceFilterCountry: country,
      mcpSourceFilterLanguage: language,
      mcpSourceSampleRecords: mentions.length,
      mcpSourceSampleLimit: 100,
      mcpSourceSampleLimited: true,
      mcpSourceProjectName: itemName(project),
      mcpReachFiltered: false,
    },
  };
}

export async function getLiveSnapshot({ accountId, brand, aliases = [], projectId: storedProjectId = '', projectName: storedProjectName = '', dateFrom, dateTo, filters = {}, countryFilter = '', sourceFilter = null }) {
  const knownProjectId = String(storedProjectId || '').trim();
  let projects = [];
  let project = knownProjectId
    ? { id: knownProjectId, name: storedProjectName || brand }
    : null;
  if (!project) {
    console.info('[Tracking live snapshot] project list start', { brand, dateFrom, dateTo, countryFilter });
    projects = await listProjects(accountId);
    console.info('[Tracking live snapshot] project list done', { brand, dateFrom, dateTo, projectCount: projects.length });
    project = resolveProject(projects, brand, aliases);
  }
  console.info('[Tracking live snapshot] project resolution', {
    brand,
    dateFrom,
    dateTo,
    countryFilter,
    usedStoredProjectId: !!knownProjectId,
    projectCount: projects.length,
    matchedProject: project ? { id: itemId(project), name: itemName(project) } : null,
    candidates: knownProjectId ? [] : projectDiagnostics(projects, brand, aliases).filter(item => item.matches.length).slice(0, 8),
  });
  if (!project) {
    return {
      found: false,
      searchedFor: brand,
      availableProjects: projects.map(itemName).filter(Boolean),
      totalMentions: 0,
      totalReach: 0,
      positiveMentions: 0,
      negativeMentions: 0,
      neutralMentions: 0,
      dailyStats: [],
      sourceCategories: [],
      topMentions: [],
    sourceNarrative: '',
      diagnostics: {
        dateFrom,
        dateTo,
        countryFilterRequested: countryFilter || '',
      },
    };
  }

  const projectId = itemId(project);
  const projectName = itemName(project);
  let mentionsResult;
  let reach;
  const mentionSampleLimit = LIVE_MENTION_SAMPLE_LIMIT;
  const filteredSourcePromise = sourceFilter?.type === 'mcp' && sourceFilter.country
    ? (async () => {
      try {
        console.info('[Tracking live snapshot] MCP source filter start', { brand, projectId, projectName, dateFrom, dateTo, sourceFilter });
        const sourceSample = await getFilteredProjectSources({
          projectId,
          dateFrom,
          dateTo,
          country: sourceFilter.country,
          language: sourceFilter.language || 'en',
        });
        console.info('[Tracking live snapshot] MCP source filter done', {
          brand,
          projectId,
          projectName,
          records: sourceSample.recordCount,
          country: sourceSample.country,
          language: sourceSample.language,
        });
        return { sourceSample };
      } catch (error) {
        console.warn('[Tracking live snapshot] MCP source filter unavailable', {
          brand,
          projectId,
          projectName,
          message: error.message,
        });
        return { error };
      }
    })()
    : null;
  const reachPromise = (async () => {
    try {
      console.info('[Tracking live snapshot] reach stage start', { brand, projectId, projectName, dateFrom, dateTo });
      const reachResult = await getMentionsReach(projectId, dateFrom, dateTo, {
        timeoutMs: SNAPSHOT_STAGE_TIMEOUT_MS,
        logger: console,
      });
      console.info('[Tracking live snapshot] reach stage done', {
        brand,
        projectId,
        projectName,
        dateFrom,
        dateTo,
        totalReach: reachResult.totalReach,
        socialMediaReach: reachResult.socialMediaReachTotal,
        nonSocialMediaReach: reachResult.nonSocialMediaReachTotal,
      });
      return { reach: reachResult };
    } catch (error) {
      console.error('[Tracking live snapshot] reach stage error', {
        brand,
        projectId,
        projectName,
        dateFrom,
        dateTo,
        message: error.message,
        code: error.code,
        status: error.status,
      });
      return { error };
    }
  })();

  try {
    console.info('[Tracking live snapshot] mentions stage start', { brand, projectId, projectName, dateFrom, dateTo });
    mentionsResult = await getMentions(projectId, dateFrom, dateTo, {
      ...filters,
      timeoutMs: SNAPSHOT_STAGE_TIMEOUT_MS,
      maxMentions: mentionSampleLimit,
      logger: console,
    });
    console.info('[Tracking live snapshot] mentions stage done', {
      brand,
      projectId,
      projectName,
      dateFrom,
      dateTo,
      pages: mentionsResult.pages,
      mentions: mentionsResult.mentions.length,
      capped: mentionsResult.capped,
      hasMore: mentionsResult.hasMore,
    });
  } catch (error) {
    console.error('[Tracking live snapshot] mentions stage error', {
      brand,
      projectId,
      projectName,
      dateFrom,
      dateTo,
      message: error.message,
      code: error.code,
      status: error.status,
    });
    throw error;
  }

  const reachResult = await reachPromise;
  if (reachResult.error) throw reachResult.error;
  reach = reachResult.reach;

  const { mentions, pages } = mentionsResult;
  console.info('[Tracking live snapshot] mentions pulled', {
    brand,
    projectId,
    projectName,
    dateFrom,
    dateTo,
    pages,
    mentions: mentions.length,
    capped: mentionsResult.capped,
    hasMoreMentionPages: mentionsResult.hasMore,
    totalReach: reach.totalReach,
    socialMediaReach: reach.socialMediaReachTotal,
    nonSocialMediaReach: reach.nonSocialMediaReachTotal,
    countryFilter,
  });
  const snapshot = summarizeMentions({
    brand,
    project,
    mentions,
    reach,
    dateFrom,
    dateTo,
    pages,
    countryFilter,
    mentionPull: {
      maxMentions: mentionSampleLimit,
      capped: mentionsResult.capped,
      hasMore: mentionsResult.hasMore,
    },
  });
  if (sourceFilter?.type === 'mcp' && sourceFilter.country) {
    const sourceResult = filteredSourcePromise ? await filteredSourcePromise : null;
    if (sourceResult?.sourceSample) {
      const sourceSample = sourceResult.sourceSample;
      const sampleSummary = summarizeSourceSample({
        mentions: sourceSample.mentions,
        brand,
        project,
        country: sourceSample.country,
        language: sourceSample.language,
      });
      return {
        ...snapshot,
        sourceCategories: sampleSummary.sourceCategories,
        topMentions: sampleSummary.topMentions,
        sourceNarrative: sampleSummary.sourceNarrative,
        diagnostics: {
          ...snapshot.diagnostics,
          ...sampleSummary.diagnostics,
          mcpSourceToolName: sourceSample.toolName,
        },
      };
    }
    return {
      ...snapshot,
      diagnostics: {
        ...snapshot.diagnostics,
        mcpSourceFilterApplied: false,
        mcpSourceFilterError: sourceResult?.error?.message || 'MCP source filter was unavailable.',
      },
    };
  }
  return snapshot;
}
