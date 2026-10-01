const URL_RE = /^https?:\/\/[^\s]+$/i;

export const TOPICAL_STANCES = ['complaint', 'advice-seeking', 'advice-giving', 'neutral', 'news'];
export const TOPICAL_SENTIMENTS = ['positive', 'neutral', 'negative', 'unknown'];

export function cleanList(value) {
  return (Array.isArray(value) ? value : String(value || '').split(/[\n,]/))
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

export function validateTopicalScanInput(input) {
  const errors = [];
  if (!String(input?.projectId || '').trim()) errors.push('Choose an existing monitoring project.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.dateFrom || '')) errors.push('Enter a valid start date.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.dateTo || '')) errors.push('Enter a valid end date.');
  if (input?.dateFrom && input?.dateTo && input.dateFrom > input.dateTo) errors.push('Start date must be on or before end date.');
  if (!Array.isArray(input?.themes) || input.themes.length < 1 || input.themes.length > 6) errors.push('Add between 1 and 6 themes.');
  (input?.themes || []).forEach((theme, index) => {
    if (!String(theme?.label || '').trim()) errors.push(`Theme ${index + 1} needs a label.`);
    if (!String(theme?.description || '').trim()) errors.push(`Theme ${index + 1} needs a description.`);
    if (!cleanList(theme?.phrases).length) errors.push(`Theme ${index + 1} needs at least one phrase.`);
  });
  return errors;
}

export function mentionText(mention) {
  return [mention?.title, mention?.content, mention?.text, mention?.description, mention?.snippet]
    .filter(Boolean).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mentionDate(mention) {
  const raw = mention?.published_at || mention?.publishedAt || mention?.date || mention?.created_at || mention?.createdAt || '';
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : '';
}

export function mentionPlatform(mention) {
  return String(mention?.source || mention?.category || mention?.platform || mention?.domain || 'Unknown').trim() || 'Unknown';
}

export function mentionReach(mention) {
  return Number(mention?.reach || mention?.estimated_reach || mention?.estimatedReach || mention?.viewsCount || mention?.followersCount || 0) || 0;
}

export function flagMentions(mentions, themes, exclusions = []) {
  const excluded = cleanList(exclusions).map(value => value.toLocaleLowerCase());
  return mentions.flatMap((mention, mentionIndex) => {
    const text = mentionText(mention);
    const lower = text.toLocaleLowerCase();
    if (!text || excluded.some(term => lower.includes(term))) return [];
    const candidates = themes
      .map((theme, themeIndex) => ({
        themeIndex,
        phrases: cleanList(theme.phrases).filter(phrase => lower.includes(phrase.toLocaleLowerCase())),
      }))
      .filter(candidate => candidate.phrases.length);
    return candidates.length ? [{
      id: `m${mentionIndex + 1}`,
      text: text.slice(0, 1800),
      date: mentionDate(mention),
      platform: mentionPlatform(mention),
      reach: mentionReach(mention),
      sourceSentiment: mention?.sentiment || '',
      url: URL_RE.test(mention?.url || mention?.link || '') ? (mention.url || mention.link) : '',
      candidateThemeIndexes: candidates.map(candidate => candidate.themeIndex),
      matchedPhrases: candidates.flatMap(candidate => candidate.phrases),
    }] : [];
  });
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function deterministicSample(items, limit = 20) {
  if (items.length <= limit) return items;
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * stride)]);
}

export function summarizeClassifications({ mentions, flagged, classifications, themes, totalReach = 0 }) {
  const flaggedById = new Map(flagged.map(item => [item.id, item]));
  const valid = classifications.flatMap(item => {
    const source = flaggedById.get(String(item?.id || ''));
    if (!source || item?.relevant === false) return [];
    const themeIndexes = (Array.isArray(item.themeIndexes) ? item.themeIndexes : [])
      .map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < themes.length);
    if (!themeIndexes.length) return [];
    return [{
      ...source,
      themeIndexes: [...new Set(themeIndexes)],
      stance: TOPICAL_STANCES.includes(item.stance) ? item.stance : 'neutral',
      sentiment: TOPICAL_SENTIMENTS.includes(item.sentiment) ? item.sentiment : 'unknown',
      paraphrase: String(item.paraphrase || 'Relevant monitored mention.').replace(/@[\w.-]+/g, '[handle removed]').slice(0, 280),
    }];
  });
  const uniqueRelevant = new Set(valid.map(item => item.id)).size;
  const monthlyBase = [...new Set(mentions.map(mentionDate).filter(Boolean).map(date => date.slice(0, 7)))].sort();
  const themeResults = themes.map((theme, themeIndex) => {
    const items = valid.filter(item => item.themeIndexes.includes(themeIndex));
    const monthly = Object.fromEntries(monthlyBase.map(month => [month, 0]));
    items.forEach(item => { if (item.date) monthly[item.date.slice(0, 7)] = (monthly[item.date.slice(0, 7)] || 0) + 1; });
    return {
      label: theme.label,
      description: theme.description,
      count: items.length,
      percentOfAll: Number(((items.length / Math.max(mentions.length, 1)) * 100).toFixed(2)),
      reach: items.reduce((sum, item) => sum + item.reach, 0),
      monthly,
      platforms: countBy(items, item => item.platform),
      stances: countBy(items, item => item.stance),
      sentiments: countBy(items, item => item.sentiment),
      reviewSample: deterministicSample(items, 20).map(item => ({
        id: item.id, date: item.date, platform: item.platform, stance: item.stance,
        sentiment: item.sentiment, paraphrase: item.paraphrase, url: item.url,
      })),
    };
  });
  return {
    baseline: { totalMentions: mentions.length, totalReach, collectionsRelatedMentions: uniqueRelevant, collectionsShare: Number(((uniqueRelevant / Math.max(mentions.length, 1)) * 100).toFixed(2)) },
    themeResults,
  };
}

export function extractJson(text, fallback = null) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const firstArray = cleaned.indexOf('['), lastArray = cleaned.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    try { return JSON.parse(cleaned.slice(firstArray, lastArray + 1)); } catch {}
  }
  const firstObject = cleaned.indexOf('{'), lastObject = cleaned.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    try { return JSON.parse(cleaned.slice(firstObject, lastObject + 1)); } catch {}
  }
  return fallback;
}

export function sanitizeDirectionalFindings(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let discarded = 0;
  const kept = list.flatMap(finding => {
    const url = String(finding?.url || '').trim();
    if (!URL_RE.test(url)) { discarded += 1; return []; }
    return [{
      url,
      platform: String(finding.platform || 'Web').slice(0, 60),
      date: String(finding.date || '').slice(0, 32),
      paraphrase: String(finding.paraphrase || '').replace(/@[\w.-]+/g, '[handle removed]').slice(0, 400),
      stance: TOPICAL_STANCES.includes(finding.stance) ? finding.stance : 'neutral',
    }];
  });
  return { findings: kept, discarded };
}
