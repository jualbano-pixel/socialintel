import { assertSignalIntelClientExportable } from '../shared/signal-intel-report.mjs';
import { resolveStandardModules } from '../shared/module-descriptors.mjs';
import {
  balancedChunks,
  chunk,
  displayMetric,
  escapeHtml as esc,
  formatNumber,
  lineChart,
  missingState,
  rankedBars,
  sentimentDonut,
  stateLabel,
  statePill,
} from '../shared/presentation-primitives.mjs';
import { STANDARD_PAGE, STANDARD_TEMPLATE_ID, STANDARD_TOKENS } from './spec.mjs';

const labelize = value => String(value || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

const reportPeriod = report => report.reportingContext.reportingPeriods.current;

function page({ title = '', section = '', body = '', period, className = '', continuation = 0, diagnostics = false }) {
  const continuationLabel = continuation ? ` <span class="continued">Continued ${continuation + 1}</span>` : '';
  return `<section class="report-page ${esc(className)}${diagnostics ? ' diagnostics-page' : ''}"><div class="page-rail"></div><header><div class="wordmark"><b>SIGNAL</b> INTEL</div><span>${esc(section)}</span><strong>PRAXIS EXPERIENTIAL</strong></header><main>${title ? `<div class="title-row"><h1>${esc(title)}${continuationLabel}</h1></div>` : ''}${body}</main><footer><span>${esc(period.label)}</span><span class="scope-footer">Source scope and provenance retained in report object</span><span class="page-number"></span></footer><div class="preview-stamp">INTERNAL REVIEW PREVIEW</div></section>`;
}

function statusBanner(module, message) {
  if (module.state === 'verified' && (!module.approvalState || module.approvalState === 'verified')) return '';
  return `<div class="status-banner">${statePill(module.approvalState || module.state)}<span>${esc(message)}</span></div>`;
}

function scopeText(scope) {
  if (!scope) return 'Scope unavailable';
  return scope.philippinesOnly ? `Philippines-filtered (${scope.geography})` : 'Broader or unfiltered scope';
}

function metricCard(label, record) {
  return `<div class="metric-card"><span>${esc(label)}</span><b>${esc(displayMetric(record))}</b>${statePill(record?.state, record?.calculationStatus === 'existing_estimate' ? 'Est.' : '')}</div>`;
}

function percentageMetricCard(label, record) {
  const displayRecord = record?.value === null || record?.value === undefined
    ? record
    : { ...record, displayValue: `${record.value}%` };
  return metricCard(label, displayRecord);
}

function numberedList(items = [], start = 0, tone = '') {
  return `<div class="numbered-list ${tone}">${items.map((item, index) => `<article><b>${String(start + index + 1).padStart(2, '0')}</b><p>${esc(typeof item === 'string' ? item : item.value || item.text || item.description || '')}</p></article>`).join('')}</div>`;
}

function qualityFlag(report, id) {
  return report.dataQualityFlags?.find(flag => flag.id === id);
}

function renderOverview(module, report, pages, period) {
  const context = module.content.reportingContext;
  const summary = module.content.executiveSummary;
  const previous = report.approvedNarrative.previousReportSummary;
  const primaryScope = scopeText(context.dataScopes?.primaryMetrics);
  const evidenceScope = scopeText(context.dataScopes?.mentionSample);
  const reachScope = scopeText(context.dataScopes?.reach);
  pages.push(page({
    title: 'Executive Overview', section: 'Overview', period, className: 'overview-page',
    body: `${statusBanner(module, 'Agent-produced executive narrative requires editorial approval before client export.')}<div class="overview-metrics">${metricCard('Mentions', report.metrics.mentions.total)}${metricCard('Reach', report.metrics.reach.total)}${percentageMetricCard('Positive sentiment', report.metrics.sentiment.positive.percentage)}</div><div class="scope-status"><strong>Scope status</strong><span>Mentions and sentiment: ${esc(primaryScope)}. Reach: ${esc(reachScope)}. Evidence sample: ${esc(evidenceScope)}.</span></div>${summary?.text ? `<div class="narrative-panel"><span class="eyebrow">Executive summary</span><p>${esc(summary.text)}</p></div>` : missingState('Executive summary unavailable', 'No current-period narrative was supplied.')}<div class="previous-summary">${previous?.items?.length ? `<strong>Previous report</strong>${numberedList(previous.items)}` : missingState('Previous-report summary unavailable', 'No approved previous-period summary is present in this Signal Intel output.')}</div>`,
  }));
}

function renderAdditionalMetrics(module, _report, pages, period) {
  const groups = balancedChunks(module.content.metrics, 6);
  groups.forEach((items, index) => pages.push(page({
    title: 'Additional Metrics', section: 'Overview', period, continuation: index, className: 'additional-metrics',
    body: `${statusBanner(module, 'Source estimate labels are preserved. These values remain awaiting verification.')}<p class="module-intro">Additional intelligence already produced by Signal Intel. Values marked Est. are not promoted to verified metrics.</p><div class="metric-grid">${items.map(({ key, record }) => metricCard(labelize(key), record)).join('')}</div>`,
  })));
}

function renderMentions(module, report, pages, period) {
  const metrics = module.content.metrics;
  const chart = lineChart(metrics.dailySeries);
  const conflict = qualityFlag(report, 'snapshot-total-conflict');
  pages.push(page({
    title: 'Mentions', section: 'Performance', period, className: 'mentions-page',
    body: `<div class="metric-lead"><span>Current-period total</span><b>${esc(displayMetric(metrics.total))}</b><small>${esc(displayMetric(metrics.dailyAverage))} daily average</small></div><div class="chart-stage">${chart || missingState('Daily mention trend unavailable', 'The completed Signal Intel export does not contain raw daily mention points.')}</div><aside class="comparison-panel">${missingState('Comparison periods unavailable', 'Previous week and previous full month datasets were not supplied for this run.')}</aside>${conflict ? `<div class="conflict-note"><strong>Snapshot conflict retained</strong><span>${esc(conflict.message)}</span></div>` : ''}`,
  }));
}

function renderSources(module, _report, pages, period) {
  const sourceTypes = module.content.sourceTypes;
  pages.push(page({
    title: 'Source Mix', section: 'Performance', period, className: 'sources-page',
    body: `<div class="chart-stage wide">${rankedBars(sourceTypes.items, { value: item => item.percentage?.value, suffix: '%' }) || missingState('Source mix unavailable', 'No structured source categories were supplied.')}</div><aside class="comparison-panel">${missingState('Comparison source mix unavailable', 'Matching previous-week and previous-full-month source datasets are required.')}</aside>${module.content.narrative?.text ? `<div class="narrative-strip"><span>Source narrative</span><p>${esc(module.content.narrative.text)}</p>${statePill(module.content.narrative.state)}</div>` : ''}`,
  }));
}

function renderReach(module, _report, pages, period) {
  const metrics = module.content.metrics;
  pages.push(page({
    title: 'Reach', section: 'Performance', period, className: 'reach-page',
    body: `<div class="three-metrics">${metricCard('Total reach', metrics.total)}${metricCard('Social reach', metrics.social)}${metricCard('Non-social reach', metrics.nonSocial)}</div><div class="chart-stage lower">${lineChart(metrics.dailySeries, { color: 'var(--chart-teal)' }) || missingState('Daily reach trend unavailable', 'Rounded aggregate reach is present, but the completed output contains no raw daily reach series.')}</div><aside class="comparison-panel">${missingState('Comparison reach unavailable', 'Previous-week and previous-full-month reach datasets were not supplied.')}</aside>`,
  }));
}

function renderSentiment(module, _report, pages, period) {
  const narrative = module.content.narrative;
  pages.push(page({
    title: 'Sentiment', section: 'Performance', period, className: 'sentiment-page',
    body: `${statusBanner(module, 'Measured sentiment and agent-produced interpretation retain separate verification states.')}<div class="sentiment-layout">${sentimentDonut(module.content.sentiment) || missingState('Sentiment unavailable', 'Counts and compatible percentages are required.')}<aside>${missingState('Comparison sentiment unavailable', 'Previous-week and previous-full-month sentiment datasets were not supplied.')}</aside></div>${narrative?.text ? `<div class="narrative-strip sentiment-copy"><span>Agent-inferred interpretation</span><p>${esc(narrative.text)}</p>${statePill(narrative.state)}</div>` : ''}`,
  }));
}

function evidenceCard(record) {
  const source = record.sourceUrl
    ? `<span class="source-link">${esc(record.sourceUrl)}</span>`
    : `<span class="source-link unavailable">Source URL unavailable</span>`;
  return `<article class="evidence-card"><div class="evidence-shot">${statePill(record.screenshotAsset?.state)}<span>Approved screenshot unavailable</span></div><div class="evidence-meta"><b>${esc(record.platform || 'Platform unavailable')}</b><span>${esc(record.timestamp || 'Timestamp unavailable')}</span><span>${esc(record.sentiment || 'Unclassified')}</span></div><h2>${esc(record.title || 'Untitled mention')}</h2><p>${esc(record.caption)}</p>${source}<div class="review-box"><strong>Evidence review</strong><span>${esc(record.reviewNote || 'Editorial review required.')}</span></div></article>`;
}

function renderEvidence(module, _report, pages, period) {
  const records = module.content.records;
  if (!records.length) {
    pages.push(page({ title: 'Top Mentions And Evidence', section: 'Evidence', period, body: missingState('Evidence unavailable', 'No period-correct evidence records were supplied.') }));
    return;
  }
  chunk(records, 2).forEach((recordsChunk, index) => pages.push(page({
    title: 'Top Mentions And Evidence', section: 'Evidence', period, continuation: index, className: 'evidence-page',
    body: `${statusBanner(module, 'Candidates remain excluded from client-ready evidence until relevance, source, screenshot, and editorial requirements are satisfied.')}<div class="evidence-grid">${recordsChunk.map(evidenceCard).join('')}</div>`,
  })));
}

function renderConversationDrivers(module, _report, pages, period) {
  const measured = module.content.measuredTopics;
  const inferred = module.content.inferredDrivers;
  if (measured.length) pages.push(page({
    title: 'Conversation Drivers', section: 'Intelligence', period, className: 'drivers-page',
    body: `${statusBanner(module, 'Source-reported counts are shown separately from editorial verification.')}<div class="dimension-key"><span class="basis measured">Source-reported / measured</span>${statePill(measured[0].verificationState)}</div><div class="topic-grid">${measured.map(topic => `<article><strong>${esc(topic.name)}</strong><b>${esc(topic.mentions)} mentions</b><span>${esc(topic.sentiment || 'Unclassified')}</span></article>`).join('')}</div>`,
  }));
  if (inferred.length) pages.push(page({
    title: 'Spike Drivers', section: 'Intelligence', period, className: 'drivers-page inferred-page',
    body: `<div class="dimension-key"><span class="basis inferred">Agent-inferred explanation</span>${statePill(inferred[0].verificationState)}</div>${numberedList(inferred.map(item => item.value))}`,
  }));
}

function eventFields(event) {
  const fields = [
    ['Date', event.date],
    ['Observation', event.observation || event.description],
    ['Evidence', event.evidence],
    ['Status', event.status || event.reviewState],
  ].filter(([, value]) => value);
  return fields.map(([label, value]) => `<div><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join('');
}

function renderMonitoringEvents(module, report, pages, period) {
  const events = module.content.events;
  chunk(events, 2).forEach((items, index) => pages.push(page({
    title: 'Monitoring Events', section: 'Intelligence', period, continuation: index, className: 'events-page',
    body: `${statusBanner(module, 'Only source-supplied fields are rendered. Unsupported event structure is not fabricated.')}<div class="event-list">${items.map((event, eventIndex) => `<article><b>${String(index * 2 + eventIndex + 1).padStart(2, '0')}</b><section>${eventFields(event)}</section></article>`).join('')}</div>${qualityFlag(report, 'semantic-search-conflict') ? `<div class="conflict-note"><strong>Source contradiction retained</strong><span>${esc(qualityFlag(report, 'semantic-search-conflict').message)}</span></div>` : ''}`,
  })));
}

function renderCompetitiveIntelligence(module, _report, pages, period) {
  const notes = module.content.notes;
  balancedChunks(notes, 2).forEach((items, index) => pages.push(page({
    title: 'Competitive Intelligence', section: 'Competitive', period, continuation: index, className: 'competitive-page',
    body: `${statusBanner(module, 'Agent-produced competitor observations require editorial approval. Full source narratives remain in the report object.')}<div class="competitor-cards">${items.map(item => `<article><strong>${esc(item.brand || item.competitor || item.name || 'Competitor')}</strong><p>${esc(item.approvedSummary || item.observation || item.description || '')}</p><small>${item.approvedSummary ? 'Approved excerpt' : 'Full source narrative - approval pending'}</small></article>`).join('')}</div>${index === 0 ? `<div class="minor-missing">${missingState('Competitor evidence assets unavailable', 'Current output includes narrative intelligence but no approved logos, screenshots, source links, or evidence-level metrics.')}</div>` : ''}`,
  })));
}

function renderShareOfVoice(module, report, pages, period) {
  const rows = module.content.current?.competitors || [];
  const verified = rows.filter(row => row.state === 'verified' && Number.isFinite(Number(row.sovPercentage?.value)));
  const max = Math.max(...verified.map(row => Number(row.sovPercentage.value)), 1);
  pages.push(page({
    title: 'Share Of Voice', section: 'Competitive', period, className: 'sov-page',
    body: `<div class="sov-list">${rows.map((row, index) => { const value = row.sovPercentage?.value; const available = row.state === 'verified' && Number.isFinite(Number(value)); return `<article class="${available ? '' : 'unavailable'}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${esc(row.name)}</strong><i><b style="width:${available ? Math.max(2, Number(value) / max * 100) : 0}%"></b></i><em>${available ? `${esc(value)}% / ${formatNumber(row.mentions?.value)}` : 'Unavailable - monitored zero under review'}</em></article>`; }).join('')}</div><aside>${missingState('SOV comparisons unavailable', 'Previous week, previous full month, and YTD require one compatible approved cohort.')}</aside>${report.dataQualityFlags?.some(flag => flag.id.includes('snapshot') || flag.id.includes('monitored-zero')) ? `<div class="conflict-note"><strong>Snapshot distinction retained</strong><span>${esc(report.dataQualityFlags.find(flag => flag.id.includes('snapshot') || flag.id.includes('monitored-zero'))?.message || '')}</span></div>` : ''}`,
  }));
}

function renderFindings(module, _report, pages, period) {
  const positive = module.content.positive?.items || [];
  const negative = module.content.negative?.items || [];
  const pageCount = Math.max(Math.ceil(positive.length / 2), Math.ceil(negative.length), 1);
  for (let index = 0; index < pageCount; index += 1) {
    pages.push(page({
      title: 'Findings', section: 'Analysis', period, continuation: index, className: 'findings-page',
      body: `${statusBanner(module, 'Agent-produced findings remain awaiting editorial approval.')}<div class="findings-grid"><section class="positive-panel"><div class="panel-title"><span>Positive drivers</span>${statePill(module.content.positive?.state)}</div>${numberedList(positive.slice(index * 2, index * 2 + 2), index * 2, 'positive')}</section><section class="negative-panel"><div class="panel-title"><span>Negative themes</span>${statePill(module.content.negative?.state)}</div>${numberedList(negative.slice(index, index + 1), index, 'negative')}</section></div>`,
    }));
  }
}

function renderRecommendations(module, _report, pages, period) {
  const items = module.content.recommendations?.items || [];
  balancedChunks(items, 3).forEach((itemsChunk, index, groups) => {
    const offset = groups.slice(0, index).reduce((total, group) => total + group.length, 0);
    pages.push(page({
      title: 'Recommendations', section: 'Analysis', period, continuation: index, className: 'recommendations-page',
      body: `${statusBanner(module, 'Recommendations remain awaiting editorial approval and are not client-ready.')} ${numberedList(itemsChunk, offset)}`,
    }));
  });
}

function renderModule(module, report, pages, period) {
  const renderers = {
    overview: renderOverview,
    additionalMetrics: renderAdditionalMetrics,
    mentions: renderMentions,
    sources: renderSources,
    reach: renderReach,
    sentiment: renderSentiment,
    evidence: renderEvidence,
    conversationDrivers: renderConversationDrivers,
    monitoringEvents: renderMonitoringEvents,
    competitiveIntelligence: renderCompetitiveIntelligence,
    shareOfVoice: renderShareOfVoice,
    findings: renderFindings,
    recommendations: renderRecommendations,
  };
  const renderer = renderers[module.moduleId];
  if (renderer) renderer(module, report, pages, period);
}

function renderDiagnostics(report, inventory, pages, period) {
  const flags = report.dataQualityFlags || [];
  pages.push(page({
    title: 'Readiness And Safety Inventory', section: 'Internal Review Appendix', period, diagnostics: true, className: 'diagnostics-summary',
    body: `<div class="status-counters"><div><b>${inventory.summary.verified}</b><span>Verified</span></div><div><b>${inventory.summary.unavailable}</b><span>Unavailable</span></div><div><b>${inventory.summary.awaitingVerification}</b><span>Awaiting verification</span></div><div><b>${inventory.summary.blockers}</b><span>Export blockers</span></div></div><div class="diagnostic-meta"><strong>Source run</strong><span>${esc(inventory.sourceRunId)}</span><strong>Schema</strong><span>${esc(report.schemaVersion)}</span><strong>Template</strong><span>${STANDARD_TEMPLATE_ID}</span></div><div class="quality-list">${flags.map(flag => `<article><b>${esc(flag.severity)}</b><strong>${esc(flag.id)}</strong><p>${esc(flag.message)}</p></article>`).join('')}</div>`,
  }));
  const blockers = inventory.blockers || [];
  balancedChunks(blockers, 9).forEach((items, index) => pages.push(page({
    title: 'Export Blockers', section: 'Internal Review Appendix', period, diagnostics: true, continuation: index, className: 'blockers-page',
    body: `<div class="blocker-list">${items.map(item => `<article><strong>${esc(item.field)}</strong><span>${esc(item.state)}</span><p>${esc(item.blocker)}</p></article>`).join('')}</div>`,
  })));
}

export function standardProductionPreviewHtml({ report, inventory, includeDiagnostics = true, renderMode = 'preview' }) {
  if (renderMode === 'client') assertSignalIntelClientExportable(report);
  const period = reportPeriod(report);
  const modules = resolveStandardModules(report);
  const pages = [];
  pages.push(page({
    section: 'Standard Report', period, className: 'cover-page',
    body: `<div class="cover-mark"><span>SIGNAL</span><b>INTEL</b></div><div class="cover-copy"><p>Social intelligence report</p><h1>${esc(report.reportingContext.clientName)}</h1><strong>${esc(period.label)}</strong></div><div class="cover-note"><b>Production preview</b><span>Not for client distribution</span></div><div class="cover-meta"><span>Prepared by</span><b>Praxis Experiential</b></div>`,
  }));
  modules.forEach(module => renderModule(module, report, pages, period));
  if (includeDiagnostics) renderDiagnostics(report, inventory, pages, period);

  const c = STANDARD_TOKENS.colors;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Signal Intel Standard Production Preview - ${esc(period.label)}</title><style>
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
    @page{size:${STANDARD_PAGE.widthPt}pt ${STANDARD_PAGE.heightPt}pt;margin:0}
    :root{--page:${c.page};--surface:${c.surface};--muted-surface:${c.mutedSurface};--text:${c.text};--text-2:${c.secondaryText};--border:${c.border};--live:${c.live};--positive:${c.positive};--negative:${c.negative};--neutral:${c.neutral};--info:${c.info};--warning:${c.warning};--chart-blue:${c.charts[0]};--chart-pink:${c.charts[1]};--chart-red:${c.charts[2]};--chart-rose:${c.charts[3]};--chart-teal:${c.charts[4]};--chart-purple:${c.charts[5]};--chart-gold:${c.charts[6]};--chart-cyan:${c.charts[7]};--chart-green:${c.charts[8]};--chart-orange:${c.charts[9]};--font-body:${STANDARD_TOKENS.fonts.body};--font-display:${STANDARD_TOKENS.fonts.display};--font-mono:${STANDARD_TOKENS.fonts.mono}}
    *{box-sizing:border-box}html,body{margin:0;background:#d8d8d3;color:var(--text);font-family:var(--font-body);letter-spacing:0}body{counter-reset:page}.report-page{position:relative;width:720pt;height:405pt;background:var(--page);page-break-after:always;counter-increment:page;overflow:hidden}.page-rail{position:absolute;left:0;top:0;bottom:0;width:7pt;background:var(--live)}header{position:absolute;left:34pt;right:34pt;top:19pt;height:20pt;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;border-bottom:.7pt solid var(--border);padding-bottom:8pt;font:600 6.8pt var(--font-mono);text-transform:uppercase;color:var(--text-2)}header>span{text-align:center}.wordmark{font:700 10pt var(--font-display);color:var(--text)}.wordmark b{color:var(--live)}header>strong{text-align:right;font-weight:600}main{position:absolute;left:34pt;right:34pt;top:56pt;bottom:31pt}.title-row{height:37pt;display:flex;align-items:flex-start}.title-row h1{margin:0;font:700 24pt/1 var(--font-display);text-transform:uppercase}.continued{font:600 7pt var(--font-mono);color:var(--text-2);vertical-align:middle;margin-left:8pt}footer{position:absolute;left:34pt;right:34pt;bottom:10pt;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8pt;padding-top:5pt;border-top:.7pt solid var(--border);font:400 6.2pt var(--font-mono);color:var(--text-2)}footer .scope-footer{text-align:center}.page-number{text-align:right}.page-number:after{content:'Page ' counter(page)}.preview-stamp{position:absolute;right:34pt;top:46pt;font:600 6pt var(--font-mono);color:var(--warning);text-transform:uppercase}.state-pill{display:inline-block;padding:2.5pt 5pt;border:0.6pt solid currentColor;font:600 6.3pt/1 var(--font-mono);text-transform:uppercase;white-space:nowrap}.state-verified{color:var(--positive);background:#eef7f1}.state-unavailable{color:var(--text-2);background:var(--muted-surface)}.state-awaiting_verification,.state-pending_verification{color:var(--warning);background:#fff7e3}.missing-state{border:1pt dashed var(--border);background:var(--surface);padding:14pt;min-height:78pt}.missing-state strong{display:block;margin-top:8pt;font:600 11pt var(--font-body)}.missing-state p{margin:5pt 0 0;font:9.5pt/1.4 var(--font-body);color:var(--text-2)}.status-banner{display:flex;align-items:center;gap:9pt;min-height:28pt;padding:6pt 9pt;border-left:4pt solid var(--warning);background:#fff7e3;font-size:8.8pt;line-height:1.25}.module-intro{margin:10pt 0 0;font-size:10.5pt;line-height:1.42;color:var(--text-2)}
    .cover-page{background:var(--text);color:#fff}.cover-page .page-rail{width:14pt;background:var(--live)}.cover-page header{border-color:#ffffff30;color:#ffffffaa}.cover-page header .wordmark{color:#fff}.cover-page footer{border-color:#ffffff30;color:#ffffff99}.cover-page main{top:54pt}.cover-mark{position:absolute;top:10pt;right:2pt;display:flex;flex-direction:column;align-items:flex-end;font:700 76pt/.72 var(--font-display);color:#ffffff10}.cover-mark b{color:#ffffff08}.cover-copy{position:absolute;left:0;top:86pt;width:520pt}.cover-copy p{margin:0 0 8pt;color:#9dcbb1;font:600 9pt var(--font-mono);text-transform:uppercase}.cover-copy h1{margin:0;font:700 43pt/1 var(--font-display);text-transform:uppercase}.cover-copy strong{display:block;margin-top:14pt;font:500 15pt var(--font-body)}.cover-note{position:absolute;left:0;bottom:25pt;padding-left:12pt;border-left:4pt solid var(--warning)}.cover-note b,.cover-note span{display:block}.cover-note b{font:600 9pt var(--font-mono);text-transform:uppercase;color:#ffcf91}.cover-note span{margin-top:3pt;font-size:9pt;color:#ffffffbb}.cover-meta{position:absolute;right:0;bottom:25pt;text-align:right}.cover-meta span,.cover-meta b{display:block}.cover-meta span{font:6.5pt var(--font-mono);text-transform:uppercase;color:#ffffff88}.cover-meta b{margin-top:4pt;font:600 12pt var(--font-body)}
    .overview-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:9pt}.overview-metrics .metric-card{min-height:48pt;padding:5pt 10pt}.overview-metrics .metric-card>b{display:inline-block;margin:3pt 8pt 0 0;font-size:20pt;vertical-align:middle}.overview-metrics .state-pill{vertical-align:middle}.scope-status{display:grid;grid-template-columns:75pt 1fr;gap:8pt;align-items:center;margin-top:5pt;padding:4pt 9pt;border-left:4pt solid var(--warning);background:#fff7e3;color:#704014}.scope-status strong{font:600 6.5pt var(--font-mono);text-transform:uppercase}.scope-status span{font:8.5pt/1.25 var(--font-body)}.narrative-panel{margin-top:5pt;padding:8pt 12pt;background:var(--surface);border:1pt solid var(--border)}.eyebrow,.narrative-strip>span{font:600 6.5pt var(--font-mono);text-transform:uppercase;color:var(--live)}.narrative-panel p{margin:4pt 0 0;font:${STANDARD_TOKENS.type.bodyPt}pt/${STANDARD_TOKENS.type.bodyLineHeight} var(--font-body)}.previous-summary{position:absolute;right:0;bottom:0;width:205pt}.previous-summary .missing-state{min-height:64pt;padding:10pt}.previous-summary .missing-state p{font-size:8.5pt}.previous-summary>strong{font:600 7pt var(--font-mono);text-transform:uppercase}.overview-page .narrative-panel{width:430pt}.overview-page .narrative-panel p{line-height:1.34}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin-top:15pt}.metric-card{min-height:86pt;padding:11pt;background:var(--surface);border:1pt solid var(--border);border-top:4pt solid var(--chart-blue)}.metric-card:nth-child(2n){border-top-color:var(--chart-pink)}.metric-card:nth-child(3n){border-top-color:var(--chart-teal)}.metric-card>span:first-child{display:block;font:600 7pt var(--font-mono);text-transform:uppercase;color:var(--text-2)}.metric-card>b{display:block;margin:9pt 0 7pt;font:700 22pt var(--font-display)}
    .metric-lead{position:absolute;left:0;top:50pt;width:120pt}.metric-lead span,.metric-lead b,.metric-lead small{display:block}.metric-lead span{font:6.5pt var(--font-mono);text-transform:uppercase;color:var(--text-2)}.metric-lead b{margin-top:5pt;font:700 36pt var(--font-display);color:var(--chart-blue)}.metric-lead small{font-size:9pt}.chart-stage{position:absolute;left:142pt;top:40pt;width:325pt;height:172pt}.chart-stage.wide{left:0;top:37pt;width:440pt;height:220pt}.chart-stage.lower{left:0;top:135pt;width:440pt}.chart-stage>.missing-state{margin-top:30pt}.line-chart{width:100%;height:100%}.grid-line{stroke:var(--border);stroke-width:1}.trend-line{fill:none;stroke-width:3}.line-chart circle{fill:var(--surface);stroke:var(--chart-blue);stroke-width:2}.line-chart text{font:9px var(--font-mono);fill:var(--text-2)}.comparison-panel{position:absolute;right:0;top:40pt;width:165pt}.conflict-note{display:flex;gap:9pt;padding:8pt 10pt;border:1pt solid #e2b36e;background:#fff7e3;color:#704014;font-size:8.2pt;line-height:1.35}.conflict-note strong{flex:0 0 96pt}.mentions-page .conflict-note{position:absolute;left:0;right:0;bottom:0}.ranked-bars{display:grid;gap:4pt}.ranked-row{display:grid;grid-template-columns:23pt 85pt 1fr 45pt;gap:7pt;align-items:center;height:18pt;font-size:8.2pt}.rank{font:6.5pt var(--font-mono);color:var(--text-2)}.ranked-row strong{font-size:8.5pt}.ranked-row i{height:8pt;background:var(--muted-surface)}.ranked-row i b{display:block;height:100%;background:var(--chart-blue)}.ranked-row:nth-child(2n) i b{background:var(--chart-pink)}.bar-value{text-align:right;font:600 7pt var(--font-mono)}.narrative-strip{position:absolute;left:0;right:185pt;bottom:0;padding:8pt 10pt;border-left:4pt solid var(--live);background:var(--surface)}.narrative-strip p{display:inline;margin:0 8pt;font-size:9.5pt;line-height:1.35}.three-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin:6pt 185pt 0 0}.three-metrics .metric-card{min-height:77pt}.three-metrics .metric-card>b{font-size:18pt}.sentiment-layout{display:grid;grid-template-columns:460pt 165pt;gap:22pt;margin-top:9pt}.sentiment-visual{display:flex;gap:32pt;align-items:center;padding-left:30pt}.donut{width:155pt;height:155pt;border-radius:50%;display:grid;place-items:center}.donut>span{width:91pt;height:91pt;border-radius:50%;background:var(--page);display:flex;flex-direction:column;align-items:center;justify-content:center}.donut>span b{font:700 22pt var(--font-display)}.donut>span small{font:7pt var(--font-mono);text-transform:uppercase}.sentiment-legend{width:190pt}.sentiment-legend>div{display:grid;grid-template-columns:12pt 54pt 38pt 1fr;align-items:center;gap:4pt;margin:11pt 0}.sentiment-legend i{width:8pt;height:8pt;border-radius:50%}.sentiment-legend i.positive{background:var(--positive)}.sentiment-legend i.negative{background:var(--negative)}.sentiment-legend i.neutral{background:var(--neutral)}.sentiment-legend span{text-transform:capitalize;font-size:9pt}.sentiment-legend b{font:700 11pt var(--display)}.sentiment-legend small{font-size:7pt;color:var(--text-2)}.sentiment-copy{right:0;bottom:0}.sentiment-copy p{font-size:9pt}
    .evidence-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12pt;margin-top:10pt}.evidence-card{height:244pt;padding:10pt;background:var(--surface);border:1pt solid var(--border);overflow:hidden}.evidence-shot{height:47pt;display:flex;align-items:center;justify-content:center;gap:8pt;background:var(--muted-surface);border:1pt dashed var(--border);font-size:8pt;color:var(--text-2)}.evidence-meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5pt;margin-top:7pt;font:6.5pt var(--font-mono);color:var(--text-2)}.evidence-meta span{text-align:right}.evidence-card h2{margin:7pt 0 0;font:700 11pt/1.15 var(--font-display)}.evidence-card p{margin:5pt 0 0;font:9pt/1.35 var(--font-body)}.source-link{display:block;margin-top:5pt;font:6.5pt var(--font-mono);color:var(--info);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source-link.unavailable{color:var(--warning)}.review-box{margin-top:6pt;padding:5pt 6pt;background:#fff7e3;font-size:7.2pt;line-height:1.25}.review-box strong{display:block;color:var(--warning);font:600 6pt var(--font-mono);text-transform:uppercase;margin-bottom:2pt}
    .dimension-key{display:flex;align-items:center;justify-content:space-between;margin-top:12pt}.basis{padding:4pt 7pt;font:600 7pt var(--font-mono);text-transform:uppercase}.basis.measured{color:var(--positive);background:#eef7f1;border-left:4pt solid var(--positive)}.basis.inferred{color:var(--warning);background:#fff7e3;border-left:4pt solid var(--warning)}.topic-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9pt;margin-top:14pt}.topic-grid article{min-height:84pt;padding:10pt;background:var(--surface);border:1pt solid var(--border)}.topic-grid strong,.topic-grid b,.topic-grid span{display:block}.topic-grid strong{font:600 10pt/1.25 var(--font-body)}.topic-grid b{margin-top:9pt;font:700 16pt var(--font-display);color:var(--chart-teal)}.topic-grid span{margin-top:4pt;font:7pt var(--font-mono);text-transform:uppercase;color:var(--text-2)}.numbered-list{margin-top:13pt}.numbered-list article{display:grid;grid-template-columns:28pt 1fr;gap:9pt;padding:9pt 0;border-bottom:1pt solid var(--border)}.numbered-list article>b{font:700 10pt var(--font-mono);color:var(--live)}.numbered-list p{margin:0;font:10.5pt/1.42 var(--font-body)}.inferred-page .numbered-list{margin-top:18pt}.inferred-page .numbered-list article{padding:14pt 0}.event-list{margin-top:12pt}.event-list>article{display:grid;grid-template-columns:30pt 1fr;gap:10pt;padding:12pt;background:var(--surface);border:1pt solid var(--border)}.event-list>article>b{font:700 11pt var(--font-mono);color:var(--chart-purple)}.event-list section>div{display:grid;grid-template-columns:74pt 1fr;gap:9pt;margin-bottom:8pt}.event-list section strong{font:600 6.5pt var(--font-mono);text-transform:uppercase;color:var(--text-2)}.event-list section span{font:10pt/1.42 var(--font-body)}.events-page .conflict-note{position:absolute;left:0;right:0;bottom:0}.competitor-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12pt;margin-top:11pt}.competitor-cards article{min-height:197pt;padding:13pt;background:var(--surface);border:1pt solid var(--border);border-top:4pt solid var(--chart-purple)}.competitor-cards strong{font:700 13pt var(--font-display);text-transform:uppercase}.competitor-cards p{margin:8pt 0 0;font:9.5pt/1.42 var(--font-body)}.competitor-cards small{display:block;margin-top:8pt;font:6.5pt var(--font-mono);text-transform:uppercase;color:var(--warning)}.minor-missing{position:absolute;left:0;right:0;bottom:0}.minor-missing .missing-state{min-height:42pt;padding:6pt 9pt}.minor-missing .missing-state>div,.minor-missing .missing-state strong{display:inline-block;margin:0 8pt 0 0}.minor-missing .missing-state p{display:inline;font-size:8pt}.competitive-page:has(.minor-missing) .competitor-cards article{min-height:168pt}
    .sov-list{display:grid;gap:5pt;width:445pt;margin-top:8pt}.sov-list article{display:grid;grid-template-columns:24pt 128pt 1fr 95pt;gap:7pt;align-items:center;height:25pt}.sov-list article>span{font:6pt var(--font-mono);color:var(--text-2)}.sov-list article>strong{font-size:8.5pt}.sov-list article>i{height:9pt;background:var(--muted-surface)}.sov-list article>i b{display:block;height:100%;background:var(--chart-blue)}.sov-list article:nth-child(2n)>i b{background:var(--chart-pink)}.sov-list article>em{font:600 6.8pt var(--font-mono);font-style:normal;text-align:right}.sov-list article.unavailable{color:var(--text-2)}.sov-page aside{position:absolute;right:0;top:43pt;width:175pt}.sov-page .conflict-note{position:absolute;left:0;right:0;bottom:0}.findings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-top:12pt}.findings-grid>section{min-height:235pt;padding:12pt;background:var(--surface);border:1pt solid var(--border)}.positive-panel{border-top:4pt solid var(--positive)!important}.negative-panel{border-top:4pt solid var(--negative)!important}.panel-title{display:flex;justify-content:space-between;align-items:center;font:700 12pt var(--font-display);text-transform:uppercase}.findings-grid .numbered-list{margin-top:6pt}.findings-grid .numbered-list article{padding:8pt 0}.findings-grid .numbered-list p{font-size:9pt;line-height:1.38}.recommendations-page .numbered-list{margin-top:10pt}.recommendations-page .numbered-list article{padding:9pt 0}.recommendations-page .numbered-list p{font-size:9.5pt;line-height:1.38}
    .diagnostics-page{background:#f4f2ec}.diagnostics-page .page-rail{background:var(--warning)}.status-counters{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin-top:8pt}.status-counters>div{padding:10pt;background:var(--surface);border:1pt solid var(--border)}.status-counters b,.status-counters span{display:block}.status-counters b{font:700 22pt var(--font-display)}.status-counters span{font:6.5pt var(--font-mono);text-transform:uppercase}.diagnostic-meta{position:absolute;left:0;top:126pt;display:grid;grid-template-columns:70pt 1fr;gap:5pt 8pt;width:365pt;font:6.5pt/1.25 var(--font-mono)}.diagnostic-meta strong{color:var(--warning)}.quality-list{position:absolute;right:0;top:120pt;width:270pt}.quality-list article{padding:5pt 0;border-bottom:1pt solid var(--border);font-size:6.5pt}.quality-list article b{display:inline-block;width:38pt;color:var(--warning);text-transform:uppercase}.quality-list article strong{font-family:var(--font-mono)}.quality-list p{margin:3pt 0 0;line-height:1.25}.blocker-list{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:8pt}.blocker-list article{min-height:88pt;padding:8pt;background:var(--surface);border:1pt solid var(--border)}.blocker-list strong{display:block;font:600 6.8pt/1.2 var(--font-mono);overflow-wrap:anywhere}.blocker-list span{display:block;margin-top:4pt;color:var(--warning);font:600 6pt var(--font-mono);text-transform:uppercase}.blocker-list p{margin:4pt 0 0;font-size:7pt;line-height:1.25}
  </style></head><body>${pages.join('')}</body></html>`;
}
