export const SIGNAL_INTEL_REPORT_SCHEMA_VERSION = 'signal-intel-report-v1';

const display = value => value == null || value === '' ? null : Array.isArray(value) ? `${value.length} records` : typeof value === 'object' ? JSON.stringify(value) : value;
const row = (field, record, provenance, blocker = '') => ({ field, state: record?.state || 'unavailable', value: display(record?.value ?? record?.text ?? record?.points ?? record?.items), provenance: record?.provenance || provenance, blocker });

export function createSignalIntelReport(output) {
  if (output?.schemaVersion !== SIGNAL_INTEL_REPORT_SCHEMA_VERSION) throw new TypeError(`Expected a normalized ${SIGNAL_INTEL_REPORT_SCHEMA_VERSION} report object.`);
  return output;
}

export function buildSignalIntelSafetyInventory(report) {
  const source = report.reportingContext?.provenance?.dataSources?.[0] || { type: 'unknown', source: 'not supplied' };
  const periods = report.reportingContext.reportingPeriods;
  const records = report.evidence?.records || [];
  const narratives = report.approvedNarrative || {};
  const rows = [
    row('reportingPeriods.current', { state: periods.current.state, value: `${periods.current.startDate} to ${periods.current.endDate}` }, source),
    ...['primaryMetrics', 'mentionSample', 'reach'].map(key => row(`dataScopes.${key}`, { ...report.reportingContext.dataScopes?.[key], value: report.reportingContext.dataScopes?.[key]?.geography }, source)),
    row('metrics.mentions.total', report.metrics.mentions.total, source), row('metrics.mentions.dailyAverage', report.metrics.mentions.dailyAverage, source), row('metrics.mentions.dailySeries', report.metrics.mentions.dailySeries, source, 'Daily mention points are required.'),
    row('metrics.reach.total', report.metrics.reach.total, source), row('metrics.reach.social', report.metrics.reach.social, source), row('metrics.reach.nonSocial', report.metrics.reach.nonSocial, source), row('metrics.reach.dailySeries', report.metrics.reach.dailySeries, source, 'Daily reach points are required.'),
    row('metrics.sourceTypes', report.metrics.sourceTypes, source),
    ...['positive', 'negative', 'neutral'].flatMap(key => [row(`metrics.sentiment.${key}.count`, report.metrics.sentiment[key]?.count, source), row(`metrics.sentiment.${key}.percentage`, report.metrics.sentiment[key]?.percentage, source)]),
    row('sov.current', report.sov?.current?.competitors?.length ? { state: report.sov.current.competitors.every(item => item.state === 'verified') ? 'verified' : 'awaiting_verification', items: report.sov.current.competitors } : null, source),
    row('evidence.records', { state: records.length && records.every(item => item.relevanceState === 'verified' && item.approvalState === 'verified') ? 'verified' : records.length ? 'awaiting_verification' : 'unavailable', items: records }, source, 'Evidence requires relevance and editorial approval.'),
    ...['previousReportSummary', 'executiveSummary', 'positiveThemes', 'negativeThemes', 'recommendations'].map(key => row(`approvedNarrative.${key}`, narratives[key], source, `Approved ${key} content is required.`)),
    ...Object.entries(report.optionalModules?.operationalMetrics || {}).map(([key, record]) => row(`optionalModules.operationalMetrics.${key}`, record, source)),
    ...Object.entries(report.optionalModules?.intelligence || {}).map(([key, record]) => row(`optionalModules.intelligence.${key}`, record, source)),
    ...(report.dataQualityFlags || []).map(flag => row(`dataQualityFlags.${flag.id}`, { state: flag.state, text: flag.message, provenance: flag.provenance }, source, flag.severity === 'blocker' ? flag.message : '')),
  ];
  const blockers = rows.filter(item => item.blocker && item.state !== 'verified');
  return { inventoryVersion: 'signal-intel-standard-readiness-v1', generatedAt: report.reportingContext.generatedAt, period: periods.current, sourceRunId: report.reportingContext.provenance.sourceRunId, rows, blockers, summary: { verified: rows.filter(item => item.state === 'verified').length, unavailable: rows.filter(item => item.state === 'unavailable').length, awaitingVerification: rows.filter(item => item.state === 'awaiting_verification').length, blockers: blockers.length } };
}

export function assertSignalIntelClientExportable(report, options = {}) {
  const inventory = buildSignalIntelSafetyInventory(report);
  if (inventory.blockers.length) { const error = new Error(`Signal Intel client export blocked: ${inventory.blockers.map(item => item.field).join(', ')}`); error.inventory = inventory; error.options = options; throw error; }
  return inventory;
}
