const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const num = value => Number(value).toLocaleString('en-US');
const valueOf = record => record?.state === 'verified' ? record.value : null;
const displayOf = record => record?.value !== null && record?.value !== undefined
  ? num(record.value)
  : record?.displayValue || 'Unavailable';

function footer(period, sourceRunId) {
  return `<footer><span>${esc(period.label)}</span>${sourceRunId ? `<span>Source: ${esc(sourceRunId)}</span>` : '<span></span>'}<span class="page-number"></span></footer>`;
}

function page({ title = '', className = '', period, sourceRunId, body }) {
  return `<section class="page ${esc(className)}"><div class="sheet">${title ? `<h2>${esc(title)}</h2>` : ''}${body}${footer(period, sourceRunId)}</div></section>`;
}

function missing(label, detail) {
  return `<div class="missing"><strong>${esc(label)}</strong><span>${esc(detail)}</span></div>`;
}

function lineChart(points) {
  const verified = points.filter(point => point.state === 'verified' && point.value !== null);
  if (!verified.length) return `<div class="chart-missing">${missing('Daily series unavailable', 'No verified current-period points were supplied.')}</div>`;
  const values = verified.map(point => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const coords = verified.map((point, index) => ({
    ...point,
    x: 38 + index * (430 / Math.max(verified.length - 1, 1)),
    y: 185 - ((point.value - min) / range) * 125,
  }));
  return `<svg class="line-chart" viewBox="0 0 510 230" role="img" aria-label="Verified daily mentions">
    ${[60, 100, 140, 180].map(y => `<line x1="32" x2="480" y1="${y}" y2="${y}" class="grid"/>`).join('')}
    <polyline points="${coords.map(point => `${point.x},${point.y}`).join(' ')}" class="series"/>
    ${coords.map(point => `<g><circle cx="${point.x}" cy="${point.y}" r="4"/><text x="${point.x}" y="${point.y - 10}" text-anchor="middle">${point.value}</text><text x="${point.x}" y="212" text-anchor="middle">${esc(point.date.slice(5))}</text></g>`).join('')}
  </svg>`;
}

function miniLineChart(series, label) {
  const points = series?.points?.filter(point => point.state === 'verified' && point.value !== null) || [];
  if (!points.length) return missing(`${label} unavailable`, 'No compatible verified points were supplied.');
  const values = points.map(point => Number(point.value));
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const pointLabel = value => max >= 100000
    ? value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${Math.round(value / 1000)}K`
    : String(value);
  const coords = points.map((point, index) => ({
    x: 8 + index * (132 / Math.max(points.length - 1, 1)),
    y: 55 - ((Number(point.value) - min) / range) * 40,
  }));
  return `<svg class="mini-line-chart" viewBox="0 0 148 72" role="img" aria-label="${esc(label)}"><line x1="8" x2="140" y1="56" y2="56" class="grid"/><polyline points="${coords.map(point => `${point.x},${point.y}`).join(' ')}" class="series"/>${coords.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="2.5"/><text x="${point.x}" y="${point.y - 5}" text-anchor="middle">${esc(pointLabel(values[index]))}</text>`).join('')}</svg>`;
}

function periodComparisonPanel({ dataset, period, metricKey, title, unavailableLabel }) {
  if (!dataset || dataset.state !== 'verified') return missing(unavailableLabel, 'No compatible verified comparison dataset was supplied.');
  const metric = dataset[metricKey];
  const total = metric?.total;
  const dailySeries = metric?.dailySeries;
  return `<div class="comparison-panel"><strong>${esc(title)}</strong><span>${esc(period.label)}</span><b>${esc(displayOf(total))}</b><small>${dataset.denominator?.value ? `Denominator ${num(dataset.denominator.value)}` : 'Denominator unavailable'}</small>${miniLineChart(dailySeries, `${title} ${metricKey}`)}</div>`;
}

function sourceComparisonPanel(dataset, period) {
  if (!dataset || dataset.state !== 'verified') return missing('Previous-week source mix unavailable', 'No compatible verified comparison dataset was supplied.');
  const items = dataset.sourceTypes.items || [];
  const max = Math.max(...items.map(item => item.rawCount?.value || 0), 1);
  return `<div class="comparison-panel source-comparison"><strong>Previous week</strong><span>${esc(period.label)}</span><small>Denominator ${num(dataset.sourceTypes.denominator.value)}</small>${items.map(item => `<div><span>${esc(item.name)}</span><i style="width:${Math.max(1, Number(item.rawCount.value) / max * 100)}%"></i><b>${num(item.rawCount.value)}</b></div>`).join('')}</div>`;
}

function sentimentComparisonPanel(dataset, period) {
  if (!dataset || dataset.state !== 'verified') return missing('Previous-week sentiment unavailable', 'No compatible verified comparison dataset was supplied.');
  const sentiment = dataset.sentiment;
  const row = (label, record) => `<div><span>${esc(label)}</span><b>${num(record.count.value)}</b><small>${percentageDisplay(record.percentage)}</small></div>`;
  return `<div class="comparison-panel sentiment-comparison"><strong>Previous week</strong><span>${esc(period.label)}</span><small>Denominator ${num(sentiment.denominator.value)}</small>${row('Positive', sentiment.positive)}${row('Negative', sentiment.negative)}${row('Neutral', sentiment.neutral)}</div>`;
}

function percentageDisplay(record, unavailableLabel = 'Percentage unavailable') {
  if (record?.value === null || record?.value === undefined) return unavailableLabel;
  return record.valueKind === 'derived_compatible_denominator'
    ? `${Number(record.value).toFixed(record.precision ?? 1)}% derived`
    : record.calculationStatus === 'source_reported'
      ? `${record.value}% source display`
      : `${record.value}%`;
}

function measurementContext(scope, sourceRunId) {
  return `<div class="measurement-context"><span>${esc(scopeLabel(scope))}</span><span>${esc(sourceRunId)}</span></div>`;
}

function bars(items) {
  const values = items.map(item => item.rawCount?.value ?? item.percentage?.value ?? 0);
  const max = Math.max(...values, 1);
  return `<div class="bars">${items.map((item, index) => `<div class="bar-row"><span>${esc(item.name)}</span><i style="width:${Math.max(1, (values[index] / max) * 100)}%"></i><b>${item.rawCount?.value !== null ? num(item.rawCount.value) : 'Count unavailable'} <small>${percentageDisplay(item.percentage)}</small></b></div>`).join('')}</div>`;
}

function sentimentDonut(sentiment) {
  if (sentiment.denominator) {
    const positiveCount = valueOf(sentiment.positive.count) || 0;
    const negativeCount = valueOf(sentiment.negative.count) || 0;
    const neutralCount = valueOf(sentiment.neutral.count) || 0;
    const denominator = valueOf(sentiment.denominator) || positiveCount + negativeCount + neutralCount;
    const neutralArc = denominator ? neutralCount / denominator * 100 : 0;
    const negativeArc = denominator ? negativeCount / denominator * 100 : 0;
    const percentageLabel = record => percentageDisplay(record.percentage);
    return `<div class="sentiment-wrap"><div class="donut" style="background:conic-gradient(#bcbcbc 0 ${neutralArc}%,#e34b45 ${neutralArc}% ${neutralArc + negativeArc}%,#66ad5d ${neutralArc + negativeArc}% 100%)"><span>${num(denominator)}<small>mentions</small></span></div><div class="legend measured-legend"><div><i class="neutral"></i>Neutral <b>${num(neutralCount)} / ${percentageLabel(sentiment.neutral)}</b></div><div><i class="negative"></i>Negative <b>${num(negativeCount)} / ${percentageLabel(sentiment.negative)}</b></div><div><i class="positive"></i>Positive <b>${num(positiveCount)} / ${percentageLabel(sentiment.positive)}</b></div><small>Source displays are retained; missing percentages are derived only from compatible counts and denominators.</small></div></div>`;
  }
  const positive = valueOf(sentiment.positive.percentage) || 0;
  const negative = valueOf(sentiment.negative.percentage) || 0;
  const neutral = valueOf(sentiment.neutral.percentage) || 0;
  return `<div class="sentiment-wrap"><div class="donut" style="background:conic-gradient(#bcbcbc 0 ${neutral}%,#e34b45 ${neutral}% ${neutral + negative}%,#66ad5d ${neutral + negative}% 100%)"><span>${num(valueOf(sentiment.positive.count) + valueOf(sentiment.negative.count) + valueOf(sentiment.neutral.count))}<small>mentions</small></span></div><div class="legend"><div><i class="neutral"></i>Neutral <b>${neutral}%</b></div><div><i class="negative"></i>Negative <b>${negative}%</b></div><div><i class="positive"></i>Positive <b>${positive}%</b></div></div></div>`;
}

function evidenceCards(records, tone) {
  if (!records.length) return missing(`No ${tone} evidence records`, 'No period-correct evidence item is available in the selected report output.');
  return `<div class="evidence-grid">${records.map(record => `<article class="evidence"><div class="shot">Screenshot unavailable</div><div class="evidence-meta"><span>${esc(record.platform || 'Platform unavailable')}</span><span>${record.timestamp ? esc(record.timestamp) : 'Timestamp unavailable'}</span></div><h3>${esc(record.title)}</h3><p>${esc(record.caption)}</p><div class="review-note"><strong>${esc((record.relevanceState || 'awaiting_verification').replaceAll('_', ' '))}</strong>${esc(record.reviewNote || 'Editorial review required.')}</div><div class="url">${record.sourceUrl ? esc(record.sourceUrl) : 'Source URL unavailable'}</div></article>`).join('')}</div>`;
}

function evidencePages({ pages, records, tone, title, period, sourceRunId }) {
  const matching = records.filter(record => String(record.sentiment).toLowerCase() === tone);
  if (!matching.length) {
    pages.push(page({ title, period, sourceRunId, body: evidenceCards([], tone) }));
    return;
  }
  for (let index = 0; index < matching.length; index += 2) {
    pages.push(page({
      title: `${title}${index ? ' - CONTINUED' : ''}`,
      period,
      sourceRunId,
      body: evidenceCards(matching.slice(index, index + 2), tone),
    }));
  }
}

function scopeLabel(scope) {
  if (scope?.philippinesOnly) return `${scope.geography || 'PH'} filtered`;
  return 'Broader or unfiltered';
}

function moduleItemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item || '');
  return [item.date, item.name || item.title || item.competitor || item.brand, item.description || item.observation || item.synthesis, item.mentions !== undefined ? `${item.mentions} mentions` : '', item.sentiment]
    .filter(Boolean)
    .join(' - ');
}

