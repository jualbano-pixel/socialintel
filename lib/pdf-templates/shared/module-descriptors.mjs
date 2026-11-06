const STATES = {
  verified: 'verified',
  unavailable: 'unavailable',
  awaitingVerification: 'awaiting_verification',
};

const hasItems = record => Array.isArray(record?.items) && record.items.length > 0;
const hasText = record => Boolean(record?.text);
const hasMetric = record => record?.value !== null && record?.value !== undefined;

function descriptor({
  moduleId,
  title,
  periodKey = 'current',
  state = STATES.unavailable,
  approvalState = null,
  required = false,
  omitWhenEmpty = false,
  layoutVariant = 'standard',
  content = {},
  provenanceRefs = [],
}) {
  return {
    moduleId,
    instanceId: `${moduleId}:${periodKey}`,
    title,
    periodKey,
    scopeRef: `reportingContext.dataScopes.${moduleId === 'reach' ? 'reach' : moduleId === 'evidence' ? 'mentionSample' : 'primaryMetrics'}`,
    provenanceRefs: provenanceRefs.filter(Boolean),
    state,
    approvalState,
    layoutVariant,
    continuation: { index: 1, total: 1, continuedFrom: null },
    content,
    assets: [],
    exportPolicy: { required, omitWhenEmpty, blockWhenInvalid: required },
  };
}

function metricState(...records) {
  const present = records.filter(Boolean);
  if (!present.length || present.every(record => record.state === STATES.unavailable)) return STATES.unavailable;
  if (present.some(record => record.state === STATES.awaitingVerification)) return STATES.awaitingVerification;
  return STATES.verified;
}

function narrativeState(...records) {
  const present = records.filter(record => hasItems(record) || hasText(record));
  if (!present.length) return STATES.unavailable;
  return present.some(record => record.state !== STATES.verified) ? STATES.awaitingVerification : STATES.verified;
}

export const STANDARD_MODULE_SEQUENCE = [
  'overview',
  'additionalMetrics',
  'mentions',
  'sources',
  'reach',
  'sentiment',
  'evidence',
  'conversationDrivers',
  'monitoringEvents',
  'competitiveIntelligence',
  'shareOfVoice',
  'findings',
  'recommendations',
];

