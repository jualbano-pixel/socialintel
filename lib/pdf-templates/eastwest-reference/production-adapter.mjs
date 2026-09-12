import { CONTENT_STATES } from './validation.mjs';
import { assertMeasurementManifest } from './measurement-manifest-validation.mjs';

const status = CONTENT_STATES;

function numberOrUnavailable(value, provenance = null, displayValue = '') {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return {
      state: displayValue ? status.awaitingVerification : status.unavailable,
      value: null,
      displayValue: String(displayValue || ''),
      provenance,
    };
  }
  return { state: status.verified, value: number, displayValue: String(displayValue || ''), provenance };
}

function percentOrAwaiting(value, provenance = null) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return { state: status.awaitingVerification, value: null, provenance };
  }
  return { state: status.verified, value: number, provenance };
}

function provenance(type, source, extra = {}) {
  return {
    type,
    source,
    ...extra,
  };
}

function textRecord(value, source, stateWhenPresent = status.awaitingVerification) {
  const text = String(value || '').trim();
  return {
    state: text ? stateWhenPresent : status.unavailable,
    text,
    provenance: source,
  };
}

function itemRecord(value, source, stateWhenPresent = status.awaitingVerification) {
  const items = Array.isArray(value) ? value.filter(Boolean) : [];
  return {
    state: items.length ? stateWhenPresent : status.unavailable,
    items,
    provenance: source,
  };
}

function existingOutputMetric(value, source, calculationStatus = 'source_output') {
  if (value === null || value === undefined || value === '') {
    return { state: status.unavailable, value: null, provenance: source, calculationStatus };
  }
  return {
    state: calculationStatus === 'existing_estimate' ? status.awaitingVerification : status.verified,
    value,
    provenance: source,
    calculationStatus,
  };
}

function overviewMetric(socialListening, label, source) {
  const item = socialListening?.overview?.find(row => row.label === label);
  if (!item) return existingOutputMetric(null, source);
  return existingOutputMetric(item.value, source, item.change === 'Est.' ? 'existing_estimate' : 'source_output');
}

function directOrOverviewMetric(value, socialListening, label, source) {
  if (value !== null && value !== undefined && value !== '') {
    return existingOutputMetric(value, source);
  }
  return overviewMetric(socialListening, label, source);
}

function dataScopes(metrics, source) {
  const diagnostics = metrics?.diagnostics || {};
  const primaryFiltered = diagnostics.countryFilterApplied === true;
  const sampleFiltered = diagnostics.mcpSourceFilterApplied === true;
  return {
    primaryMetrics: {
      state: status.verified,
      geography: primaryFiltered ? (diagnostics.countryFilterRequested || 'PH') : 'broader_or_unfiltered',
      philippinesOnly: primaryFiltered,
      provenance: source,
    },
    mentionSample: {
      state: status.verified,
      geography: sampleFiltered ? (diagnostics.mcpSourceFilterCountry || 'PH') : primaryFiltered ? (diagnostics.countryFilterRequested || 'PH') : 'broader_or_unfiltered',
      philippinesOnly: sampleFiltered || primaryFiltered,
      provenance: source,
    },
    reach: {
      state: status.verified,
      geography: diagnostics.reachCountryFiltered === true ? (diagnostics.countryFilterRequested || diagnostics.mcpSourceFilterCountry || 'PH') : 'broader_or_unfiltered',
      philippinesOnly: diagnostics.reachCountryFiltered === true,
      provenance: source,
    },
  };
}

function period(label, startDate, endDate, role) {
  return {
    role,
    label: label || '',
    startDate: startDate || '',
    endDate: endDate || '',
    state: startDate && endDate ? status.verified : status.awaitingVerification,
  };
}

function previousWeekFrom(startDate) {
  if (!startDate) return { startDate: '', endDate: '' };
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  start.setUTCDate(start.getUTCDate() - 7);
  end.setUTCDate(end.getUTCDate() - 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function previousMonthFrom(startDate) {
  if (!startDate) return { startDate: '', endDate: '' };
  const start = new Date(`${startDate}T00:00:00Z`);
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
  return {
    startDate: first.toISOString().slice(0, 10),
    endDate: last.toISOString().slice(0, 10),
  };
}

function ytdFrom(endDate) {
  if (!endDate) return { startDate: '', endDate: '' };
  return {
    startDate: `${endDate.slice(0, 4)}-01-01`,
    endDate,
  };
}

function dailySeriesFromStats(stats = [], metricKey = 'mentions', source, sourceType = 'brand24_export') {
  if (!stats.length) {
    return {
      state: status.unavailable,
      metricKey,
      points: [],
      provenance: provenance(sourceType, source, { note: 'daily stats not present in available Signal Intel output' }),
    };
  }
  const points = stats.map(item => ({
      date: item.date,
      value: Number.isFinite(Number(item[metricKey])) ? Number(item[metricKey]) : null,
      state: Number.isFinite(Number(item[metricKey])) ? status.verified : status.awaitingVerification,
    }));
  const verifiedPoints = points.filter(item => item.state === status.verified).length;
  return {
    state: verifiedPoints === points.length ? status.verified : verifiedPoints ? status.awaitingVerification : status.unavailable,
    metricKey,
    points,
    provenance: provenance(sourceType, source, {
      note: stats.some(item => !Number.isFinite(Number(item[metricKey])))
        ? `one or more ${metricKey} points are unavailable in the source output`
        : '',
    }),
  };
}

function sourceSeriesFromCategories(categories = [], totalMentions, source, sourceType = 'brand24_export') {
  if (!categories.length) {
    return {
      state: status.unavailable,
      items: [],
      provenance: provenance(sourceType, source, { note: 'source categories not present in available Signal Intel output' }),
    };
  }
  return {
    state: status.verified,
    items: categories.map(item => ({
      name: item.name,
      rawCount: numberOrUnavailable(item.count, provenance(sourceType, source)),
      percentage: percentOrAwaiting(item.pct, provenance(sourceType, source)),
      denominator: totalMentions || null,
    })),
    provenance: provenance(sourceType, source),
  };
}

function sentimentBreakdown(metrics, sourceName, sourceType = 'brand24_export') {
  const sentiment = metrics?.sentiment || {};
  return {
    positive: {
      count: numberOrUnavailable(sentiment.positive?.count, provenance(sourceType, sourceName)),
      percentage: percentOrAwaiting(sentiment.positive?.pct, provenance(sourceType, sourceName)),
    },
    negative: {
      count: numberOrUnavailable(sentiment.negative?.count, provenance(sourceType, sourceName)),
      percentage: percentOrAwaiting(sentiment.negative?.pct, provenance(sourceType, sourceName)),
    },
    neutral: {
      count: numberOrUnavailable(sentiment.neutral?.count, provenance(sourceType, sourceName)),
      percentage: percentOrAwaiting(sentiment.neutral?.pct, provenance(sourceType, sourceName)),
    },
    denominatorPolicy: 'Use source-provided percentages when available; calculate only when counts share the same verified denominator.',
  };
}

function evidenceFromMention(mention, index, sourceName, sourceType = 'brand24_export') {
  const mentionSource = provenance(sourceType, sourceName, {
    ...(mention.sourcePage ? { sourcePage: mention.sourcePage } : {}),
    note: 'Mapped from existing Signal Intel topMentions output; screenshot capture is not available in the report object.',
  });
  return {
    id: mention.id || `available-mention-${index + 1}`,
    title: mention.title || '',
    sourceUrl: mention.url || '',
    platform: mention.source || '',
    timestamp: mention.date || mention.publishedAt || '',
    screenshotAsset: { state: status.unavailable, assetKey: null },
    reach: numberOrUnavailable(mention.reach, mentionSource),
    views: numberOrUnavailable(mention.views, mentionSource),
    sentiment: mention.sentiment || '',
    caption: mention.text || mention.title || '',
    relevanceState: mention.relevanceState || status.awaitingVerification,
    approvalState: mention.approvalState || status.awaitingVerification,
    reviewNote: mention.reviewNote || 'Evidence candidate requires relevance and editorial review.',
    provenance: mentionSource,
  };
}

function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

const PRESENTATION_STATES = {
  reviewOnly: 'review_only',
  quarantined: 'quarantined',
};

function presentationEligibility(state = PRESENTATION_STATES.reviewOnly, reasonCodes = [], qualityFlagIds = []) {
  return { state, reasonCodes, qualityFlagIds };
}

function itemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item || '');
  return item.approvedSummary || item.observation || item.description || item.synthesis || item.text || item.title || '';
}