function statusTag(record) {
  return `<span class="state-tag">${esc((record?.state || 'unavailable').replaceAll('_', ' '))}</span>`;
}

function itemIsPresentable(record, index) {
  return record?.itemPresentationEligibility?.[index]?.state !== 'quarantined';
}

function presentableItems(record) {
  return (record?.items || []).filter((_, index) => itemIsPresentable(record, index));
}

function recordIsPresentable(record) {
  return record?.presentationEligibility?.state !== 'quarantined';
}

function linkedFlags(record, flags = []) {
  const ids = new Set([
    ...(record?.presentationEligibility?.qualityFlagIds || []),
    ...(record?.itemPresentationEligibility || []).flatMap(item => item.qualityFlagIds || []),
  ]);
  return flags.filter(flag => ids.has(flag.id));
}

function linkedWarnings(record, flags = []) {
  const matches = linkedFlags(record, flags);
  return matches.length
    ? `<div class="conflict-callout">${matches.map(flag => esc(flag.message)).join(' ')}</div>`
    : '';
}

function numberedItems(items, startIndex = 0) {
  return `<div class="numbered-items">${items.map((item, index) => `<div><b>${String(startIndex + index + 1).padStart(2, '0')}</b><p>${esc(moduleItemText(item))}</p></div>`).join('')}</div>`;
}

function addOperationalMetricsPage({ pages, contract, period, sourceRunId }) {
  const labels = {
    averagePresenceScore: 'Average Presence Score',
    ave: 'AVE',
    userGeneratedContent: 'User Generated Content',
    socialMediaMentions: 'Social Media Mentions',
    nonSocialMediaMentions: 'Non-Social Media Mentions',
    socialMediaReactions: 'Social Media Reactions',
    socialMediaComments: 'Social Media Comments',
    socialMediaShares: 'Social Media Shares',
    totalSocialMediaInteractions: 'Total Social Media Interactions',
  };
  const entries = Object.entries(contract.optionalModules?.operationalMetrics || {})
    .filter(([, record]) => record.state !== 'unavailable' && (record.value !== null || record.displayValue));
  if (!entries.length) return;
  const intro = contract.metrics?.periods
    ? 'Source-reported measurements. Rounded display values remain labeled and are not promoted to raw counts.'
    : 'Existing Signal Intel output. Estimates remain estimates and are not recalculated in this PDF layer.';
  pages.push(page({
    title: 'ADDITIONAL METRICS', period, sourceRunId, className: 'additional-metrics',
    body: `<p class="module-intro">${esc(intro)}</p><div class="metric-grid">${entries.map(([key, record]) => `<div><span>${esc(labels[key] || key.replace(/([A-Z])/g, ' $1'))}</span><b>${esc(record.displayValue || String(record.value))}</b>${statusTag(record)}</div>`).join('')}</div>`,
  }));
}

