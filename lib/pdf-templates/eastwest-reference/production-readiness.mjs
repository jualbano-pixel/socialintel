const display = value => {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return `${value.length} record${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
};

function row(field, record, provenance, blocker = '', note = '') {
  const state = record?.state || 'unavailable';
  return {
    field,
    state,
    value: display(record?.value ?? record?.text ?? record?.points ?? record?.items ?? null),
    provenance: record?.provenance || provenance,
    blocker,
    note,
  };
}

function quarantineInventoryRows(contract, source) {
  const records = [
    ['approvedNarrative.executiveSummary', contract.approvedNarrative?.executiveSummary],
    ['approvedNarrative.positiveThemes', contract.approvedNarrative?.positiveThemes],
    ['approvedNarrative.negativeThemes', contract.approvedNarrative?.negativeThemes],
    ['approvedNarrative.recommendations', contract.approvedNarrative?.recommendations],
    ['optionalModules.intelligence.spikeDrivers', contract.optionalModules?.intelligence?.spikeDrivers],
    ['optionalModules.intelligence.monitoringEvents', contract.optionalModules?.intelligence?.monitoringEvents],
    ['optionalModules.intelligence.competitorNotes', contract.optionalModules?.intelligence?.competitorNotes],
  ];
  return records.flatMap(([field, record]) => {
    const itemEligibility = record?.itemPresentationEligibility || [];
    const itemCount = itemEligibility.filter(item => item.state === 'quarantined').length;
    const recordCount = record?.presentationEligibility?.state === 'quarantined' ? 1 : 0;
    const count = itemCount + recordCount;
    if (!count) return [];
    const reasonCodes = [...new Set([
      ...(record?.presentationEligibility?.reasonCodes || []),
      ...itemEligibility.flatMap(item => item.reasonCodes || []),
    ])];
    return [row(
      `${field}.presentationEligibility`,
      { state: 'awaiting_verification', value: `${count} quarantined`, provenance: record?.provenance },
      source,
      '',
      `Excluded from client presentation: ${reasonCodes.join(', ')}. Source content remains unchanged.`,
    )];
  });
}

export function validateEastWestQuarantineContract(contract) {
  const flagIds = new Set((contract.dataQualityFlags || []).map(flag => flag.id));
  const issues = [];
  const records = [
    ['approvedNarrative.executiveSummary', contract.approvedNarrative?.executiveSummary],
    ['approvedNarrative.positiveThemes', contract.approvedNarrative?.positiveThemes],
    ['approvedNarrative.negativeThemes', contract.approvedNarrative?.negativeThemes],
    ['approvedNarrative.recommendations', contract.approvedNarrative?.recommendations],
    ['optionalModules.intelligence.spikeDrivers', contract.optionalModules?.intelligence?.spikeDrivers],
    ['optionalModules.intelligence.monitoringEvents', contract.optionalModules?.intelligence?.monitoringEvents],
    ['optionalModules.intelligence.competitorNotes', contract.optionalModules?.intelligence?.competitorNotes],
  ];
  for (const [field, record] of records) {
    const eligibility = [record?.presentationEligibility, ...(record?.itemPresentationEligibility || [])].filter(Boolean);
    eligibility.forEach((item, index) => {
      if (item.state !== 'quarantined') return;
      if (!item.reasonCodes?.length) issues.push({ field, index, code: 'quarantine-without-reason' });
      for (const flagId of item.qualityFlagIds || []) {
        if (!flagIds.has(flagId)) issues.push({ field, index, code: 'quarantine-without-quality-flag', flagId });
      }
      if (!item.qualityFlagIds?.length) issues.push({ field, index, code: 'quarantine-without-quality-flag' });
    });
  }
  return { valid: issues.length === 0, issues };
}

export function buildEastWestReadinessInventory(contract) {
  const source = contract.reportingContext.provenance.dataSources[0];
  const periods = contract.reportingContext.reportingPeriods;
  const records = contract.evidence.records || [];
  const scopes = contract.reportingContext.dataScopes || {};
  const optional = contract.optionalModules || {};
  const qualityFlags = contract.dataQualityFlags || [];
  const metricPeriods = contract.metrics.periods || null;
  const evidenceFieldState = key => records.length && records.every(item => item[key]) ? 'verified' : 'unavailable';
  const evidenceValue = key => records.filter(item => item[key]).length;
  const rows = [
    row('reportingPeriods.current', { state: periods.current.state, value: `${periods.current.startDate} to ${periods.current.endDate}` }, source),
    row('reportingPeriods.previousWeek.boundary', { state: periods.previousWeek.state, value: `${periods.previousWeek.startDate} to ${periods.previousWeek.endDate}` }, metricPeriods ? source : { type: 'derived_boundary', source: 'current.startDate' }, '', metricPeriods?.previousWeek?.state === 'verified' ? 'Compatible dataset supplied.' : 'Dataset not pulled.'),
    row('reportingPeriods.previousFullMonth.boundary', { state: periods.previousFullMonth.state, value: `${periods.previousFullMonth.startDate} to ${periods.previousFullMonth.endDate}` }, { type: 'derived_boundary', source: 'current.startDate' }, '', 'Dataset not pulled.'),
    row('reportingPeriods.ytd.boundary', { state: periods.ytd.state, value: `${periods.ytd.startDate} to ${periods.ytd.endDate}` }, { type: 'derived_boundary', source: 'current.endDate' }, '', 'Dataset not pulled.'),
    row('dataScopes.primaryMetrics', { ...scopes.primaryMetrics, value: scopes.primaryMetrics?.geography }, source),
    row('dataScopes.mentionSample', { ...scopes.mentionSample, value: scopes.mentionSample?.geography }, source),
    row('dataScopes.reach', { ...scopes.reach, value: scopes.reach?.geography }, source),
    row('metrics.mentions.total', contract.metrics.mentions.total, source),
    row('metrics.mentions.dailyAverage', contract.metrics.mentions.dailyAverage, source),
    row('metrics.mentions.dailySeries.current', contract.metrics.mentions.dailySeries, source),
    row('metrics.mentions.dailySeries.previousWeek', metricPeriods?.previousWeek?.mentions?.dailySeries || null, source, 'Required for page 4 comparison.'),
    row('metrics.mentions.dailySeries.previousFullMonth', metricPeriods?.previousFullMonth?.mentions?.dailySeries || null, source, 'Required for page 4 comparison.'),
    row('metrics.reach.total', contract.metrics.reach.total, source),
    row('metrics.reach.social', contract.metrics.reach.social, source),
    row('metrics.reach.nonSocial', contract.metrics.reach.nonSocial, source),
    row('metrics.reach.dailySeries.current', contract.metrics.reach.dailySeries, source, contract.metrics.reach.dailySeries?.state === 'verified' ? '' : 'Daily reach points are absent; page 6 trend cannot render.'),
    ...(metricPeriods ? [
      row('metrics.reach.previousWeek', metricPeriods.previousWeek?.reach, source, 'Previous-week reach dataset required.'),
      row('metrics.reach.previousFullMonth', metricPeriods.previousFullMonth?.reach, source, 'Previous-full-month reach dataset required.'),
    ] : [row('metrics.reach.comparisonPeriods', null, source, 'Previous-week and previous-full-month reach datasets are required.')]),
    row('metrics.sentiment.positive.count', contract.metrics.sentiment.positive.count, source),
    row('metrics.sentiment.positive.percentage', contract.metrics.sentiment.positive.percentage, source),
    row('metrics.sentiment.negative.count', contract.metrics.sentiment.negative.count, source),
    row('metrics.sentiment.negative.percentage', contract.metrics.sentiment.negative.percentage, source),
    row('metrics.sentiment.neutral.count', contract.metrics.sentiment.neutral.count, source),
    row('metrics.sentiment.neutral.percentage', contract.metrics.sentiment.neutral.percentage, source),
    ...(metricPeriods ? [
      row('metrics.sentiment.previousWeek', metricPeriods.previousWeek?.sentiment, source, 'Previous-week sentiment dataset required.'),
      row('metrics.sentiment.previousFullMonth', metricPeriods.previousFullMonth?.sentiment, source, 'Previous-full-month sentiment dataset required.'),
    ] : [row('metrics.sentiment.comparisonPeriods', null, source, 'Previous-week and previous-full-month sentiment datasets are required.')]),
    row('metrics.sourceTypes.current', contract.metrics.sourceTypes, source),
    ...(metricPeriods ? [
      row('metrics.sourceTypes.previousWeek', metricPeriods.previousWeek?.sourceTypes, source, 'Previous-week source-type dataset required.'),
      row('metrics.sourceTypes.previousFullMonth', metricPeriods.previousFullMonth?.sourceTypes, source, 'Previous-full-month source-type dataset required.'),
    ] : [row('metrics.sourceTypes.comparisonPeriods', null, source, 'Previous-week and previous-full-month source-type datasets are required.')]),
    row('sov.current', contract.sov.current.competitors?.length ? { state: contract.sov.current.competitors.every(item => item.state === 'verified') ? 'verified' : 'awaiting_verification', items: contract.sov.current.competitors } : null, source, 'Current-period cohort contains an unavailable or review-dependent row.'),
    row('sov.previousWeek', contract.sov.previousWeek, source, 'Compatible competitor cohort dataset required.'),
    row('sov.previousFullMonth', contract.sov.previousFullMonth, source, 'Compatible competitor cohort dataset required.'),
    row('sov.ytd', contract.sov.ytd, source, 'Compatible competitor cohort dataset required.'),
    row('evidence.records', { state: records.length && records.every(item => item.relevanceState === 'verified' && item.approvalState === 'verified') ? 'verified' : records.length ? 'awaiting_verification' : 'unavailable', items: records }, source, 'Evidence candidates require relevance and editorial approval.'),
    row('evidence.relevance', { state: records.length ? records.every(item => item.relevanceState === 'verified') ? 'verified' : 'awaiting_verification' : 'unavailable', value: `${records.filter(item => item.relevanceState === 'verified').length}/${records.length}` }, source, 'Ambiguous EastWest-name matches cannot be used as approved evidence.'),
    row('evidence.sourceUrl', { state: evidenceFieldState('sourceUrl'), value: `${evidenceValue('sourceUrl')}/${records.length}` }, source, 'Every client-facing evidence item requires a source URL.'),
    row('evidence.platform', { state: evidenceFieldState('platform'), value: `${evidenceValue('platform')}/${records.length}` }, source),
    row('evidence.timestamp', { state: evidenceFieldState('timestamp'), value: `${evidenceValue('timestamp')}/${records.length}` }, source, 'Normalized timestamps are absent.'),
    row('evidence.screenshotAsset', { state: records.length && records.every(item => item.screenshotAsset?.state === 'verified') ? 'verified' : 'unavailable', value: `0/${records.length}` }, source, 'Approved screenshots are required for evidence pages.'),
    row('evidence.reach', { state: records.length && records.every(item => item.reach?.state === 'verified') ? 'verified' : 'unavailable', value: `${records.filter(item => item.reach?.state === 'verified').length}/${records.length}` }, source, 'Evidence-level reach is absent.'),
    row('evidence.views', { state: records.length && records.every(item => item.views?.state === 'verified') ? 'verified' : 'unavailable', value: `${records.filter(item => item.views?.state === 'verified').length}/${records.length}` }, source, 'Evidence-level views are absent.'),
    row('approvedNarrative.previousReportSummary', contract.approvedNarrative.previousReportSummary, source, 'Approved previous-report summary required or mark not applicable.'),
    row('approvedNarrative.executiveSummary', contract.approvedNarrative.executiveSummary, source, 'Approved current-period summary required.'),
    row('approvedNarrative.positiveThemes', contract.approvedNarrative.positiveThemes, source, 'Approved positive findings required.'),
    row('approvedNarrative.negativeThemes', contract.approvedNarrative.negativeThemes, source, 'Approved negative findings required.'),
    row('approvedNarrative.recommendations', contract.approvedNarrative.recommendations, source, 'Approved recommendations required.'),
    row('branding.clientLogo', null, { type: 'asset_library', source: 'not supplied for production' }, 'Approved EastWest production logo required.'),
    row('branding.preparedByLogo', null, { type: 'asset_library', source: 'not supplied for production' }, 'Approved Praxis production logo required.'),
    row('wordCloud.weightedTerms', null, source, 'Weighted current-period term dataset or approved word-cloud export required.'),
    ...Object.entries(optional.operationalMetrics || {}).map(([key, record]) => row(`optionalModules.operationalMetrics.${key}`, record, source, '', 'Optional existing Signal Intel metric; render only when present.')),
    ...Object.entries(optional.intelligence || {}).map(([key, record]) => row(`optionalModules.intelligence.${key}`, record, source, '', 'Optional existing Signal Intel intelligence; approval state is preserved.')),
    ...Object.entries(optional.extended || {}).map(([key, record]) => row(`optionalModules.extended.${key}`, record, source, '', 'Unsupported by the current standard report object unless existing output explicitly supplies it.')),
    ...quarantineInventoryRows(contract, source),
    ...qualityFlags.map(flag => row(`dataQualityFlags.${flag.id}`, { state: flag.state, text: flag.message, provenance: flag.provenance }, source, flag.severity === 'blocker' ? flag.message : '', 'Source conflict retained for review.')),
  ];

  const blockers = rows.filter(item => item.blocker && item.state !== 'verified');
  return {
    inventoryVersion: 'eastwest-readiness-v1',
    generatedAt: contract.reportingContext.generatedAt,
    period: periods.current,
    sourceRunId: contract.reportingContext.provenance.sourceRunId,
    rows,
    summary: {
      verified: rows.filter(item => item.state === 'verified').length,
      unavailable: rows.filter(item => item.state === 'unavailable').length,
      awaitingVerification: rows.filter(item => item.state === 'awaiting_verification').length,
      blockers: blockers.length,
    },
    blockers,
  };
}

export function eastWestCollectionChecklist(inventory) {
  return [
    { group: 'Raw chart datasets', items: ['Previous-week and previous-full-month daily mentions', 'Current and comparison-period daily reach', 'Comparison-period source-type counts and denominators', 'Current, previous-week, previous-full-month, and YTD SOV for one approved competitor cohort', 'Current-period weighted word-cloud terms'] },
    { group: 'Approved screenshots and evidence', items: ['Source URLs and normalized timestamps for selected evidence', 'Full-resolution screenshots for each selected positive, negative, neutral, and competitor item', 'Evidence-level reach/views with provenance', 'Positive and negative competitor evidence for each approved cohort member'] },
    { group: 'Branding', items: ['Approved EastWest logo file', 'Approved Praxis logo file', 'Confirmed production font files or written approval for the current substitute'] },
    { group: 'Approved narrative', items: ['Previous-report summary or explicit not-applicable approval', 'Current-period executive summary', 'Positive and negative findings', 'Recommendations', 'Approved chart callouts and competitor peak captions'] },
  ].map(group => ({ ...group, status: 'required', relatedBlockers: inventory.blockers.filter(item => group.items.some(entry => entry.toLowerCase().includes(item.field.split('.').at(-1)?.toLowerCase() || '__none__'))).length }));
}

export function eastWestMeasurementCollectionChecklist(inventory) {
  return [
    { group: 'Remaining chart datasets', items: ['Previous-full-month mentions, reach, sentiment, and source-type counts', 'Previous-week, previous-full-month, and YTD SOV for the same cohort', 'Current-period weighted word-cloud terms'] },
    { group: 'Signal Intel evidence output', items: ['Signal Intel-selected evidence for the 789 snapshot', 'Approved source URLs, timestamps, screenshots, and captions', 'Item-level reach/views where available'] },
    { group: 'Branding', items: ['Approved EastWest logo file', 'Approved Praxis logo file', 'Confirmed production font files or approval for the current substitute'] },
    { group: 'Approved intelligence', items: ['Previous-report summary or explicit not-applicable approval', 'Executive summary and source/sentiment narratives for the 789 snapshot', 'Approved findings, recommendations, chart callouts, and competitor commentary'] },
  ].map(group => ({ ...group, status: 'required', relatedBlockers: inventory.blockers.filter(item => group.items.some(entry => entry.toLowerCase().includes(item.field.split('.').at(-1)?.toLowerCase() || '__none__'))).length }));
}