function withItemEligibility(record, evaluations) {
  const quarantined = evaluations.filter(item => item.state === PRESENTATION_STATES.quarantined);
  return {
    ...record,
    presentationEligibility: presentationEligibility(
      PRESENTATION_STATES.reviewOnly,
      [...new Set(quarantined.flatMap(item => item.reasonCodes))],
      [...new Set(quarantined.flatMap(item => item.qualityFlagIds))],
    ),
    itemPresentationEligibility: evaluations,
  };
}

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match ? match[1] : '';
}

function eventEligibility(item, period, qualityFlagId) {
  const date = item && typeof item === 'object' ? isoDate(item.date) : '';
  if (!date) return presentationEligibility();
  if (date < period.startDate || date > period.endDate) {
    return presentationEligibility(
      PRESENTATION_STATES.quarantined,
      ['outside_current_reporting_period'],
      [qualityFlagId],
    );
  }
  return presentationEligibility();
}

const SOV_DEPENDENT_PATTERN = /\b(?:share[ -]of[ -]voice|sov|rank(?:ed|ing)?|leader|leading|leads|trailer|trailing|trails|highest|lowest|second[- ](?:highest|lowest)|dominates?)\b/i;
const UNAVAILABLE_COMPETITOR_COVERAGE_PATTERNS = [
  /\b(?:zero|0|no)\s+mentions?\b/i,
  /\b(?:source|project)\b[^.]{0,100}\b(?:fail(?:ed|ure)?|misconfigur(?:ed|ation)|not\s+(?:be\s+)?(?:captur|return|provid))/i,
  /\bkeywords?\b[^.]{0,100}\b(?:fail|misconfigur|not\s+(?:be\s+)?(?:captur|return|provid))/i,
  /(?:\bunderperform(?:ance|ed|ing)?\b[^.]{0,100}\b(?:zero|0|no)\s+mentions?\b|\b(?:zero|0|no)\s+mentions?\b[^.]{0,100}\bunderperform(?:ance|ed|ing)?\b)/i,
];

function parseClaimNumber(raw, unit = '') {
  const normalized = String(raw).replace(/,/g, '');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const multiplier = /^m(?:illion)?$/i.test(unit) ? 1000000 : /^k$/i.test(unit) ? 1000 : 1;
  return {
    value: value * multiplier,
    displayedValue: value,
    multiplier,
    precision: (normalized.split('.')[1] || '').length,
  };
}

function claimMatchesAuthoritative(claim, authoritative) {
  if (!claim || !Number.isFinite(Number(authoritative))) return true;
  if (claim.multiplier > 1) {
    return Number((Number(authoritative) / claim.multiplier).toFixed(claim.precision)) === claim.displayedValue;
  }
  return claim.value === Number(authoritative);
}

function deterministicMeasurementConflicts(text, authority = {}) {
  const value = String(text || '');
  const conflicts = [];
  const add = (field, claim, authoritative) => {
    if (!claimMatchesAuthoritative(claim, authoritative)) conflicts.push({ field, observedValue: claim.value, authoritativeValue: authoritative });
  };

  for (const match of value.matchAll(/([\d,.]+)\s*(million|m|k)?\s+mentions\b/gi)) {
    add('metrics.mentions.total', parseClaimNumber(match[1], match[2]), authority.mentions);
  }
  for (const match of value.matchAll(/\breach(?:ed|\s+of|\s*:)?\s+(?:approximately\s+|about\s+)?([\d,.]+)\s*(million|m|k)?(?:\s+accounts?)?/gi)) {
    add('metrics.reach.total', parseClaimNumber(match[1], match[2]), authority.reach);
  }
  for (const match of value.matchAll(/([\d.]+)%\s*(positive|negative|neutral)\b/gi)) {
    const tone = match[2].toLowerCase();
    add(`metrics.sentiment.${tone}.percentage`, parseClaimNumber(match[1]), authority.sentiment?.[tone]);
  }
  return conflicts;
}

function deterministicReportLevelMeasurementConflicts(text, authority = {}) {
  const value = String(text || '');
  const conflicts = [];
  const add = (field, claim, authoritative) => {
    if (!claimMatchesAuthoritative(claim, authoritative)) conflicts.push({ field, observedValue: claim.value, authoritativeValue: authoritative });
  };

  for (const match of value.matchAll(/([\d,.]+)\s+(?:raw\s+)?verified\s+mentions\b/gi)) {
    add('metrics.mentions.total', parseClaimNumber(match[1]), authority.mentions);
  }
  for (const match of value.matchAll(/\b(positive|negative|neutral)\s+sentiment\s+at\s+([\d.]+)%/gi)) {
    const tone = match[1].toLowerCase();
    add(`metrics.sentiment.${tone}.percentage`, parseClaimNumber(match[2]), authority.sentiment?.[tone]);
  }
  for (const match of value.matchAll(/([\d,.]+)\s*(million|m|k)\s+reach\s+for\s+the\s+period\b/gi)) {
    add('metrics.reach.total', parseClaimNumber(match[1], match[2]), authority.reach);
  }
  return conflicts;
}

function unavailableCompetitorCoverageConflict(text, authority = {}) {
  return authority.availabilityState === status.unavailable
    && UNAVAILABLE_COMPETITOR_COVERAGE_PATTERNS.some(pattern => pattern.test(String(text || '')));
}