function addConversationDriverPages({ pages, contract, period, sourceRunId, quality }) {
  const intelligence = contract.optionalModules?.intelligence || {};
  const topics = intelligence.topicClusters?.items || [];
  const spikes = presentableItems(intelligence.spikeDrivers);
  if (!topics.length && !spikes.length) return;
  pages.push(page({
    title: 'CONVERSATION DRIVERS', period, sourceRunId, className: 'conversation-drivers',
    body: `<div class="driver-columns"><section class="measured-topics"><div class="module-heading"><strong>Topic clusters</strong><span class="module-kind measured">Measured counts</span></div><div class="topic-grid">${topics.map(topic => `<div><strong>${esc(topic.name || topic.title || '')}</strong><span>${topic.mentions !== undefined ? `${esc(topic.mentions)} mentions` : 'Mention count unavailable'}</span><small>${esc(topic.sentiment || '')}</small></div>`).join('')}</div>${statusTag(intelligence.topicClusters)}</section><section class="inferred-drivers"><div class="module-heading"><strong>Spike drivers</strong><span class="module-kind inferred">Agent-inferred explanation</span></div>${spikes.length ? numberedItems(spikes) : missing('Spike drivers held for review', 'No compatible current-period driver is available for presentation.')}${statusTag(intelligence.spikeDrivers)}</section></div>${linkedWarnings(intelligence.spikeDrivers, quality)}`,
  }));
}

function addMonitoringEventsPage({ pages, contract, period, sourceRunId, quality }) {
  const record = contract.optionalModules?.intelligence?.monitoringEvents;
  const items = presentableItems(record);
  if (!items.length) return;
  const eventCards = items.map((item, index) => {
    const isObject = item && typeof item === 'object';
    const observation = isObject ? (item.observation || item.description || item.synthesis || '') : String(item || '');
    const fields = [
      isObject && item.date ? `<div><strong>Date</strong><span>${esc(item.date)}</span></div>` : '',
      observation ? `<div class="event-observation"><strong>Observation</strong><span>${esc(observation)}</span></div>` : '',
      isObject && item.evidence ? `<div><strong>Evidence</strong><span>${esc(item.evidence)}</span></div>` : '',
      isObject && (item.status || item.reviewState) ? `<div><strong>Status</strong><span>${esc(item.status || item.reviewState)}</span></div>` : '',
    ].filter(Boolean).join('');
    return `<article class="event-card"><b>${String(index + 1).padStart(2, '0')}</b><section>${fields}</section></article>`;
  }).join('');
  pages.push(page({
    title: 'MONITORING EVENTS', period, sourceRunId, className: 'monitoring-events',
    body: `<div class="approval-banner">${statusTag(record)} Agent-produced context remains subject to editorial verification. Fields are shown only when supplied.</div><div class="event-list">${eventCards}</div>${linkedWarnings(record, quality)}`,
  }));
}

function addCompetitorNotesPages({ pages, contract, period, sourceRunId, quality }) {
  const record = contract.optionalModules?.intelligence?.competitorNotes;
  const items = presentableItems(record);
  if (!items.length) return;
  for (let index = 0; index < items.length; index += 4) {
    const chunk = items.slice(index, index + 4);
    pages.push(page({
      title: `COMPETITOR INTELLIGENCE${index ? ' - CONTINUED' : ''}`, period, sourceRunId, className: 'competitor-notes',
      body: `<div class="approval-banner">${statusTag(record)} Approved summaries are used when supplied; otherwise the full source narrative remains visible for review.</div><div class="competitor-grid">${chunk.map(item => `<section><strong>${esc(item.brand || item.competitor || item.name || '')}</strong><p>${esc(item.approvedSummary || item.observation || item.description || '')}</p>${item.approvedSummary ? '<small>Approved excerpt</small>' : '<small>Full source narrative - approval pending</small>'}</section>`).join('')}</div>${index === 0 ? linkedWarnings(record, quality) : ''}`,
    }));
  }
}

function addFindingsPages({ pages, contract, period, sourceRunId, quality }) {
  const positive = contract.approvedNarrative?.positiveThemes;
  const negative = contract.approvedNarrative?.negativeThemes;
  const executive = contract.approvedNarrative?.executiveSummary;
  const positiveItems = presentableItems(positive);
  const negativeItems = presentableItems(negative);
  const executiveText = recordIsPresentable(executive) ? executive?.text : '';
  if (!positiveItems.length && !negativeItems.length && !executiveText && !executive?.text) return false;
  pages.push(page({
    title: 'REPORT SUMMARY', period, sourceRunId, className: 'report-summary',
    body: `<div class="approval-banner">${statusTag(executive)} Agent-produced narrative - editorial approval required before client export.</div>${executiveText ? `<div class="executive-copy">${esc(executiveText)}</div>` : executive?.text ? missing('Executive summary held for review', 'The supplied summary contains measurements incompatible with the authoritative snapshot.') : missing('Executive summary unavailable', 'No current-period summary was supplied.')}${linkedWarnings(executive, quality)}`,
  }));
  if (!positiveItems.length && !negativeItems.length) {
    const sourceFindingsExist = !!positive?.items?.length || !!negative?.items?.length;
    pages.push(page({
      title: 'POSITIVE AND NEGATIVE FINDINGS', period, sourceRunId, className: 'findings',
      body: `<div class="approval-banner">Agent-produced findings - editorial approval required before client export.</div>${sourceFindingsExist ? missing('Findings held for review', 'All supplied positive and negative findings depend on incompatible measurements or unavailable SOV calculations.') : missing('Findings unavailable', 'No current-period positive or negative findings were supplied.')}${linkedWarnings(positive, quality)}${linkedWarnings(negative, quality)}`,
    }));
    return true;
  }
  const pageCount = Math.max(Math.ceil(positiveItems.length / 2), Math.ceil(negativeItems.length));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const positiveChunk = positiveItems.slice(pageIndex * 2, pageIndex * 2 + 2);
    const negativeChunk = negativeItems.slice(pageIndex, pageIndex + 1);
    pages.push(page({
      title: `POSITIVE AND NEGATIVE FINDINGS${pageIndex ? ' - CONTINUED' : ''}`, period, sourceRunId, className: 'findings',
      body: `<div class="approval-banner">Agent-produced findings - editorial approval required before client export.</div><div class="findings-grid"><section class="positive"><div class="module-heading"><strong>Positive drivers</strong>${statusTag(positive)}</div>${numberedItems(positiveChunk, pageIndex * 2)}</section><section class="negative"><div class="module-heading"><strong>Negative themes</strong>${statusTag(negative)}</div>${numberedItems(negativeChunk, pageIndex)}</section></div>${pageIndex === 0 ? `${linkedWarnings(positive, quality)}${linkedWarnings(negative, quality)}` : ''}`,
    }));
  }
  return true;
}

function addRecommendationsPages({ pages, contract, period, sourceRunId, quality }) {
  const record = contract.approvedNarrative?.recommendations;
  const items = presentableItems(record);
  if (!items.length) return false;
  for (let index = 0; index < items.length; index += 3) {
    pages.push(page({
      title: `RECOMMENDATIONS${index ? ' - CONTINUED' : ''}`, period, sourceRunId, className: 'recommendations',
      body: `<div class="approval-banner">${statusTag(record)} Agent-produced recommendations require editorial approval.</div>${numberedItems(items.slice(index, index + 3), index)}${index === 0 ? linkedWarnings(record, quality) : ''}`,
    }));
  }
  return true;
}