export function resolveStandardModules(report, {
  requiredModules = ['overview', 'mentions', 'sources', 'reach', 'sentiment', 'evidence', 'findings', 'recommendations'],
} = {}) {
  const required = moduleId => requiredModules.includes(moduleId);
  const periods = report.reportingContext.reportingPeriods;
  const source = report.reportingContext.provenance.dataSources?.[0];
  const intelligence = report.optionalModules?.intelligence || {};
  const operational = report.optionalModules?.operationalMetrics || {};
  const narratives = report.approvedNarrative || {};
  const evidence = report.evidence?.records || [];
  const competitors = report.sov?.current?.competitors || [];
  const topicEntries = (intelligence.topicClusters?.items || []).map(item => ({
    ...item,
    intelligenceBasis: 'source_reported_measurement',
    verificationState: intelligence.topicClusters.state,
    provenance: intelligence.topicClusters.provenance,
  }));
  const spikeEntries = (intelligence.spikeDrivers?.items || []).map(item => ({
    value: item,
    intelligenceBasis: 'agent_inferred',
    verificationState: intelligence.spikeDrivers.state,
    provenance: intelligence.spikeDrivers.provenance,
  }));

  const availableOperational = Object.entries(operational).filter(([, record]) => hasMetric(record));
  const modules = [
    descriptor({
      moduleId: 'overview', title: 'Overview', required: required('overview'),
      state: narrativeState(narratives.executiveSummary), approvalState: narratives.executiveSummary?.state,
      content: { reportingContext: report.reportingContext, executiveSummary: narratives.executiveSummary },
      provenanceRefs: [source, narratives.executiveSummary?.provenance],
    }),
    descriptor({
      moduleId: 'additionalMetrics', title: 'Additional Metrics', omitWhenEmpty: true,
      state: metricState(...availableOperational.map(([, record]) => record)),
      approvalState: availableOperational.some(([, record]) => record.state !== STATES.verified) ? STATES.awaitingVerification : STATES.verified,
      content: { metrics: availableOperational.map(([key, record]) => ({ key, record })) },
      provenanceRefs: availableOperational.map(([, record]) => record.provenance),
    }),
    descriptor({
      moduleId: 'mentions', title: 'Mentions', required: required('mentions'),
      state: metricState(report.metrics.mentions.total, report.metrics.mentions.dailySeries),
      content: { metrics: report.metrics.mentions, comparisonPeriods: periods }, provenanceRefs: [source],
    }),
    descriptor({
      moduleId: 'sources', title: 'Source Mix', required: required('sources'),
      state: report.metrics.sourceTypes?.state || STATES.unavailable,
      content: { sourceTypes: report.metrics.sourceTypes, narrative: intelligence.sourceNarrative },
      provenanceRefs: [report.metrics.sourceTypes?.provenance, intelligence.sourceNarrative?.provenance],
    }),
    descriptor({
      moduleId: 'reach', title: 'Reach', required: required('reach'),
      state: metricState(report.metrics.reach.total, report.metrics.reach.social, report.metrics.reach.nonSocial, report.metrics.reach.dailySeries),
      content: { metrics: report.metrics.reach, comparisonPeriods: periods }, provenanceRefs: [source],
    }),
    descriptor({
      moduleId: 'sentiment', title: 'Sentiment', required: required('sentiment'),
      state: metricState(report.metrics.sentiment.positive?.count, report.metrics.sentiment.negative?.count, report.metrics.sentiment.neutral?.count),
      approvalState: intelligence.sentimentNarrative?.state,
      content: { sentiment: report.metrics.sentiment, narrative: intelligence.sentimentNarrative, comparisonPeriods: periods },
      provenanceRefs: [source, intelligence.sentimentNarrative?.provenance],
    }),
    descriptor({
      moduleId: 'evidence', title: 'Top Mentions And Evidence', required: required('evidence'),
      state: evidence.length ? (evidence.every(item => item.relevanceState === STATES.verified && item.approvalState === STATES.verified) ? STATES.verified : STATES.awaitingVerification) : STATES.unavailable,
      approvalState: evidence.length ? STATES.awaitingVerification : STATES.unavailable,
      content: { records: evidence, screenshotPolicy: report.evidence?.screenshotPolicy },
      provenanceRefs: evidence.map(item => item.provenance),
    }),
    descriptor({
      moduleId: 'conversationDrivers', title: 'Conversation Drivers', omitWhenEmpty: true,
      state: narrativeState(intelligence.topicClusters, intelligence.spikeDrivers),
      approvalState: metricState(intelligence.topicClusters, intelligence.spikeDrivers),
      content: { measuredTopics: topicEntries, inferredDrivers: spikeEntries },
      provenanceRefs: [intelligence.topicClusters?.provenance, intelligence.spikeDrivers?.provenance],
    }),
    descriptor({
      moduleId: 'monitoringEvents', title: 'Monitoring Events', omitWhenEmpty: true,
      state: intelligence.monitoringEvents?.state || STATES.unavailable,
      approvalState: intelligence.monitoringEvents?.state,
      content: { events: intelligence.monitoringEvents?.items || [] },
      provenanceRefs: [intelligence.monitoringEvents?.provenance],
    }),
    descriptor({
      moduleId: 'competitiveIntelligence', title: 'Competitive Intelligence', omitWhenEmpty: true,
      state: intelligence.competitorNotes?.state || STATES.unavailable,
      approvalState: intelligence.competitorNotes?.state,
      content: { notes: intelligence.competitorNotes?.items || [] },
      provenanceRefs: [intelligence.competitorNotes?.provenance],
    }),
    descriptor({
      moduleId: 'shareOfVoice', title: 'Share Of Voice', omitWhenEmpty: true,
      state: competitors.length ? (competitors.every(item => item.state === STATES.verified) ? STATES.verified : STATES.awaitingVerification) : STATES.unavailable,
      content: { current: report.sov.current, comparisons: { previousWeek: report.sov.previousWeek, previousFullMonth: report.sov.previousFullMonth, ytd: report.sov.ytd } },
      provenanceRefs: competitors.map(item => item.provenance),
    }),
    descriptor({
      moduleId: 'findings', title: 'Findings', required: required('findings'),
      state: narrativeState(narratives.positiveThemes, narratives.negativeThemes),
      approvalState: metricState(narratives.positiveThemes, narratives.negativeThemes),
      content: { positive: narratives.positiveThemes, negative: narratives.negativeThemes },
      provenanceRefs: [narratives.positiveThemes?.provenance, narratives.negativeThemes?.provenance],
    }),
    descriptor({
      moduleId: 'recommendations', title: 'Recommendations', required: required('recommendations'),
      state: narrativeState(narratives.recommendations), approvalState: narratives.recommendations?.state,
      content: { recommendations: narratives.recommendations }, provenanceRefs: [narratives.recommendations?.provenance],
    }),
  ];

  return STANDARD_MODULE_SEQUENCE
    .map(moduleId => modules.find(module => module.moduleId === moduleId))
    .filter(module => module && !(module.exportPolicy.omitWhenEmpty && module.state === STATES.unavailable));
}