function narrativeEligibility(text, {
  authority,
  sovUnavailable,
  checkMeasurementClaims = true,
  checkReportLevelClaims = false,
  checkUnavailableCoverage = false,
  qualityFlagIds,
}) {
  const reasonCodes = [];
  const linkedFlags = [];
  if (sovUnavailable && SOV_DEPENDENT_PATTERN.test(String(text || ''))) {
    reasonCodes.push('sov_denominator_or_ranking_unavailable');
    linkedFlags.push(qualityFlagIds.sov);
  }
  const measurementConflicts = [
    ...(checkMeasurementClaims ? deterministicMeasurementConflicts(text, authority) : []),
    ...(checkReportLevelClaims ? deterministicReportLevelMeasurementConflicts(text, authority) : []),
  ];
  if (measurementConflicts.length) {
    reasonCodes.push('authoritative_measurement_conflict');
    linkedFlags.push(qualityFlagIds.measurement);
  }
  if (checkUnavailableCoverage && unavailableCompetitorCoverageConflict(text, authority)) {
    reasonCodes.push('source_coverage_availability_incompatibility');
    linkedFlags.push(qualityFlagIds.coverage);
  }
  return reasonCodes.length
    ? presentationEligibility(PRESENTATION_STATES.quarantined, reasonCodes, linkedFlags)
    : presentationEligibility();
}

function primaryAuthority(current) {
  return {
    mentions: current.mentions.total.value,
    reach: current.reach.total.value,
    sentiment: {
      positive: current.sentiment.positive.percentage.value,
      negative: current.sentiment.negative.percentage.value,
      neutral: current.sentiment.neutral.percentage.value,
    },
  };
}

function competitorAuthority(contract, name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!key) return {};
  const row = contract.sov.current.competitors.find(item => {
    const candidate = String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return candidate === key || candidate.includes(key) || key.includes(candidate);
  });
  if (!row) return {};
  if (row.state !== status.verified) return { availabilityState: row.state };
  return {
    availabilityState: row.state,
    mentions: row.mentions?.value,
    reach: row.reach?.value,
  };
}

function applyDeterministicPresentationQuarantine(adapted, manifest, intelligenceSource) {
  const qualityFlagIds = {
    period: 'intelligence-event-period-conflict',
    measurement: 'intelligence-authoritative-measurement-conflict',
    sov: 'intelligence-sov-claim-unavailable',
    coverage: 'intelligence-source-coverage-availability-conflict',
  };
  const period = manifest.reportingPeriods.current;
  const current = adapted.metrics.periods.current;
  const authority = primaryAuthority(current);
  const sovUnavailable = adapted.sov.current.compatibleDenominator?.state !== status.verified
    || adapted.sov.current.competitors.some(item => item.sovPercentage?.state !== status.verified || item.rank?.state !== status.verified);
  const intelligence = adapted.optionalModules.intelligence;
  const narratives = adapted.approvedNarrative;

  const eventEvaluations = (intelligence.monitoringEvents.items || []).map(item => eventEligibility(item, period, qualityFlagIds.period));
  intelligence.monitoringEvents = withItemEligibility(intelligence.monitoringEvents, eventEvaluations);

  const itemNarrative = (
    record,
    authorityForItem = () => authority,
    checkMeasurementClaims = true,
    checkReportLevelClaims = false,
    checkUnavailableCoverage = false,
  ) => withItemEligibility(
    record,
    (record.items || []).map((item, index) => narrativeEligibility(itemText(item), {
      authority: authorityForItem(item, index),
      sovUnavailable,
      checkMeasurementClaims,
      checkReportLevelClaims,
      checkUnavailableCoverage,
      qualityFlagIds,
    })),
  );
  intelligence.spikeDrivers = itemNarrative(intelligence.spikeDrivers, undefined, false);
  intelligence.competitorNotes = itemNarrative(
    intelligence.competitorNotes,
    item => competitorAuthority(adapted, item?.brand || item?.competitor || item?.name),
    true,
    false,
    true,
  );
  narratives.positiveThemes = itemNarrative(narratives.positiveThemes, undefined, false, true);
  narratives.negativeThemes = itemNarrative(narratives.negativeThemes, undefined, false, true);
  narratives.recommendations = itemNarrative(narratives.recommendations, undefined, true, true);

  const executiveEligibility = narrativeEligibility(narratives.executiveSummary.text, {
    authority,
    sovUnavailable,
    qualityFlagIds,
  });
  narratives.executiveSummary = {
    ...narratives.executiveSummary,
    presentationEligibility: executiveEligibility,
  };

  const quarantinedRecords = [
    intelligence.monitoringEvents,
    intelligence.spikeDrivers,
    intelligence.competitorNotes,
    narratives.positiveThemes,
    narratives.negativeThemes,
    narratives.recommendations,
  ];
  const quarantinedFor = flagId => quarantinedRecords.reduce(
    (count, record) => count + (record.itemPresentationEligibility || []).filter(item => item.qualityFlagIds.includes(flagId)).length,
    narratives.executiveSummary.presentationEligibility?.qualityFlagIds?.includes(flagId) ? 1 : 0,
  );

  const flagDefinitions = [
    {
      id: qualityFlagIds.period,
      count: quarantinedFor(qualityFlagIds.period),
      message: count => `${count} monitoring event${count === 1 ? '' : 's'} outside ${period.label} ${count === 1 ? 'was' : 'were'} excluded from current-period presentation.`,
    },
    {
      id: qualityFlagIds.measurement,
      count: quarantinedFor(qualityFlagIds.measurement),
      message: count => `${count} intelligence item${count === 1 ? '' : 's'} containing measurements incompatible with the authoritative B24-BROAD snapshot ${count === 1 ? 'was' : 'were'} quarantined without rewriting source content.`,
    },
    {
      id: qualityFlagIds.sov,
      count: quarantinedFor(qualityFlagIds.sov),
      message: count => `${count} intelligence item${count === 1 ? '' : 's'} depending on unavailable SOV percentages or rankings ${count === 1 ? 'was' : 'were'} quarantined.`,
    },
    {
      id: qualityFlagIds.coverage,
      count: quarantinedFor(qualityFlagIds.coverage),
      message: count => `${count} competitor intelligence item${count === 1 ? '' : 's'} incompatible with an unavailable source-coverage state ${count === 1 ? 'was' : 'were'} quarantined without treating unavailable data as zero.`,
    },
  ];
  for (const definition of flagDefinitions) {
    if (!definition.count) continue;
    adapted.dataQualityFlags.push({
      id: definition.id,
      severity: 'review',
      state: status.awaitingVerification,
      message: definition.message(definition.count),
      provenance: intelligenceSource,
      quarantinedItemCount: definition.count,
    });
  }
}

function assertMeasurementOverlayAdapterInput(input, manifest) {
  const current = manifest.reportingPeriods.current;
  if (input.brand && input.brand !== manifest.clientName) throw new Error('Measurement manifest client does not match adapter input brand.');
  if (input.startDate && input.startDate !== current.startDate) throw new Error('Measurement manifest current startDate does not match adapter input.');
  if (input.endDate && input.endDate !== current.endDate) throw new Error('Measurement manifest current endDate does not match adapter input.');
}

function manifestDatasetProvenance(manifest, reference, extra = {}) {
  return provenance('brand24_export', manifest.snapshotId, {
    manifestId: manifest.manifestId,
    deckFileName: manifest.source.deck.fileName,
    deckSha256: manifest.source.deck.sha256,
    scopeKey: manifest.source.scope.key,
    ...(reference ? {
      slide: reference.slide,
      chart: reference.chart,
      workbookPath: reference.workbookPath,
      workbookSha256: reference.workbookSha256,
    } : {}),
    ...extra,
  });
}