function currentCompetitorMeasurements(currentSov) {
  const rows = currentSov.competitors || [];
  const available = rows.filter(row => row.state === 'verified' && row.mentions?.value !== null);
  const max = Math.max(...available.map(row => Number(row.mentions.value)), 1);
  return `<div class="sov-measurements">${rows.map(row => {
    if (row.state !== 'verified') return `<div class="sov-measurement unavailable"><strong>${esc(row.name)}</strong><i></i><section><b>Data unavailable</b><small>All current-period competitor measurements unavailable</small></section></div>`;
    const sentiment = row.sentiment || {};
    return `<div class="sov-measurement"><strong>${esc(row.name)}</strong><i><span style="width:${Math.max(2, Number(row.mentions.value) / max * 100)}%"></span></i><section><b>${num(row.mentions.value)} mentions</b><small>Reach ${num(row.reach.value)} | Positive ${num(sentiment.positive.count.value)} | Negative ${num(sentiment.negative.count.value)} | Neutral ${num(sentiment.neutral.count.value)}</small></section></div>`;
  }).join('')}</div><div class="measurement-note"><strong>Counts only</strong>SOV percentages and rankings are unavailable because no compatible denominator was supplied.</div>`;
}

function currentCompetitorSourceMatrix(currentSov) {
  const rows = currentSov.competitors || [];
  const sourceNames = rows.find(row => row.sourceTypes?.items?.length)?.sourceTypes.items.map(item => item.name) || [];
  if (!sourceNames.length) return missing('Competitor source-type dataset unavailable', 'No compatible current-period source counts were supplied.');
  const shortNames = { 'EastWest Bank': 'EastWest', UnionBank: 'Union', 'Security Bank': 'Security', MetroBank: 'Metro', 'Bank of the Philippine Islands (BPI)': 'BPI', BDO: 'BDO' };
  return `<div class="source-matrix"><div class="matrix-row matrix-head"><strong>Source type</strong>${rows.map(row => `<strong>${esc(shortNames[row.name] || row.name)}</strong>`).join('')}</div>${sourceNames.map((name, sourceIndex) => `<div class="matrix-row"><span>${esc(name)}</span>${rows.map(row => {
    if (row.state !== 'verified') return '<b class="matrix-unavailable">Unavailable</b>';
    const record = row.sourceTypes.items[sourceIndex]?.rawCount;
    return record?.state === 'verified' ? `<b>${num(record.value)}</b>` : '<b class="matrix-unavailable">Unavailable</b>';
  }).join('')}</div>`).join('')}</div><div class="matrix-note">Current period only | Raw counts | Blank workbook cells remain unavailable | Percentages not derived</div>`;
}

function qualityFlags(flags = []) {
  if (!flags.length) return '';
  return `<div class="quality-flags"><strong>Review flags</strong>${flags.map(flag => `<div><b>${esc(flag.severity)}</b><span>${esc(flag.message)}</span></div>`).join('')}</div>`;
}

