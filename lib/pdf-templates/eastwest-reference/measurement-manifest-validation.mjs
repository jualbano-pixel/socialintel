const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);

function datesBetween(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function workbookProvenanceIssues(reference, path, deckHash) {
  const issues = [];
  if (!reference?.slide || !reference?.chart || !reference?.workbookPath || !reference?.workbookSha256) {
    issues.push({ code: 'missing-workbook-provenance', path });
  }
  if (reference?.deck?.sha256 !== deckHash) {
    issues.push({ code: 'workbook-deck-hash-mismatch', path });
  }
  return issues;
}

function validatePeriodDataset(manifest, periodKey) {
  const issues = [];
  const period = manifest.reportingPeriods?.[periodKey];
  const dataset = manifest.periods?.[periodKey];
  if (!period || !dataset) return [{ code: 'missing-period-dataset', path: `periods.${periodKey}` }];
  if (period.state !== dataset.state) issues.push({ code: 'period-state-mismatch', path: `periods.${periodKey}` });
  if (dataset.state !== 'verified') return issues;

  const expectedDates = datesBetween(period.startDate, period.endDate);
  const mentionDates = dataset.mentions?.daily?.map(point => point.date) || [];
  const reachDates = dataset.reach?.daily?.map(point => point.date) || [];
  if (JSON.stringify(mentionDates) !== JSON.stringify(expectedDates)) issues.push({ code: 'mention-period-mismatch', path: `periods.${periodKey}.mentions.daily` });
  if (JSON.stringify(reachDates) !== JSON.stringify(expectedDates)) issues.push({ code: 'reach-period-mismatch', path: `periods.${periodKey}.reach.daily` });
  if (sum(dataset.mentions.daily.map(point => point.value)) !== dataset.mentions.total) issues.push({ code: 'mention-total-mismatch', path: `periods.${periodKey}.mentions` });
  if (sum(dataset.reach.daily.map(point => point.value)) !== dataset.reach.total) issues.push({ code: 'reach-total-mismatch', path: `periods.${periodKey}.reach` });
  if (dataset.mentions.total !== dataset.denominator) issues.push({ code: 'period-denominator-mismatch', path: `periods.${periodKey}.denominator` });
  if (dataset.mentions.social + dataset.mentions.nonSocial !== dataset.mentions.total) issues.push({ code: 'mention-split-mismatch', path: `periods.${periodKey}.mentions` });

  const sentiment = dataset.sentiment;
  if (sentiment.denominator !== dataset.denominator) issues.push({ code: 'sentiment-denominator-mismatch', path: `periods.${periodKey}.sentiment` });
  if (sentiment.positive.count + sentiment.negative.count + sentiment.neutral.count !== sentiment.denominator) issues.push({ code: 'sentiment-total-mismatch', path: `periods.${periodKey}.sentiment` });
  if (sum(sentiment.dailyPositive) !== sentiment.positive.count) issues.push({ code: 'positive-series-mismatch', path: `periods.${periodKey}.sentiment.dailyPositive` });
  if (sum(sentiment.dailyNegative) !== sentiment.negative.count) issues.push({ code: 'negative-series-mismatch', path: `periods.${periodKey}.sentiment.dailyNegative` });
  if (sentiment.dailyNeutral?.state !== 'unavailable' || sentiment.dailyNeutral?.points?.length) issues.push({ code: 'daily-neutral-must-remain-unavailable', path: `periods.${periodKey}.sentiment.dailyNeutral` });

  const sourceTypes = dataset.sourceTypes;
  if (sourceTypes.denominator !== dataset.denominator) issues.push({ code: 'source-denominator-mismatch', path: `periods.${periodKey}.sourceTypes` });
  if (sum(sourceTypes.items.map(item => item.count)) !== sourceTypes.denominator) issues.push({ code: 'source-total-mismatch', path: `periods.${periodKey}.sourceTypes` });

  const deckHash = manifest.source.deck.sha256;
  [
    [dataset.mentions.provenance, `periods.${periodKey}.mentions.provenance`],
    [dataset.reach.provenance, `periods.${periodKey}.reach.provenance`],
    [sentiment.provenance, `periods.${periodKey}.sentiment.provenance`],
    [sentiment.dailyPositiveProvenance, `periods.${periodKey}.sentiment.dailyPositiveProvenance`],
    [sentiment.dailyNegativeProvenance, `periods.${periodKey}.sentiment.dailyNegativeProvenance`],
    [sourceTypes.provenance, `periods.${periodKey}.sourceTypes.provenance`],
  ].forEach(([reference, path]) => issues.push(...workbookProvenanceIssues(reference, path, deckHash)));
  return issues;
}

function validateSov(manifest) {
  const issues = [];
  const sov = manifest.sov?.current;
  const currentPeriod = manifest.reportingPeriods?.current;
  if (!sov || sov.state !== 'verified') return [{ code: 'missing-current-sov', path: 'sov.current' }];
  if (sov.periodKey !== currentPeriod.key) issues.push({ code: 'sov-period-mismatch', path: 'sov.current.periodKey' });
  if (JSON.stringify(sov.cohort) !== JSON.stringify(sov.competitors.map(item => item.name))) issues.push({ code: 'sov-cohort-mismatch', path: 'sov.current.cohort' });
  if (sov.compatibleDenominator?.state !== 'unavailable' || sov.compatibleDenominator?.value !== null) issues.push({ code: 'sov-denominator-must-remain-unavailable', path: 'sov.current.compatibleDenominator' });

  sov.competitors.forEach((competitor, index) => {
    const path = `sov.current.competitors.${index}`;
    if (competitor.state === 'unavailable') {
      ['mentions', 'reach', 'sentiment', 'dailyMentions', 'dailyReach', 'dailyPositive', 'dailyNegative', 'sourceTypes'].forEach(key => {
        if (competitor[key]?.state !== 'unavailable' || competitor[key]?.value !== null || competitor[key]?.clientDisplay !== 'Data unavailable') {
          issues.push({ code: 'invalid-competitor-unavailable-state', path: `${path}.${key}` });
        }
      });
      return;
    }
    if (sum(competitor.dailyMentions) !== competitor.mentions) issues.push({ code: 'competitor-mention-total-mismatch', path });
    if (sum(competitor.dailyReach) !== competitor.reach) issues.push({ code: 'competitor-reach-total-mismatch', path });
    if (sum(competitor.dailyPositive) !== competitor.sentiment.positive) issues.push({ code: 'competitor-positive-total-mismatch', path });
    if (sum(competitor.dailyNegative) !== competitor.sentiment.negative) issues.push({ code: 'competitor-negative-total-mismatch', path });
    if (competitor.sentiment.positive + competitor.sentiment.negative + competitor.sentiment.neutral !== competitor.mentions) issues.push({ code: 'competitor-sentiment-total-mismatch', path });
    if (competitor.sourceTypes.length !== sov.sourceTypeOrder.length) issues.push({ code: 'competitor-source-shape-mismatch', path });
    const availableSourceTotal = sum(competitor.sourceTypes.filter(value => typeof value === 'number'));
    if (availableSourceTotal !== competitor.mentions) issues.push({ code: 'competitor-source-total-mismatch', path });
  });

  const client = sov.competitors.find(item => item.role === 'client');
  const current = manifest.periods.current;
  if (!client || client.mentions !== current.mentions.total || client.reach !== current.reach.total) issues.push({ code: 'client-sov-current-mismatch', path: 'sov.current' });

  Object.entries(sov.provenance || {}).forEach(([key, reference]) => {
    issues.push(...workbookProvenanceIssues(reference, `sov.current.provenance.${key}`, manifest.source.deck.sha256));
  });
  return issues;
}

export function validateMeasurementManifest(manifest, { requireImmutable = true } = {}) {
  const issues = [];
  if (manifest?.schemaVersion !== 'signal-intel-measurement-manifest-v1') issues.push({ code: 'invalid-manifest-schema', path: 'schemaVersion' });
  if (manifest?.measurementOnly !== true) issues.push({ code: 'manifest-not-measurement-only', path: 'measurementOnly' });
  if (!manifest?.source?.deck?.sha256) issues.push({ code: 'missing-deck-hash', path: 'source.deck.sha256' });
  if (manifest?.source?.scope?.philippinesOnly !== false || manifest?.source?.scope?.key !== 'broader_or_unfiltered') issues.push({ code: 'invalid-broad-scope', path: 'source.scope' });
  if (!['SI-PDF-733', 'TRACK-723', 'B24-PH-91'].every(id => manifest?.source?.excludedSnapshots?.includes(id))) issues.push({ code: 'missing-snapshot-exclusion', path: 'source.excludedSnapshots' });
  if (requireImmutable && !isDeepFrozen(manifest)) issues.push({ code: 'manifest-not-deep-frozen', path: 'manifest' });

  issues.push(...validatePeriodDataset(manifest, 'current'));
  issues.push(...validatePeriodDataset(manifest, 'previousWeek'));
  ['previousFullMonth', 'ytd'].forEach(key => {
    if (manifest?.periods?.[key]?.state !== 'unavailable' || manifest?.reportingPeriods?.[key]?.state !== 'unavailable') {
      issues.push({ code: 'unsupported-period-must-remain-unavailable', path: `periods.${key}` });
    }
  });
  issues.push(...validateSov(manifest));

  return { ok: issues.length === 0, issues };
}

export function assertMeasurementManifest(manifest, options = {}) {
  const result = validateMeasurementManifest(manifest, options);
  if (!result.ok) {
    const detail = result.issues.map(item => `${item.code}:${item.path}`).join(', ');
    const error = new Error(`Invalid Signal Intel measurement manifest: ${detail}`);
    error.validation = result;
    throw error;
  }
  return result;
}