function manifestNumber(value, source, displayValue = '') {
  return value === null || value === undefined
    ? { state: status.unavailable, value: null, displayValue: String(displayValue || ''), provenance: source }
    : { state: status.verified, value: Number(value), displayValue: String(displayValue || ''), provenance: source };
}

function manifestDisplayNumber(record, source) {
  if (!record || record.value === null || record.value === undefined) {
    return {
      state: record?.state || status.unavailable,
      value: null,
      displayValue: String(record?.displayValue || ''),
      valueKind: record?.valueKind || '',
      provenance: source,
    };
  }
  return {
    state: record.state || status.verified,
    value: Number(record.value),
    displayValue: String(record.displayValue || ''),
    valueKind: record.valueKind || '',
    provenance: source,
  };
}

function manifestSeries(points, metricKey, source) {
  if (!Array.isArray(points)) return { state: status.unavailable, metricKey, points: [], provenance: source };
  return {
    state: status.verified,
    metricKey,
    points: points.map(point => ({ date: point.date, value: Number(point.value), state: status.verified })),
    provenance: source,
  };
}

function indexedManifestSeries(values, dates, metricKey, source) {
  if (!Array.isArray(values)) return { state: status.unavailable, metricKey, points: [], provenance: source };
  return manifestSeries(values.map((value, index) => ({ date: dates[index], value })), metricKey, source);
}

function manifestPercentage(value, source, { count, denominator, precision = 1 } = {}) {
  if (value !== null && value !== undefined) {
    return {
      state: status.verified,
      value: Number(value),
      valueKind: 'rounded_source_display',
      calculationStatus: 'source_reported',
      provenance: source,
    };
  }
  if (Number.isFinite(Number(count)) && Number.isFinite(Number(denominator)) && Number(denominator) > 0) {
    return {
      state: status.verified,
      value: Number((Number(count) / Number(denominator) * 100).toFixed(precision)),
      valueKind: 'derived_compatible_denominator',
      calculationStatus: 'derived',
      precision,
      provenance: {
        ...source,
        derivation: {
          formula: 'count / compatible denominator * 100',
          denominator: Number(denominator),
          precision,
        },
      },
    };
  }
  return { state: status.unavailable, value: null, provenance: source };
}

function manifestDailyAverage(points, total, source, precision = 1) {
  const verifiedPoints = Array.isArray(points)
    ? points.filter(point => Number.isFinite(Number(point.value)))
    : [];
  if (!verifiedPoints.length || verifiedPoints.length !== points.length) {
    return { state: status.unavailable, value: null, displayValue: '', provenance: source };
  }
  const pointTotal = verifiedPoints.reduce((sum, point) => sum + Number(point.value), 0);
  if (pointTotal !== Number(total)) {
    return { state: status.unavailable, value: null, displayValue: '', provenance: source };
  }
  const value = pointTotal / verifiedPoints.length;
  return {
    state: status.verified,
    value,
    displayValue: value.toFixed(precision),
    valueKind: 'derived_compatible_series',
    calculationStatus: 'derived',
    precision,
    provenance: {
      ...source,
      derivation: {
        formula: 'sum of verified daily mentions / verified day count',
        dayCount: verifiedPoints.length,
        precision,
      },
    },
  };
}

function canonicalPeriodMetrics(manifest, periodKey) {
  const dataset = manifest.periods[periodKey];
  if (!dataset || dataset.state !== status.verified) {
    return {
      periodKey,
      state: status.unavailable,
      denominator: { state: status.unavailable, value: null },
      mentions: { state: status.unavailable },
      reach: { state: status.unavailable },
      sentiment: { state: status.unavailable },
      sourceTypes: { state: status.unavailable, items: [] },
      operationalMetrics: { state: status.unavailable },
    };
  }

  const mentionSource = manifestDatasetProvenance(manifest, dataset.mentions.provenance, { periodKey });
  const reachSource = manifestDatasetProvenance(manifest, dataset.reach.provenance, { periodKey });
  const sentimentSource = manifestDatasetProvenance(manifest, dataset.sentiment.provenance, { periodKey });
  const sourceTypeSource = manifestDatasetProvenance(manifest, dataset.sourceTypes.provenance, { periodKey });
  const dates = dataset.mentions.daily.map(point => point.date);
  const operationalSource = manifestDatasetProvenance(manifest, null, { periodKey, slide: dataset.operationalMetrics.provenance.slide, sourceKind: 'native_slide_text' });

  return {
    periodKey,
    state: status.verified,
    denominator: manifestNumber(dataset.denominator, mentionSource),
    mentions: {
      state: status.verified,
      total: manifestNumber(dataset.mentions.total, mentionSource),
      dailyAverage: manifestDailyAverage(dataset.mentions.daily, dataset.mentions.total, mentionSource),
      social: manifestNumber(dataset.mentions.social, manifestDatasetProvenance(manifest, null, { periodKey, slide: dataset.mentions.splitProvenance.slide, sourceKind: 'native_slide_text' })),
      nonSocial: manifestNumber(dataset.mentions.nonSocial, manifestDatasetProvenance(manifest, null, { periodKey, slide: dataset.mentions.splitProvenance.slide, sourceKind: 'native_slide_text' })),
      dailySeries: manifestSeries(dataset.mentions.daily, 'mentions', mentionSource),
    },
    reach: {
      state: status.verified,
      total: manifestNumber(dataset.reach.total, reachSource),
      social: manifestDisplayNumber(dataset.reach.social, manifestDatasetProvenance(manifest, null, { periodKey, slide: dataset.reach.splitProvenance.slide, sourceKind: 'native_slide_text' })),
      nonSocial: manifestDisplayNumber(dataset.reach.nonSocial, manifestDatasetProvenance(manifest, null, { periodKey, slide: dataset.reach.splitProvenance.slide, sourceKind: 'native_slide_text' })),
      dailySeries: manifestSeries(dataset.reach.daily, 'reach', reachSource),
    },
    sentiment: {
      state: status.verified,
      denominator: manifestNumber(dataset.sentiment.denominator, sentimentSource),
      positive: {
        count: manifestNumber(dataset.sentiment.positive.count, sentimentSource),
        percentage: manifestPercentage(dataset.sentiment.positive.sourceDisplayPercentage, sentimentSource),
      },
      negative: {
        count: manifestNumber(dataset.sentiment.negative.count, sentimentSource),
        percentage: manifestPercentage(dataset.sentiment.negative.sourceDisplayPercentage, sentimentSource),
      },
      neutral: {
        count: manifestNumber(dataset.sentiment.neutral.count, sentimentSource),
        percentage: manifestPercentage(dataset.sentiment.neutral.sourceDisplayPercentage, sentimentSource, {
          count: dataset.sentiment.neutral.count,
          denominator: dataset.sentiment.denominator,
        }),
      },
      dailyPositive: indexedManifestSeries(dataset.sentiment.dailyPositive, dates, 'positive', manifestDatasetProvenance(manifest, dataset.sentiment.dailyPositiveProvenance, { periodKey })),
      dailyNegative: indexedManifestSeries(dataset.sentiment.dailyNegative, dates, 'negative', manifestDatasetProvenance(manifest, dataset.sentiment.dailyNegativeProvenance, { periodKey })),
      dailyNeutral: { state: status.unavailable, metricKey: 'neutral', points: [], provenance: sentimentSource },
      denominatorPolicy: 'Preserve source-displayed percentages; derive a missing percentage only from compatible verified counts and the same-period denominator.',
    },
    sourceTypes: {
      state: status.verified,
      denominator: manifestNumber(dataset.sourceTypes.denominator, sourceTypeSource),
      items: dataset.sourceTypes.items.map(item => ({
        name: item.name,
        rawCount: manifestNumber(item.count, sourceTypeSource),
        percentage: manifestPercentage(null, sourceTypeSource, {
          count: item.count,
          denominator: dataset.sourceTypes.denominator,
        }),
        denominator: dataset.sourceTypes.denominator,
      })),
      provenance: sourceTypeSource,
    },
    operationalMetrics: {
      state: Object.values(dataset.operationalMetrics).some(record => record?.state === status.awaitingVerification)
        ? status.awaitingVerification
        : status.verified,
      averagePresenceScore: manifestDisplayNumber(dataset.operationalMetrics.averagePresenceScore, operationalSource),
      ave: manifestDisplayNumber(dataset.operationalMetrics.ave, operationalSource),
      userGeneratedContent: manifestDisplayNumber(dataset.operationalMetrics.userGeneratedContent, operationalSource),
      provenance: operationalSource,
    },
  };
}