export function eastWestProductionPreviewHtml({ contract, inventory, checklist, includeDiagnostics = true }) {
  const period = contract.reportingContext.reportingPeriods.current;
  const sourceRunId = includeDiagnostics ? contract.reportingContext.provenance.sourceRunId : '';
  const metrics = contract.metrics;
  const records = contract.evidence.records;
  const periodLabel = period.label;
  const blockerCount = inventory.summary.blockers;
  const unavailable = inventory.summary.unavailable;
  const verified = inventory.summary.verified;
  const pages = [];
  const scopes = contract.reportingContext.dataScopes;
  const sourceNarrative = contract.optionalModules?.intelligence?.sourceNarrative;
  const sentimentNarrative = contract.optionalModules?.intelligence?.sentimentNarrative;
  const quality = contract.dataQualityFlags || [];
  const periodMetrics = metrics.periods || null;
  const previousWeek = periodMetrics?.previousWeek;
  const isMeasurementManifest = !!periodMetrics;
  const hasSignalIntelIntelligence = contract.reportingContext.provenance.dataSources?.some(source => source.type === 'signal_intel_output' && source.role === 'intelligence_only');
  const context = isMeasurementManifest ? measurementContext(scopes?.primaryMetrics, sourceRunId) : '';

  pages.push(page({ period, sourceRunId, className: 'cover', body: `<div class="logo-missing">Approved client logo required</div><h1>Social Monitoring Report</h1><div class="period">${esc(periodLabel)}</div>${includeDiagnostics ? '<div class="preview-label">PRODUCTION PREVIEW - NOT FOR CLIENT DISTRIBUTION</div>' : ''}<div class="prepared">Prepared by <strong>Praxis</strong><span>Approved production logo required</span></div>` }));
  pages.push(page({ period, sourceRunId, className: 'divider', body: includeDiagnostics ? `<h1>Production<br>Preview</h1><p>${isMeasurementManifest ? hasSignalIntelIntelligence ? 'Authoritative measurements with Signal Intel intelligence - editorial review required' : 'Authoritative measurements - intelligence content unavailable' : 'Completed Signal Intel output - editorial review required'}</p>` : `<h1>EastWest Bank</h1><p>Social Monitoring Report</p>` }));
  pages.push(page({ title: 'PREVIOUS REPORT SUMMARY', period, sourceRunId, className: 'opening-summary', body: missing('Previous-report summary unavailable', 'The completed Signal Intel run does not include approved previous-period summary content.') }));
  if (includeDiagnostics) pages.push(page({ title: 'READINESS AT A GLANCE', period, sourceRunId, className: 'readiness diagnostic-page', body: `<div class="status-grid"><div><b>${verified}</b><span>Verified fields</span></div><div><b>${unavailable}</b><span>Unavailable fields</span></div><div><b>${blockerCount}</b><span>Client-export blockers</span></div></div><div class="provenance"><strong>Selected period</strong><span>${esc(period.startDate)} to ${esc(period.endDate)}</span><strong>Source record</strong><span>${esc(sourceRunId)}</span><strong>Runtime object</strong><span>${isMeasurementManifest ? hasSignalIntelIntelligence ? 'Current SignalIntel.out intelligence overlay; measurements remain manifest-authoritative' : 'Measurement manifest only; no intelligence object combined' : 'Unavailable; exported PDF inspected read-only'}</span><strong>Primary metric scope</strong><span>${esc(scopeLabel(scopes?.primaryMetrics))}</span><strong>Evidence sample scope</strong><span>${esc(scopeLabel(scopes?.mentionSample))}</span><strong>Reach scope</strong><span>${esc(scopeLabel(scopes?.reach))}</span></div>${qualityFlags(quality)}` }));

  pages.push(page({ title: 'TOTAL MENTIONS', period, sourceRunId, className: isMeasurementManifest ? 'mentions-page measurement-page' : '', body: isMeasurementManifest
    ? `${context}<div class="metric-hero"><b>${num(valueOf(metrics.mentions.total))}</b><span>${esc(metrics.mentions.dailyAverage.displayValue)} mentions/day - derived from verified 7-day series</span></div>${lineChart(metrics.mentions.dailySeries.points)}<aside class="comparison-aside">${periodComparisonPanel({ dataset: previousWeek, period: contract.reportingContext.reportingPeriods.previousWeek, metricKey: 'mentions', title: 'Previous week', unavailableLabel: 'Previous-week mentions unavailable' })}${missing('Previous full month unavailable', `${contract.reportingContext.reportingPeriods.previousFullMonth.label} dataset was not supplied.`)}</aside>`
    : `<div class="metric-hero"><b>${num(valueOf(metrics.mentions.total))}</b><span>${num(valueOf(metrics.mentions.dailyAverage))} daily average</span></div>${lineChart(metrics.mentions.dailySeries.points)}<aside>${missing('Comparison periods unavailable', 'Previous week and previous full month were not pulled for this readiness test.')}</aside>` }));
  pages.push(page({ title: 'SOURCE TYPE', period, sourceRunId, className: `source-page${isMeasurementManifest ? ' measurement-page' : ''}`, body: isMeasurementManifest
    ? `${context}<div class="dataset-label">Current period | Denominator ${num(metrics.sourceTypes.denominator.value)} | Raw counts</div>${bars(metrics.sourceTypes.items)}<aside class="comparison-aside">${sourceComparisonPanel(previousWeek, contract.reportingContext.reportingPeriods.previousWeek)}${missing('Previous full month unavailable', `${contract.reportingContext.reportingPeriods.previousFullMonth.label} source mix was not supplied.`)}</aside>`
    : `${bars(metrics.sourceTypes.items)}${sourceNarrative?.text ? `<div class="source-narrative"><strong>Source narrative</strong>${esc(sourceNarrative.text)}</div>` : ''}<aside>${missing('Comparison source mix unavailable', 'Matching previous-week and previous-full-month source datasets are required.')}</aside>` }));
  pages.push(page({ title: 'REACH', period, sourceRunId, className: isMeasurementManifest ? 'reach-page measurement-page' : '', body: isMeasurementManifest
    ? `${context}<div class="three-metrics"><div><b>${esc(displayOf(metrics.reach.total))}</b><span>Total reach</span></div><div><b>${esc(displayOf(metrics.reach.social))}</b><span>Social reach - rounded source display</span></div><div><b>${esc(displayOf(metrics.reach.nonSocial))}</b><span>Non-social reach - rounded source display</span></div></div><div class="reach-chart">${lineChart(metrics.reach.dailySeries.points)}</div><aside class="comparison-aside">${periodComparisonPanel({ dataset: previousWeek, period: contract.reportingContext.reportingPeriods.previousWeek, metricKey: 'reach', title: 'Previous week', unavailableLabel: 'Previous-week reach unavailable' })}${missing('Previous full month unavailable', `${contract.reportingContext.reportingPeriods.previousFullMonth.label} reach was not supplied.`)}</aside>`
    : `<div class="three-metrics"><div><b>${esc(displayOf(metrics.reach.total))}</b><span>Total reach</span></div><div><b>${esc(displayOf(metrics.reach.social))}</b><span>Social reach</span></div><div><b>${esc(displayOf(metrics.reach.nonSocial))}</b><span>Non-social reach</span></div></div>${missing('Daily reach trend unavailable', 'The completed export provides rounded aggregate reach values but no raw daily reach series.')}<aside>${missing('Comparison reach unavailable', 'Previous week and previous full month were not included.')}</aside>` }));
  pages.push(page({ title: 'SENTIMENT SCORE', period, sourceRunId, className: `sentiment-page${isMeasurementManifest ? ' measurement-page' : ''}`, body: isMeasurementManifest
    ? `${context}${sentimentDonut(metrics.sentiment)}<aside class="comparison-aside">${sentimentComparisonPanel(previousWeek, contract.reportingContext.reportingPeriods.previousWeek)}${missing('Previous full month unavailable', `${contract.reportingContext.reportingPeriods.previousFullMonth.label} sentiment was not supplied.`)}</aside>`
    : `${sentimentDonut(metrics.sentiment)}${sentimentNarrative?.text ? `<div class="sentiment-narrative"><strong>Sentiment narrative</strong>${esc(sentimentNarrative.text)}${statusTag(sentimentNarrative)}</div>` : ''}<aside>${missing('Comparison sentiment unavailable', 'Previous-week and previous-full-month sentiment counts and percentages are required.')}</aside>` }));

  evidencePages({ pages, records, tone: 'positive', title: 'POSITIVE SENTIMENT EVIDENCE', period, sourceRunId });
  evidencePages({ pages, records, tone: 'negative', title: 'NEGATIVE SENTIMENT EVIDENCE', period, sourceRunId });
  evidencePages({ pages, records, tone: 'neutral', title: 'NEUTRAL SENTIMENT EVIDENCE', period, sourceRunId });
  pages.push(page({ title: 'WORD CLOUD', period, sourceRunId, body: missing('Current-period word cloud unavailable', 'Provide weighted terms or an approved export for August 31-September 6, 2026.') }));
  addOperationalMetricsPage({ pages, contract, period, sourceRunId });
  addConversationDriverPages({ pages, contract, period, sourceRunId, quality });
  addMonitoringEventsPage({ pages, contract, period, sourceRunId, quality });
  pages.push(page({ period, sourceRunId, className: 'divider', body: `<h1>Competitor<br>Performance</h1><p>Structured data required</p>` }));
  pages.push(page({ title: 'COMPETITOR EVIDENCE', period, sourceRunId, body: missing('Competitor evidence unavailable', 'Approved cohort identities, logos, positive/negative screenshots, captions, metrics, URLs, timestamps, and provenance are required.') }));
  pages.push(page({ title: 'COMPETITOR EVIDENCE - CONTINUED', period, sourceRunId, body: missing('No additional competitor evidence', 'This baseline page remains explicit because no current-period competitor evidence was supplied.') }));
  addCompetitorNotesPages({ pages, contract, period, sourceRunId, quality });
  const sovRows = contract.sov.current.competitors || [];
  pages.push(page({ title: 'SHARE OF VOICE - MENTIONS', period, sourceRunId, className: `sov-page${isMeasurementManifest ? ' measurement-page' : ''}`, body: isMeasurementManifest
    ? `${context}<div class="dataset-label">Current period | Cohort ${esc(contract.sov.current.cohortId)} | Compatible SOV denominator unavailable</div>${currentCompetitorMeasurements(contract.sov.current)}`
    : sovRows.length ? `<div class="sov-bars">${sovRows.map(row => `<div class="sov-row ${row.state !== 'verified' ? 'needs-review' : ''}"><span>${esc(row.name)}</span><i style="width:${row.sovPercentage?.value ?? 1}%"></i><b>${row.state === 'verified' ? `${row.sovPercentage.value}% - ${num(row.mentions.value)}` : 'Unavailable - monitored zero under review'}</b></div>`).join('')}</div>` : missing('Current-period SOV unavailable', 'The existing report output did not include a completed compatible competitor cohort.') }));
  pages.push(page({ title: 'SOV MENTIONS COMPARISON', period, sourceRunId, body: missing('SOV comparison periods unavailable', 'Provide current, previous week, previous full month, and YTD mention totals for the same cohort and filters.') }));
  pages.push(page({ title: 'SOV SOURCE TYPE', period, sourceRunId, className: isMeasurementManifest ? 'sov-source-page measurement-page' : '', body: isMeasurementManifest
    ? `${context}${currentCompetitorSourceMatrix(contract.sov.current)}`
    : missing('Competitor source-type dataset unavailable', 'Provide current-period source counts by competitor using a consistent denominator.') }));
  pages.push(page({ title: 'SOV SOURCE TYPE COMPARISON', period, sourceRunId, body: missing('Source-type comparisons unavailable', 'Provide comparable current, previous-week, previous-full-month, and YTD datasets.') }));
  pages.push(page({ period, sourceRunId, className: 'divider', body: `<h1>Analysis &<br>Recommendations</h1><p>Approval required</p>` }));
  if (!addFindingsPages({ pages, contract, period, sourceRunId, quality })) pages.push(page({ title: 'REPORT SUMMARY', period, sourceRunId, body: missing('Approved summary unavailable', 'No approved current-period findings were included in the available output.') }));
  if (!addRecommendationsPages({ pages, contract, period, sourceRunId, quality })) {
    const recommendations = contract.approvedNarrative?.recommendations;
    pages.push(page({
      title: 'RECOMMENDATIONS',
      period,
      sourceRunId,
      body: recommendations?.items?.length
        ? `${missing('Recommendations held for review', 'The supplied recommendations depend on incompatible measurements or unavailable SOV calculations.')}${linkedWarnings(recommendations, quality)}`
        : missing('Approved recommendations unavailable', 'Recommendations must be supplied and approved for this reporting period.'),
    }));
  }
  if (includeDiagnostics) pages.push(page({ period, sourceRunId, className: 'closing diagnostic-page', body: `<h1>Production Preview Complete</h1><p>${blockerCount} client-export blockers remain.</p><div class="checklist">${checklist.map(group => `<div><strong>${esc(group.group)}</strong><span>${group.items.length} inputs required</span></div>`).join('')}</div><div class="preview-label">NOT FOR CLIENT DISTRIBUTION</div>` }));

  return `<!doctype html><html><head><meta charset="utf-8"><title>EastWest Production Preview - ${esc(periodLabel)}</title><style>
    @page{size:720pt 405pt;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#ddd;font-family:Arial,sans-serif;color:#292929}body{counter-reset:page}.page{width:720pt;height:405pt;padding:11pt;background:#b8db00;page-break-after:always;counter-increment:page;overflow:hidden}.sheet{position:relative;width:100%;height:100%;padding:28pt 34pt 30pt;background:#fff;overflow:hidden}h1,h2,h3,p{margin:0}h2{color:#d00046;font-size:18pt;line-height:1.05;text-transform:uppercase;letter-spacing:0}footer{position:absolute;left:34pt;right:34pt;bottom:10pt;display:flex;justify-content:space-between;color:#777;font-size:6.5pt;border-top:.5pt solid #ddd;padding-top:4pt}.page-number:after{content:'Page ' counter(page)}.cover h1{margin-top:92pt;color:#d00046;font-size:34pt}.period{font-size:18pt;margin-top:9pt}.preview-label{display:inline-block;margin-top:16pt;padding:5pt 8pt;background:#fff0f5;border:1pt solid #d00046;color:#d00046;font-weight:700;font-size:8pt}.logo-missing{position:absolute;top:30pt;left:34pt;padding:8pt;border:1pt dashed #999;color:#777;font-size:8pt}.prepared{position:absolute;right:38pt;bottom:45pt;text-align:right}.prepared strong{display:block;color:#d00046;font-size:16pt}.prepared span{display:block;color:#777;font-size:7pt;margin-top:4pt}.divider .sheet{background:#d00046;color:#fff}.divider h1{font-size:37pt;line-height:1.02;margin-top:95pt}.divider p{margin-top:12pt;font-size:12pt}.divider footer{color:#fff;border-color:#ee8eb1}.readiness .status-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin-top:26pt}.status-grid div{border:1pt solid #ddd;padding:14pt}.status-grid b{display:block;color:#d00046;font-size:28pt}.status-grid span{font-size:9pt}.provenance{display:grid;grid-template-columns:125pt 1fr;gap:8pt 12pt;margin-top:24pt;font-size:9pt;line-height:1.3}.provenance strong{color:#d00046}.metric-hero{position:absolute;left:40pt;top:75pt}.metric-hero b{display:block;font-size:31pt;color:#d00046}.metric-hero span{font-size:9pt}.line-chart{position:absolute;left:55pt;top:100pt;width:470pt;height:215pt}.line-chart .grid{stroke:#ddd;stroke-width:1}.line-chart .series{fill:none;stroke:#d00046;stroke-width:3}.line-chart circle{fill:#b8db00;stroke:#6c8200;stroke-width:1}.line-chart text{font-size:10px;fill:#555}.chart-missing{position:absolute;left:60pt;top:145pt;width:450pt}.page aside{position:absolute;right:30pt;top:64pt;width:165pt}.missing{border:1pt dashed #d00046;background:#fff5f8;padding:13pt;color:#5b2638;min-height:70pt;display:flex;flex-direction:column;justify-content:center}.missing strong{color:#d00046;font-size:10pt}.missing span{font-size:8pt;line-height:1.35;margin-top:5pt}.bars{width:420pt;margin-top:24pt}.bar-row{display:grid;grid-template-columns:80pt 1fr 72pt;align-items:center;gap:8pt;height:25pt;font-size:8pt}.bar-row i{display:block;height:11pt;background:#d00046;border-right:5pt solid #b8db00}.bar-row b{text-align:right}.bar-row small{display:block;color:#777;font-weight:400}.three-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin:34pt 190pt 28pt 0}.three-metrics div{padding:13pt;border-bottom:4pt solid #b8db00}.three-metrics b{display:block;font-size:20pt;color:#d00046}.three-metrics span{font-size:8pt}.three-metrics+.missing{width:425pt}.sentiment-wrap{display:flex;gap:35pt;align-items:center;margin:45pt 0 0 65pt}.donut{width:170pt;height:170pt;border-radius:50%;display:grid;place-items:center}.donut span{width:98pt;height:98pt;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:19pt;font-weight:700}.donut small{font-size:7pt;font-weight:400}.legend{width:150pt;font-size:10pt}.legend div{display:grid;grid-template-columns:14pt 1fr 35pt;margin:12pt 0}.legend i{width:8pt;height:8pt;border-radius:50%}.legend .neutral{background:#bcbcbc}.legend .negative{background:#e34b45}.legend .positive{background:#66ad5d}.evidence-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14pt;margin-top:26pt;width:475pt}.evidence{border:1pt solid #ddd;padding:9pt;min-height:245pt}.shot{height:82pt;background:#f6f6f6;border:1pt dashed #999;display:grid;place-items:center;color:#777;font-size:8pt}.evidence-meta{display:flex;justify-content:space-between;font-size:7pt;color:#777;margin-top:6pt}.evidence h3{font-size:9pt;line-height:1.2;color:#d00046;margin-top:7pt}.evidence p{font-size:8.5pt;line-height:1.3;margin-top:5pt}.url{font-size:7pt;color:#d00046;margin-top:6pt}.sheet>h2+.missing{margin-top:65pt;max-width:590pt;min-height:150pt}.closing h1{color:#d00046;font-size:30pt;margin-top:45pt}.closing p{font-size:13pt;margin-top:8pt}.checklist{display:grid;grid-template-columns:repeat(2,1fr);gap:8pt;margin-top:30pt;width:510pt}.checklist div{border-left:5pt solid #b8db00;padding:8pt;background:#f7f7f7}.checklist strong,.checklist span{display:block}.checklist strong{font-size:9pt;color:#d00046}.checklist span{font-size:7pt;margin-top:3pt}
    .page aside{z-index:5}
    .sentiment-wrap{width:450pt}
    .donut{flex:0 0 auto}
    .evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
    .evidence{height:245pt;min-height:0;overflow:hidden;break-inside:avoid}
    .readiness .provenance{gap:6pt 12pt;font-size:8pt}
    .source-page .bar-row{height:21pt}
    .source-narrative{position:absolute;left:34pt;bottom:31pt;width:420pt;border-left:5pt solid #b8db00;padding:6pt 8pt;background:#f7f7f7;font-size:8.5pt;line-height:1.3}
    .source-narrative strong{display:block;color:#d00046;font-size:8pt;text-transform:uppercase;margin-bottom:2pt}
    .module-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12pt;margin-top:25pt}
    .module-list section{border-left:5pt solid #b8db00;padding:8pt 10pt;background:#f7f7f7;min-height:105pt;overflow:hidden}
    .module-heading{display:flex;justify-content:space-between;gap:8pt;color:#d00046;font-size:9pt;text-transform:capitalize}
    .module-heading span{font-size:6.5pt;color:#777;text-transform:uppercase}
    .module-list p{font-size:7.5pt;line-height:1.3;margin-top:5pt}
    .approval-banner{margin-top:18pt;padding:7pt 9pt;background:#fff4f7;border-left:5pt solid #d00046;font-size:8.5pt;line-height:1.3;color:#5b2638}
    .state-tag{display:inline-block;padding:2pt 4pt;border:0.5pt solid #d00046;color:#d00046;background:#fff;font-size:6.5pt;text-transform:uppercase;margin-right:5pt}
    .opening-summary .summary-copy{width:410pt;margin-top:18pt;font-size:10pt;line-height:1.55}
    .opening-summary .missing{position:absolute;right:34pt;top:100pt;width:190pt;min-height:125pt}
    .quality-flags{position:absolute;right:34pt;top:66pt;width:265pt;border-left:5pt solid #d00046;padding:7pt 9pt;background:#fff4f7}
    .quality-flags>strong{display:block;color:#d00046;font-size:8pt;text-transform:uppercase;margin-bottom:4pt}
    .quality-flags div{display:grid;grid-template-columns:42pt 1fr;gap:5pt;margin-top:4pt;font-size:6.2pt;line-height:1.2}
    .quality-flags b{text-transform:uppercase;color:#d00046}
    .readiness .provenance{width:300pt}
    .review-note{margin-top:5pt;padding:5pt;background:#fff4f7;font-size:7.2pt;line-height:1.25;color:#5b2638}
    .review-note strong{display:block;color:#d00046;text-transform:uppercase;margin-bottom:2pt}
    .evidence .shot{height:72pt}
    .evidence p{font-size:8.5pt;line-height:1.3}
    .evidence .url{font-size:7pt}
    .sentiment-page .sentiment-wrap{margin-left:20pt;gap:22pt}
    .sentiment-narrative{position:absolute;left:34pt;bottom:31pt;width:470pt;border-left:5pt solid #b8db00;padding:7pt 9pt;background:#f7f7f7;font-size:8pt;line-height:1.3}
    .sentiment-narrative>strong{display:block;color:#d00046;text-transform:uppercase;font-size:8pt;margin-bottom:3pt}
    .sentiment-narrative .state-tag{float:right;margin:0 0 2pt 5pt}
    .module-intro{font-size:9pt;margin-top:18pt;color:#666}
    .metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin-top:18pt}
    .metric-grid>div{min-height:68pt;padding:9pt;border-left:5pt solid #b8db00;background:#f7f7f7}
    .metric-grid>div>span:first-child{display:block;font-size:8.5pt;text-transform:capitalize;color:#666}
    .metric-grid b{display:block;font-size:16pt;color:#d00046;margin:5pt 0}
    .driver-columns{display:grid;grid-template-columns:1fr 1fr;gap:15pt;margin-top:20pt}
    .driver-columns>section{min-width:0}
    .module-heading{display:flex;align-items:center;justify-content:space-between;gap:6pt;color:#d00046;font-size:9pt;text-transform:uppercase}
    .topic-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7pt;margin-top:9pt}
    .topic-grid>div{padding:7pt;background:#f2f1ed;border-left:4pt solid #b8db00;min-height:55pt}
    .topic-grid strong,.topic-grid span,.topic-grid small{display:block}
    .topic-grid strong{font-size:8.5pt;line-height:1.2}.topic-grid span{font-size:8pt;margin-top:4pt;color:#187a57;font-weight:700}.topic-grid small{font-size:7.5pt;color:#777;margin-top:2pt}
    .module-kind{padding:3pt 5pt;border:0.5pt solid currentColor;font-size:6.5pt;line-height:1;text-transform:uppercase}.module-kind.measured{color:#187a57;background:#eef8f1}.module-kind.inferred{color:#d00046;background:#fff4f7}
    .numbered-items{margin-top:10pt}
    .numbered-items>div{display:grid;grid-template-columns:24pt 1fr;gap:7pt;margin-top:8pt}
    .numbered-items b{color:#d00046;font-size:9pt}.numbered-items p{font-size:9pt;line-height:1.4}
    .event-list{margin-top:18pt;width:590pt}.event-card{display:grid;grid-template-columns:28pt 1fr;gap:9pt;padding:10pt 0;border-bottom:0.5pt solid #ddd}.event-card>b{color:#d00046;font-size:9pt}.event-card section>div{display:grid;grid-template-columns:72pt 1fr;gap:8pt;margin-bottom:7pt;font-size:9pt;line-height:1.4}.event-card section strong{color:#d00046;text-transform:uppercase;font-size:7pt}.event-card section span{min-width:0}
    .conflict-callout{padding:7pt 9pt;background:#fff4f7;border:1pt solid #d00046;color:#5b2638;font-size:7pt;line-height:1.3}
    .monitoring-events .conflict-callout{position:absolute;left:34pt;bottom:34pt;width:590pt}
    .competitor-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8pt;margin-top:12pt}
    .competitor-grid section{padding:10pt;background:#f2f1ed;border-left:4pt solid #b8db00;min-height:112pt}
    .competitor-grid strong{color:#187a57;font-size:9pt}.competitor-grid p{font-size:8.5pt;line-height:1.35;margin-top:5pt}.competitor-grid small{display:block;margin-top:6pt;color:#777;font-size:6.5pt;text-transform:uppercase}
    .sov-bars{margin-top:24pt;width:590pt}.sov-row{display:grid;grid-template-columns:125pt 1fr 130pt;align-items:center;gap:8pt;height:31pt;font-size:7.5pt}.sov-row i{display:block;height:10pt;background:#d00046}.sov-row b{text-align:right}.sov-row.needs-review i{background:#aaa}.sov-row.needs-review b{color:#d00046}
    .sov-page .conflict-callout{margin-top:12pt;width:590pt}
    .measurement-context{position:absolute;right:34pt;top:31pt;display:flex;gap:5pt;font-size:6.5pt;color:#666}.measurement-context span{padding:2pt 4pt;border:0.5pt solid #bbb;background:#fff}.measurement-context span:first-child{border-color:#b8db00;color:#526400;font-weight:700}
    .dataset-label{margin-top:15pt;font-size:7pt;color:#666}.comparison-aside{display:flex;flex-direction:column;gap:7pt}.comparison-aside .missing{min-height:58pt;padding:8pt}.comparison-aside .missing strong{font-size:8pt}.comparison-aside .missing span{font-size:6.8pt}
    .comparison-panel{border-left:4pt solid #b8db00;background:#f7f7f7;padding:8pt;min-height:142pt}.comparison-panel>strong,.comparison-panel>span,.comparison-panel>b,.comparison-panel>small{display:block}.comparison-panel>strong{color:#d00046;font-size:8.5pt;text-transform:uppercase}.comparison-panel>span{font-size:7pt;margin-top:3pt;color:#555}.comparison-panel>b{font-size:17pt;margin-top:7pt}.comparison-panel>small{font-size:6.5pt;color:#777;margin-top:2pt}.mini-line-chart{width:148pt;height:72pt;margin-top:3pt}.mini-line-chart .grid{stroke:#ccc;stroke-width:1}.mini-line-chart .series{fill:none;stroke:#d00046;stroke-width:2}.mini-line-chart circle{fill:#b8db00}.mini-line-chart text{font-size:6px;fill:#555}
    .source-comparison{min-height:190pt}.source-comparison>div{display:grid;grid-template-columns:55pt 1fr 25pt;gap:3pt;align-items:center;height:14pt;font-size:6.3pt}.source-comparison>div i{height:5pt;background:#d00046}.source-comparison>div b{text-align:right}.source-page.measurement-page .bars{margin-top:8pt}.source-page.measurement-page .bar-row{height:20pt}.source-page.measurement-page .bar-row small{font-size:6pt}
    .reach-page .three-metrics{margin-top:26pt;margin-bottom:0}.reach-page .line-chart{left:43pt;top:151pt;width:450pt;height:165pt}.reach-page .metric-hero{top:68pt}
    .sentiment-comparison{min-height:185pt}.sentiment-comparison>div{padding:6pt 0;border-bottom:0.5pt solid #ddd}.sentiment-comparison>div span,.sentiment-comparison>div b,.sentiment-comparison>div small{display:block}.sentiment-comparison>div span{font-size:7pt;color:#555}.sentiment-comparison>div b{font-size:12pt;color:#d00046}.sentiment-comparison>div small{font-size:6pt;color:#777}.measured-legend{width:185pt}.measured-legend div{grid-template-columns:14pt 1fr 85pt}.measured-legend>small{display:block;font-size:6.5pt;line-height:1.3;color:#777;margin-top:12pt}.sentiment-page.measurement-page .sentiment-wrap{margin-top:52pt}
    .sov-measurements{margin-top:13pt;width:590pt}.sov-measurement{display:grid;grid-template-columns:112pt 1fr 245pt;gap:8pt;align-items:center;height:36pt;border-bottom:0.5pt solid #eee}.sov-measurement>strong{font-size:7.5pt}.sov-measurement>i{height:10pt;background:#eee}.sov-measurement>i span{display:block;height:100%;background:#d00046;border-right:4pt solid #b8db00}.sov-measurement section b,.sov-measurement section small{display:block}.sov-measurement section b{font-size:8pt;color:#d00046}.sov-measurement section small{font-size:6.2pt;line-height:1.25;color:#666;margin-top:2pt}.sov-measurement.unavailable i{background:#ddd}.sov-measurement.unavailable section b{color:#777}.measurement-note{margin-top:10pt;width:590pt;padding:7pt 9pt;background:#fff4f7;border-left:4pt solid #d00046;font-size:7pt}.measurement-note strong{color:#d00046;margin-right:6pt;text-transform:uppercase}
    .source-matrix{margin-top:24pt;border-top:0.5pt solid #ccc;border-left:0.5pt solid #ccc;width:590pt}.matrix-row{display:grid;grid-template-columns:100pt repeat(6,1fr);min-height:22pt}.matrix-row>*{display:flex;align-items:center;padding:4pt 5pt;border-right:0.5pt solid #ccc;border-bottom:0.5pt solid #ccc;font-size:7.5pt}.matrix-row>span{font-weight:700;color:#555}.matrix-row>b{justify-content:flex-end}.matrix-head{background:#d00046;color:#fff;min-height:25pt}.matrix-head strong{font-size:7pt}.matrix-unavailable{font-size:6pt!important;color:#777;background:#f2f2f2}.matrix-note{margin-top:7pt;font-size:6.7pt;color:#666}
    .executive-copy{margin-top:18pt;padding:15pt 18pt;background:#f7f7f7;border-left:5pt solid #b8db00;font-size:10.5pt;line-height:1.55;max-width:590pt}
    .findings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-top:14pt}.findings-grid>section{padding:12pt;min-height:225pt}.findings-grid .positive{background:#eef8f1;border:1pt solid #90d2a7}.findings-grid .negative{background:#fff0f2;border:1pt solid #efadb7}.findings-grid .numbered-items p{font-size:9pt;line-height:1.4}.findings-grid .numbered-items>div{margin-top:10pt}
    .recommendations .numbered-items{margin-top:16pt}.recommendations .numbered-items>div{margin-top:14pt}.recommendations .numbered-items p{font-size:9pt;line-height:1.45}
  </style></head><body>${pages.join('')}</body></html>`;
}