function unavailableManifestCompetitorValue(manifest, internalReason) {
  return {
    state: status.unavailable,
    value: null,
    displayValue: 'Data unavailable',
    provenance: manifestDatasetProvenance(manifest, null, { internal: { unavailableReason: internalReason } }),
  };
}

function manifestSov(manifest) {
  const source = manifest.sov.current;
  const period = manifest.reportingPeriods.current;
  const dates = datesForPeriod(period.startDate, period.endDate);
  const totalSources = source.provenance;
  const sourceTypeOrder = source.sourceTypeOrder;

  const competitors = source.competitors.map(item => {
    if (item.state === status.unavailable) {
      const internalReason = item.mentions.internalReason || 'Source workbook cells are unavailable.';
      const missing = unavailableManifestCompetitorValue(manifest, internalReason);
      return {
        id: item.id,
        name: item.name,
        role: item.role,
        found: false,
        cohortKey: source.cohortId,
        state: status.unavailable,
        monitoringState: 'unavailable',
        clientDisplayLabel: 'Data unavailable',
        mentions: missing,
        reach: missing,
        sovPercentage: { ...missing },
        rank: { ...missing },
        sentiment: { state: status.unavailable, positive: { count: { ...missing } }, negative: { count: { ...missing } }, neutral: { count: { ...missing } } },
        dailySeries: { mentions: { ...missing, points: [] }, reach: { ...missing, points: [] }, positive: { ...missing, points: [] }, negative: { ...missing, points: [] }, neutral: { ...missing, points: [] } },
        sourceTypes: { state: status.unavailable, items: [], clientDisplayLabel: 'Data unavailable', provenance: missing.provenance },
        reviewNote: '',
        provenance: missing.provenance,
      };
    }

    const mentionSource = manifestDatasetProvenance(manifest, totalSources.mentionTotals, { competitorId: item.id, periodKey: 'current' });
    const reachSource = manifestDatasetProvenance(manifest, totalSources.reachTotals, { competitorId: item.id, periodKey: 'current' });
    const sentimentSource = manifestDatasetProvenance(manifest, totalSources.sentimentTotals, { competitorId: item.id, periodKey: 'current' });
    const sourceTypeSource = manifestDatasetProvenance(manifest, totalSources.sourceTypes, { competitorId: item.id, periodKey: 'current' });
    const sourceValue = value => typeof value === 'number'
      ? manifestNumber(value, sourceTypeSource)
      : { state: status.unavailable, value: null, provenance: sourceTypeSource };
    return {
      id: item.id,
      name: item.name,
      role: item.role,
      found: true,
      cohortKey: source.cohortId,
      state: status.verified,
      monitoringState: 'available',
      mentions: manifestNumber(item.mentions, mentionSource),
      reach: manifestNumber(item.reach, reachSource),
      sovPercentage: { state: status.unavailable, value: null, provenance: mentionSource },
      rank: { state: status.unavailable, value: null, provenance: mentionSource },
      sentiment: {
        state: status.verified,
        denominator: manifestNumber(item.mentions, sentimentSource),
        positive: { count: manifestNumber(item.sentiment.positive, sentimentSource) },
        negative: { count: manifestNumber(item.sentiment.negative, sentimentSource) },
        neutral: { count: manifestNumber(item.sentiment.neutral, sentimentSource) },
      },
      dailySeries: {
        mentions: indexedManifestSeries(item.dailyMentions, dates, 'mentions', manifestDatasetProvenance(manifest, totalSources.dailyMentions, { competitorId: item.id, periodKey: 'current' })),
        reach: indexedManifestSeries(item.dailyReach, dates, 'reach', manifestDatasetProvenance(manifest, totalSources.dailyReach, { competitorId: item.id, periodKey: 'current' })),
        positive: indexedManifestSeries(item.dailyPositive, dates, 'positive', manifestDatasetProvenance(manifest, totalSources.dailyPositive, { competitorId: item.id, periodKey: 'current' })),
        negative: indexedManifestSeries(item.dailyNegative, dates, 'negative', manifestDatasetProvenance(manifest, totalSources.dailyNegative, { competitorId: item.id, periodKey: 'current' })),
        neutral: { state: status.unavailable, metricKey: 'neutral', points: [], provenance: sentimentSource },
      },
      sourceTypes: {
        state: item.sourceTypes.some(value => typeof value !== 'number') ? status.awaitingVerification : status.verified,
        denominator: manifestNumber(item.mentions, sourceTypeSource),
        items: sourceTypeOrder.map((name, index) => ({ name, rawCount: sourceValue(item.sourceTypes[index]), percentage: { state: status.unavailable, value: null, provenance: sourceTypeSource }, denominator: item.mentions })),
        provenance: sourceTypeSource,
      },
      reviewNote: '',
      provenance: mentionSource,
    };
  });

  return {
    comparisonCohort: [...source.cohort],
    current: {
      state: status.verified,
      periodKey: 'current',
      cohortId: source.cohortId,
      competitors,
      compatibleDenominator: { state: status.unavailable, value: null },
      denominatorPolicy: source.percentagePolicy,
      provenance: manifestDatasetProvenance(manifest, totalSources.mentionTotals, { periodKey: 'current' }),
    },
    previousWeek: { state: status.unavailable, competitors: [] },
    previousFullMonth: { state: status.unavailable, competitors: [] },
    ytd: { state: status.unavailable, competitors: [] },
  };
}

function datesForPeriod(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function adaptSignalIntelOutput(input = {}, schemaVersion = 'signal-intel-report-v1') {
  let {
  brand,
  periodLabel,
  startDate,
  endDate,
  metrics = {},
  context = {},
  analysis = {},
  competitive = {},
  competitiveLite = {},
  report = {},
  socialListening = {},
  extendedOutput = {},
  previousReportSummary = null,
  sourceEvidence = null,
  dataQualityFlags = [],
  generatedAt = new Date().toISOString(),
  measurementManifest = null,
  } = input;

  const signalIntelOutput = {
    metrics,
    context,
    analysis,
    competitive,
    competitiveLite,
    report,
    socialListening,
    extendedOutput,
    previousReportSummary,
    sourceEvidence,
    dataQualityFlags,
  };
  const signalIntelRunId = report.runId || sourceEvidence?.source || 'current-ui-report-object';
  const hasSignalIntelIntelligence = measurementManifest && [
    metrics.topMentions,
    metrics.sourceNarrative,
    context,
    analysis,
    competitive.competitorNotes,
    competitiveLite,
    report,
    socialListening,
    extendedOutput,
    previousReportSummary,
  ].some(hasContent);

  if (measurementManifest) {
    assertMeasurementManifest(measurementManifest);
    assertMeasurementOverlayAdapterInput(input, measurementManifest);
    const currentDataset = measurementManifest.periods.current;
    const currentPeriod = measurementManifest.reportingPeriods.current;
    brand = measurementManifest.clientName;
    periodLabel = currentPeriod.label;
    startDate = currentPeriod.startDate;
    endDate = currentPeriod.endDate;
    metrics = {
      mentions: { total: currentDataset.mentions.total },
      totalReach: currentDataset.reach.total,
      dailyStats: currentDataset.mentions.daily.map((point, index) => ({
        date: point.date,
        mentions: point.value,
        reach: currentDataset.reach.daily[index].value,
      })),
      sentiment: {
        positive: { count: currentDataset.sentiment.positive.count, pct: currentDataset.sentiment.positive.sourceDisplayPercentage },
        negative: { count: currentDataset.sentiment.negative.count, pct: currentDataset.sentiment.negative.sourceDisplayPercentage },
        neutral: { count: currentDataset.sentiment.neutral.count },
      },
      sourceCategories: currentDataset.sourceTypes.items.map(item => ({ name: item.name, count: item.count })),
      diagnostics: { countryFilterApplied: false, reachCountryFiltered: false, sourceDocumentOnly: true },
    };
    sourceEvidence = {
      type: 'brand24_export',
      source: measurementManifest.snapshotId,
      extra: {
        manifestId: measurementManifest.manifestId,
        deckFileName: measurementManifest.source.deck.fileName,
        deckSha256: measurementManifest.source.deck.sha256,
        measurementOnly: true,
        excludedSnapshots: [...measurementManifest.source.excludedSnapshots],
      },
    };
  }
  const sourceName = sourceEvidence?.source || (metrics.manualVerified ? 'manual_verified_signal_intel_snapshot' : 'signal_intel_tracking_snapshot');
  const sourceType = sourceEvidence?.type || (metrics.manualVerified ? 'manual_verified_input' : 'brand24_export');
  const trackingSource = provenance(sourceType, sourceName, sourceEvidence?.extra || {});
  const analystSource = provenance('signal_intel_output', 'analystAgent');
  const contextSource = provenance('signal_intel_output', 'contextScoutAgent');
  const reportSource = provenance('signal_intel_output', 'reportBuilderAgent');
  const intelligenceSource = provenance('signal_intel_output', signalIntelRunId, {
    role: 'intelligence_only',
    sourceObject: 'SignalIntel.out',
  });
  const previousWeek = previousWeekFrom(startDate);
  const previousFullMonth = previousMonthFrom(startDate);
  const ytd = ytdFrom(endDate);
  const totalMentions = metrics?.mentions?.total;

  const competitors = (competitive.sovData || []).map((row, index) => ({
    id: row.id || `comparison-${index + 1}`,
    name: row.brand,
    role: row.isClient ? 'client' : 'competitor',
    matchedProjectId: row.projectId || '',
    matchedProjectName: row.projectName || '',
    found: !!row.found,
    cohortKey: row.isClient ? 'client' : 'eastwest-bank-reference-cohort',
    mentions: row.found === false
      ? { state: status.unavailable, value: null, observedValue: row.mentions ?? null, provenance: trackingSource }
      : numberOrUnavailable(row.mentions, provenance(row.manualVerified ? 'manual_verified_input' : sourceType, row.sourceLabel || sourceName)),
    sovPercentage: row.found === false
      ? { state: status.unavailable, value: null, observedValue: row.percentage ?? null, provenance: trackingSource }
      : percentOrAwaiting(row.percentage, provenance(row.manualVerified ? 'manual_verified_input' : sourceType, row.sourceLabel || sourceName)),
    state: row.found ? status.verified : status.unavailable,
    monitoringState: row.monitoringState || (row.found ? 'available' : 'unavailable_or_requires_review'),
    reviewNote: row.reviewNote || '',
    provenance: provenance(row.manualVerified ? 'manual_verified_input' : sourceType, row.sourceLabel || sourceName, row.sourcePage ? { sourcePage: row.sourcePage } : {}),
  }));

  const adapted = {
    schemaVersion,
    reportingContext: {
      clientName: brand || '',
      reportTitle: 'Social Monitoring Report',
      generatedAt,
      reportingPeriods: {
        current: period(periodLabel, startDate, endDate, 'current'),
        previousWeek: period('Previous Week', previousWeek.startDate, previousWeek.endDate, 'previous_week'),
        previousFullMonth: period('Previous Full Month', previousFullMonth.startDate, previousFullMonth.endDate, 'previous_full_month'),
        ytd: period('YTD', ytd.startDate, ytd.endDate, 'ytd'),
      },
      provenance: {
        sourceRunId: report.runId || '',
        generatedAt,
        dataSources: [trackingSource],
      },
      dataScopes: dataScopes(metrics, trackingSource),
    },
    metrics: {
      mentions: {
        total: numberOrUnavailable(totalMentions, trackingSource, metrics?.mentions?.totalDisplay),
        dailyAverage: numberOrUnavailable(metrics?.mentions?.dailyAvg, trackingSource, metrics?.mentions?.dailyAvgDisplay),
        dailySeries: dailySeriesFromStats(metrics.dailyStats, 'mentions', sourceName, sourceType),
      },
      reach: {
        total: numberOrUnavailable(metrics.totalReach, trackingSource, metrics.totalReachDisplay),
        social: numberOrUnavailable(metrics.socialMediaReach, trackingSource, metrics.socialMediaReachDisplay),
        nonSocial: numberOrUnavailable(metrics.nonSocialMediaReach, trackingSource, metrics.nonSocialMediaReachDisplay),
        dailySeries: dailySeriesFromStats(metrics.dailyStats, 'reach', sourceName, sourceType),
      },
      sentiment: sentimentBreakdown(metrics, sourceName, sourceType),
      sourceTypes: sourceSeriesFromCategories(metrics.sourceCategories, totalMentions, sourceName, sourceType),
    },
    sov: {
      comparisonCohort: competitors.map(item => item.name),
      current: {
        competitors,
        denominatorPolicy: 'Use only rows with verified compatible current-period mention counts.',
      },
      previousWeek: { state: status.unavailable, competitors: [] },
      previousFullMonth: { state: status.unavailable, competitors: [] },
      ytd: { state: status.unavailable, competitors: [] },
    },
    evidence: {
      records: ((measurementManifest ? signalIntelOutput.metrics.topMentions : metrics.topMentions) || [])
        .map((mention, index) => evidenceFromMention(
          mention,
          index,
          measurementManifest ? signalIntelRunId : sourceName,
          measurementManifest ? 'signal_intel_output' : sourceType,
        )),
      screenshotPolicy: 'Screenshots are required for client-facing evidence pages; existing Signal Intel output provides URLs/text but not captured image assets.',
    },
    approvedNarrative: {
      previousReportSummary: previousReportSummary || { state: status.awaitingVerification, items: [] },
      executiveSummary: analysis.executiveSummary ? { state: status.awaitingVerification, text: analysis.executiveSummary, ...(measurementManifest ? { provenance: analystSource } : {}) } : { state: status.unavailable, text: '' },
      positiveThemes: report.positiveThemes ? { state: status.awaitingVerification, items: report.positiveThemes, ...(measurementManifest ? { provenance: reportSource } : {}) } : { state: status.unavailable, items: [] },
      negativeThemes: report.negativeThemes ? { state: status.awaitingVerification, items: report.negativeThemes, ...(measurementManifest ? { provenance: reportSource } : {}) } : { state: status.unavailable, items: [] },
      recommendations: report.recommendations ? { state: status.awaitingVerification, items: report.recommendations, ...(measurementManifest ? { provenance: reportSource } : {}) } : { state: status.unavailable, items: [] },
    },
    optionalModules: {
      operationalMetrics: {
        averagePresenceScore: directOrOverviewMetric(metrics.averagePresenceScore, socialListening, 'Average Presence Score', trackingSource),
        ave: directOrOverviewMetric(metrics.ave, socialListening, 'AVE', trackingSource),
        userGeneratedContent: overviewMetric(socialListening, 'User generated content', trackingSource),
        socialMediaMentions: overviewMetric(socialListening, 'Social media mentions', trackingSource),
        nonSocialMediaMentions: overviewMetric(socialListening, 'Non-Social media mentions', trackingSource),
        socialMediaReactions: overviewMetric(socialListening, 'Social media reactions', trackingSource),
        socialMediaComments: overviewMetric(socialListening, 'Social media comments', trackingSource),
        socialMediaShares: overviewMetric(socialListening, 'Social media shares', trackingSource),
        totalSocialMediaInteractions: overviewMetric(socialListening, 'Total social media interactions', trackingSource),
      },
      intelligence: {
        sourceNarrative: textRecord((measurementManifest ? signalIntelOutput.metrics.sourceNarrative : metrics.sourceNarrative) || socialListening.sourceNarrative, measurementManifest ? intelligenceSource : trackingSource, status.verified),
        sourceSampleNote: textRecord(socialListening.sourceSampleNote, measurementManifest ? intelligenceSource : trackingSource, status.verified),
        topicClusters: itemRecord(context.topTopics, contextSource),
        themes: itemRecord(context.themes, contextSource),
        monitoringEvents: itemRecord(context.events, contextSource),
        qualitativeSignals: textRecord(context.qualitativeSignals, contextSource),
        spikeDrivers: itemRecord(analysis.spikeDrivers, analystSource),
        sentimentNarrative: textRecord(analysis.sentimentNarrative, analystSource),
        channelInsight: textRecord(analysis.channelInsight, analystSource),
        competitorNotes: itemRecord(competitive.competitorNotes, provenance('signal_intel_output', 'competitiveIntelAgent')),
        directionalCompetitorIntel: itemRecord(competitiveLite.competitors, provenance('signal_intel_output', 'competitiveIntelLiteAgent')),
        scamRiskAlert: textRecord(report.scamRiskAlert, reportSource),
      },
      extended: {
        influencers: itemRecord(extendedOutput.influencers, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
        hashtagsAndLinks: itemRecord(extendedOutput.hashtagsAndLinks, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
        mostActiveSites: itemRecord(extendedOutput.mostActiveSites, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
        emotions: itemRecord(extendedOutput.emotions, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
        opinionAnalysis: itemRecord(extendedOutput.opinionAnalysis, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
        demographics: itemRecord(extendedOutput.demographics, provenance('existing_extended_output', 'signal_intel_output'), status.verified),
      },
    },
    dataQualityFlags: (dataQualityFlags || []).map((flag, index) => ({
      id: flag.id || `quality-flag-${index + 1}`,
      severity: flag.severity || 'review',
      state: flag.state || status.awaitingVerification,
      message: flag.message || '',
      provenance: flag.provenance || trackingSource,
    })),
  };

  if (measurementManifest) {
    const current = canonicalPeriodMetrics(measurementManifest, 'current');
    const previousWeekMetrics = canonicalPeriodMetrics(measurementManifest, 'previousWeek');
    const previousFullMonthMetrics = canonicalPeriodMetrics(measurementManifest, 'previousFullMonth');
    const ytdMetrics = canonicalPeriodMetrics(measurementManifest, 'ytd');

    adapted.reportingContext.reportingPeriods = Object.fromEntries(
      Object.entries(measurementManifest.reportingPeriods).map(([key, value]) => [key, { ...value }]),
    );
    adapted.reportingContext.provenance.sourceRunId = measurementManifest.manifestId;
    adapted.reportingContext.provenance.dataSources = [manifestDatasetProvenance(measurementManifest, null, {
      measurementOnly: true,
      excludedSnapshots: [...measurementManifest.source.excludedSnapshots],
    }), ...(hasSignalIntelIntelligence ? [intelligenceSource] : [])];
    adapted.metrics = {
      mentions: {
        total: current.mentions.total,
        dailyAverage: current.mentions.dailyAverage,
        social: current.mentions.social,
        nonSocial: current.mentions.nonSocial,
        dailySeries: current.mentions.dailySeries,
      },
      reach: current.reach,
      sentiment: current.sentiment,
      sourceTypes: current.sourceTypes,
      periods: {
        current,
        previousWeek: previousWeekMetrics,
        previousFullMonth: previousFullMonthMetrics,
        ytd: ytdMetrics,
      },
    };
    adapted.sov = manifestSov(measurementManifest);
    adapted.approvedNarrative.previousReportSummary = previousReportSummary || { state: status.unavailable, items: [] };
    if (!hasSignalIntelIntelligence) {
      adapted.evidence = {
        records: [],
        state: status.unavailable,
        screenshotPolicy: 'Signal Intel-selected evidence for this measurement snapshot is unavailable; raw Brand24 cards are not substituted.',
      };
    }
    adapted.optionalModules.operationalMetrics = {
      averagePresenceScore: current.operationalMetrics.averagePresenceScore,
      ave: current.operationalMetrics.ave,
      userGeneratedContent: current.operationalMetrics.userGeneratedContent,
      socialMediaMentions: current.mentions.social,
      nonSocialMediaMentions: current.mentions.nonSocial,
      socialMediaReactions: { state: status.unavailable, value: null, provenance: current.operationalMetrics.provenance },
      socialMediaComments: { state: status.unavailable, value: null, provenance: current.operationalMetrics.provenance },
      socialMediaShares: { state: status.unavailable, value: null, provenance: current.operationalMetrics.provenance },
      totalSocialMediaInteractions: { state: status.unavailable, value: null, provenance: current.operationalMetrics.provenance },
    };
    adapted.optionalModules.extended = Object.fromEntries(
      Object.keys(adapted.optionalModules.extended).map(key => [key, { state: status.unavailable, items: [], provenance: manifestDatasetProvenance(measurementManifest, null, { measurementOnly: true }) }]),
    );
    const signalIntelTotal = Number(signalIntelOutput.metrics?.mentions?.total);
    if (Number.isFinite(signalIntelTotal) && signalIntelTotal !== current.mentions.total.value) {
      adapted.dataQualityFlags.push({
        id: 'measurement-intelligence-snapshot-conflict',
        severity: 'blocker',
        state: status.awaitingVerification,
        message: `Signal Intel intelligence was produced with ${signalIntelTotal} mentions; authoritative B24-BROAD measurements contain ${current.mentions.total.value}. Narratives are retained for review and are not promoted to verified measurement claims.`,
        provenance: intelligenceSource,
      });
    }
    if (hasSignalIntelIntelligence) {
      applyDeterministicPresentationQuarantine(adapted, measurementManifest, intelligenceSource);
    }
  }

  return adapted;
}

export function adaptSignalIntelToReport(input = {}) {
  return adaptSignalIntelOutput(input, 'signal-intel-report-v1');
}

export function adaptSignalIntelToEastWestProductionContract(input = {}) {
  return adaptSignalIntelOutput(input, 'eastwest-landscape-v1');
}

export const SIGNAL_INTEL_EASTWEST_FIELD_MAPPING = [
  { schemaField: 'reportingContext.reportingPeriods.current', source: 'parsePeriod(period) / UI date input', mapping: 'direct', availability: 'available when report run includes dates' },
  { schemaField: 'reportingContext.reportingPeriods.previousWeek', source: 'derived from current.startDate', mapping: 'transform', availability: 'requires confirmation if client uses non-standard comparison windows' },
  { schemaField: 'reportingContext.reportingPeriods.previousFullMonth', source: 'derived from current.startDate', mapping: 'transform', availability: 'available as boundary only; metrics unavailable unless separately pulled' },
  { schemaField: 'reportingContext.reportingPeriods.ytd', source: 'derived from current.endDate', mapping: 'transform', availability: 'boundary available; metrics unavailable unless separately pulled' },
  { schemaField: 'metrics.mentions.total', source: 'trackerAgent(metrics.mentions.total)', mapping: 'direct', availability: 'available' },
  { schemaField: 'metrics.mentions.dailySeries', source: 'trackerAgent(metrics.dailyStats)', mapping: 'direct', availability: 'available for mentions when dailyStats are present' },
  { schemaField: 'metrics.reach.total', source: 'trackerAgent(metrics.totalReach)', mapping: 'direct', availability: 'available' },
  { schemaField: 'metrics.reach.dailySeries', source: 'trackerAgent(metrics.dailyStats[].reach)', mapping: 'direct', availability: 'often unavailable in current REST summary' },
  { schemaField: 'metrics.sentiment', source: 'trackerAgent(metrics.sentiment)', mapping: 'direct', availability: 'available; percentages preserve source/agent output' },
  { schemaField: 'metrics.sourceTypes', source: 'metrics.sourceCategories', mapping: 'transform', availability: 'available when source categories are emitted' },
  { schemaField: 'metrics.periods.current/previousWeek', source: 'optional measurementManifest.periods', mapping: 'measurement-only transform', availability: 'available when a validated compatible manifest is supplied; previousFullMonth and ytd remain explicitly unavailable when absent' },
  { schemaField: 'sov.current.competitors', source: 'competitive.sovData', mapping: 'transform', availability: 'current period available for found rows only' },
  { schemaField: 'sov.current.competitors[].reach/sentiment/dailySeries/sourceTypes', source: 'optional measurementManifest.sov.current', mapping: 'measurement-only transform', availability: 'available when workbook-backed current competitor details are supplied; blank cells remain unavailable' },
  { schemaField: 'sov.previousWeek/previousFullMonth/ytd', source: 'none in current report object', mapping: 'unavailable', availability: 'requires separate compatible pulls' },
  { schemaField: 'evidence.records', source: 'metrics.topMentions', mapping: 'transform', availability: 'partial: URL/platform/text available; screenshots/timestamps may be missing' },
  { schemaField: 'evidence.records[].relevanceState/approvalState', source: 'metrics.topMentions review metadata', mapping: 'direct or awaiting_verification default', availability: 'client evidence requires explicit relevance and editorial approval' },
  { schemaField: 'approvedNarrative.*', source: 'analysis/reportBuilder output', mapping: 'direct', availability: 'awaiting analyst approval before production export' },
  { schemaField: 'reportingContext.dataScopes', source: 'metrics.diagnostics', mapping: 'transform', availability: 'available; broader/unfiltered unless an existing output flag explicitly confirms a geographic filter' },
  { schemaField: 'optionalModules.operationalMetrics', source: 'metrics fields or socialListening.overview', mapping: 'direct', availability: 'available when emitted; existing estimates remain awaiting verification' },
  { schemaField: 'optionalModules.intelligence.sourceNarrative', source: 'metrics.sourceNarrative', mapping: 'direct', availability: 'available when emitted' },
  { schemaField: 'optionalModules.intelligence.topicClusters/themes/monitoringEvents', source: 'context.topTopics/context.themes/context.events', mapping: 'direct', availability: 'available when Context Scout emits them; approval dependent' },
  { schemaField: 'optionalModules.intelligence.spikeDrivers/sentimentNarrative/channelInsight', source: 'analysis', mapping: 'direct', availability: 'available when Analyst emits them; approval dependent' },
  { schemaField: 'optionalModules.intelligence.competitorNotes', source: 'competitive.competitorNotes', mapping: 'direct', availability: 'available when competitor output is present; approval dependent' },
  { schemaField: 'optionalModules.intelligence.directionalCompetitorIntel', source: 'competitiveLite.competitors', mapping: 'direct', availability: 'optional directional intelligence; not a verified metric substitute' },
  { schemaField: 'optionalModules.intelligence.scamRiskAlert', source: 'report.scamRiskAlert', mapping: 'direct', availability: 'available when Report Builder emits it; approval dependent' },
  { schemaField: 'dataQualityFlags', source: 'output-layer comparison and source review records', mapping: 'direct', availability: 'used to surface snapshot conflicts, semantic-search contradictions, relevance noise, and monitored-zero gaps without reconciliation' },
  { schemaField: 'optionalModules.extended.*', source: 'existing extended output only', mapping: 'direct', availability: 'unsupported by the current standard report object unless explicitly supplied; PPTX attachments are not runtime inputs' },
];
