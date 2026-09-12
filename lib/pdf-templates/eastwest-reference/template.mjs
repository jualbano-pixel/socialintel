import { EASTWEST_REFERENCE_REPORT } from './content.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const paragraphWithLead = ({ lead, body }) => (
  `<span class="ew-summary-lead">${escapeHtml(lead)}</span> ${escapeHtml(body)}`
);

const lineBreaks = value => escapeHtml(value).replaceAll('\n', '<br />');

const chartImage = (assets, key, className, alt) => (
  assets[key]
    ? `<img class="${className}" src="${assets[key]}" alt="${escapeHtml(alt)}" />`
    : `<div class="${className} ew-missing-chart">${escapeHtml(alt)} placeholder - source asset missing</div>`
);

function missingChartState(chart, className) {
  return `<div class="${className} ew-native-chart-shell ew-missing-chart-state">
    <div class="ew-missing-chart-title">${escapeHtml(chart?.title || 'Chart data unavailable')}</div>
    <div>${escapeHtml(chart?.message || 'Structured chart data is unavailable for this proof. Use an approved image fallback or verified dataset.')}</div>
  </div>`;
}

function nativeMetricTrendChart(chart, className) {
  const points = chart?.dailySeries?.points || [];
  if (!points.length) return missingChartState(chart, className);

  const max = Math.max(...points.map(point => Number(point.value) || 0), 1);
  const coords = points.map((point, index) => {
    const x = 30 + (index * (420 / Math.max(points.length - 1, 1)));
    const y = 190 - ((Number(point.value) || 0) / max * 150);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<div class="${className} ew-native-chart-shell">
    <svg class="ew-native-trend-svg" viewBox="0 0 480 220" role="img" aria-label="${escapeHtml(chart.title || 'native trend chart')}">
      <g class="ew-native-grid">
        ${[40, 80, 120, 160, 200].map(y => `<line x1="30" y1="${y}" x2="450" y2="${y}" />`).join('')}
      </g>
      <polyline class="ew-native-line" points="${coords}" />
      ${points.map((point, index) => {
        const x = 30 + (index * (420 / Math.max(points.length - 1, 1)));
        const y = 190 - ((Number(point.value) || 0) / max * 150);
        return `<circle class="ew-native-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"><title>${escapeHtml(point.label)}: ${escapeHtml(point.value)}</title></circle>`;
      }).join('')}
      ${points.map((point, index) => {
        const x = 30 + (index * (420 / Math.max(points.length - 1, 1)));
        return `<text class="ew-native-axis-label" x="${x.toFixed(1)}" y="210">${escapeHtml(point.label)}</text>`;
      }).join('')}
    </svg>
  </div>`;
}

function metricChart(page, period, assets, className, alt) {
  const chart = page.charts?.[period];
  if (chart?.dataState === 'verified_fixture') return nativeMetricTrendChart(chart, className);
  if (chart?.fallbackAsset || page.images?.[period === 'current' ? 'main' : period]) {
    const assetKey = chart?.fallbackAsset || page.images[period === 'current' ? 'main' : period];
    return chartImage(assets, assetKey, `${className} ew-approved-image-fallback`, `${alt} approved image fallback`);
  }
  return missingChartState(chart, className);
}

const traceTag = (page, detail = '') => (
  `<div class="ew-reference-page-tag">Reference page ${escapeHtml(page.referencePage)}${detail ? ` - ${escapeHtml(detail)}` : ''}</div>`
);

function chunkArray(items = [], size = 1) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function resolvedAsset(assets, key, className, alt) {
  return chartImage(assets, key, className, alt);
}

function donutStyle(values) {
  const neutral = values.neutral.size;
  const negative = values.negative.size;
  return `background: conic-gradient(#bfbfbf 0 ${neutral}%, #e74d3f ${neutral}% ${neutral + negative}%, #63ae58 ${neutral + negative}% 100%);`;
}

function sentimentLegend(values, order) {
  return `<div class="ew-sentiment-legend">
    ${order.map(key => `
      <div class="ew-sentiment-row">
        <span class="ew-sentiment-dot ew-${key}"></span>
        <span class="ew-sentiment-name">${escapeHtml(values[key].label)}</span>
        <span class="ew-sentiment-value">${escapeHtml(values[key].value)}</span>
        <span class="ew-sentiment-percent">${escapeHtml(values[key].percent)}</span>
      </div>
    `).join('')}
  </div>`;
}

function metricsPage(page, assets) {
  return `<section class="ew-page ew-metric-page ew-${escapeHtml(page.kind)}" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-metric-title">${escapeHtml(page.title)}</h2>
      <div class="ew-metric-main">
        ${metricChart(page, 'current', assets, 'ew-chart-image ew-main-chart', `${page.kind} current week chart`)}
      </div>
      <div class="ew-main-label">${lineBreaks(page.currentLabel)}</div>
      ${page.kind === 'source' ? `<div class="ew-metric-insight">${lineBreaks(page.insight)}</div>` : ''}
      <aside class="ew-comparison">
        <div class="ew-comparison-title">${escapeHtml(page.comparisonTitle)}</div>
        ${metricChart(page, 'previousWeek', assets, 'ew-chart-image ew-comparison-chart ew-comparison-week', `${page.kind} previous week chart`)}
        <div class="ew-comparison-label ew-week-label">${lineBreaks(page.previousWeekLabel)}</div>
        ${metricChart(page, 'previousMonth', assets, 'ew-chart-image ew-comparison-chart ew-comparison-month', `${page.kind} previous full month chart`)}
        <div class="ew-comparison-label ew-month-label">${lineBreaks(page.previousMonthLabel)}</div>
      </aside>
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
      ${traceTag({ referencePage: page.referencePage || page.pageNumber }, page.chartDataState || '')}
    </div>
  </section>`;
}

function sentimentPage(page) {
  return `<section class="ew-page ew-sentiment-page" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-metric-title">${escapeHtml(page.title)}</h2>
      <div class="ew-sentiment-statement">${lineBreaks(page.statement)}</div>
      <div class="ew-donut ew-current-donut" style="${donutStyle(page.current)}"></div>
      <div class="ew-donut-hole ew-current-hole"></div>
      <div class="ew-current-legend">${sentimentLegend(page.current, ['neutral', 'negative', 'positive'])}</div>
      <div class="ew-main-label ew-sentiment-current-label">${lineBreaks(page.currentLabel)}</div>

      <aside class="ew-sentiment-comparison">
        <div class="ew-comparison-title">${escapeHtml(page.comparisonTitle)}</div>
        <div class="ew-donut ew-week-donut" style="${donutStyle(page.previousWeek)}"></div>
        <div class="ew-donut-hole ew-week-hole"></div>
        <div class="ew-week-legend">${sentimentLegend(page.previousWeek, ['neutral', 'negative', 'positive'])}</div>
        <div class="ew-comparison-label ew-sentiment-week-label">${lineBreaks(page.previousWeekLabel)}</div>
        <div class="ew-donut ew-month-donut" style="${donutStyle(page.previousMonth)}"></div>
        <div class="ew-donut-hole ew-month-hole"></div>
        <div class="ew-month-legend">${sentimentLegend(page.previousMonth, ['neutral', 'positive', 'negative'])}</div>
        <div class="ew-comparison-label ew-sentiment-month-label">${lineBreaks(page.previousMonthLabel)}</div>
      </aside>
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
    </div>
  </section>`;
}

function evidenceDonutStyle(tone) {
  if (tone === 'positive') return 'background: conic-gradient(#eeeeee 0 61.2%, #f7d9d7 61.2% 86.2%, #63ae58 86.2% 100%);';
  if (tone === 'negative') return 'background: conic-gradient(#f1f1f1 0 61.2%, #e74d3f 61.2% 86.2%, #dff0dc 86.2% 100%);';
  return 'background: conic-gradient(#bfbfbf 0 61.2%, #f7d9d7 61.2% 86.2%, #dff0dc 86.2% 100%);';
}

function evidenceCard(card, assets, index) {
  return `<article class="ew-evidence-card ew-evidence-card-${index + 1} ${escapeHtml(card.className)}">
    ${chartImage(assets, card.asset, 'ew-evidence-image', `reference page evidence crop ${index + 1}`)}
    <div class="ew-evidence-meta">
      <span>${escapeHtml(card.reach)}</span>
      <span class="ew-link">${escapeHtml(card.link)}</span>
    </div>
    <div class="ew-evidence-caption ${card.overflowState ? 'ew-evidence-caption-overflow' : ''}">${escapeHtml(card.displayText || card.text)}</div>
  </article>`;
}

function evidencePage(page, assets) {
  return `<section class="ew-page ew-evidence-page ew-${escapeHtml(page.tone)}-evidence" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-evidence-title">${escapeHtml(page.title)}</h2>
      <div class="ew-evidence-donut" style="${evidenceDonutStyle(page.tone)}"></div>
      <div class="ew-evidence-hole"></div>
      <div class="ew-tone-row">
        <span class="ew-sentiment-dot ew-${escapeHtml(page.tone)}"></span>
        <span class="ew-tone-name">${escapeHtml(page.summaryMetric.label)}</span>
        <span class="ew-tone-value">${escapeHtml(page.summaryMetric.value)}</span>
        <span class="ew-tone-percent">${escapeHtml(page.summaryMetric.percent)}</span>
      </div>
      <div class="ew-evidence-statement">${lineBreaks(page.statement)}</div>
      ${traceTag(page)}
      <div class="ew-evidence-grid">
        ${page.cards.map((card, index) => evidenceCard(card, assets, index)).join('')}
      </div>
    </div>
  </section>`;
}

function wordCloudPage(page, assets) {
  return `<section class="ew-page ew-word-cloud-page" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-evidence-title">${escapeHtml(page.title)}</h2>
      <div class="ew-word-cloud-subtitle">${lineBreaks(page.subtitle)}</div>
      ${chartImage(assets, page.image, 'ew-word-cloud-image', 'reference word cloud crop')}
      ${traceTag(page)}
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
    </div>
  </section>`;
}

function referenceSheetPage(page, assets) {
  if (page.type === 'sectionDivider') {
    return `<section class="ew-page ew-divider ew-competitor-divider" aria-label="${escapeHtml(page.title)}">
      <div class="ew-sheet">
        <h2 class="ew-divider-title">${lineBreaks(page.title)}</h2>
        ${traceTag(page)}
      </div>
    </section>`;
  }

  return `<section class="ew-page ew-reference-sheet-page" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      ${chartImage(assets, page.asset, 'ew-reference-sheet-image', `${page.title} reference sheet crop`)}
      ${traceTag(page, page.pattern)}
    </div>
  </section>`;
}

function competitorEvidencePage(page, assets) {
  const maxPerPage = page.maxCompetitorsPerPage || 3;
  return chunkArray(page.competitors, maxPerPage).map((competitors, pageIndex) => {
    const continuation = pageIndex > 0;
    return `<section class="ew-page ew-competitor-evidence-page ew-competitor-count-${competitors.length}" aria-label="${escapeHtml(page.title)}${continuation ? ' continuation' : ''}">
      <div class="ew-sheet">
        <h2 class="ew-competitor-title">${escapeHtml(page.title)}${continuation ? ' Continued' : ''}</h2>
        <div class="ew-competitor-grid">
          ${competitors.map(competitor => competitorEvidenceColumn(competitor, assets)).join('')}
        </div>
        <div class="ew-footer-title">${escapeHtml(page.footerTitle || page.title)}</div>
        ${traceTag({ referencePage: continuation ? `${page.referencePage}+` : page.referencePage }, page.pattern)}
      </div>
    </section>`;
  }).join('');
}

function competitorEvidenceColumn(competitor, assets) {
  return `<article class="ew-competitor-column ew-comp-${escapeHtml(competitor.accent)}">
    ${resolvedAsset(assets, competitor.logoAsset, 'ew-competitor-logo', `${competitor.name} logo crop`)}
    <div class="ew-competitor-item ew-positive-item">
      ${resolvedAsset(assets, competitor.positive.asset, 'ew-competitor-shot', `${competitor.name} positive evidence crop`)}
      <div class="ew-competitor-meta">
        <span>${escapeHtml(competitor.positive.metric)}</span>
        <span class="ew-link">${escapeHtml(competitor.positive.link)}</span>
      </div>
      <div class="ew-competitor-caption ew-positive-caption">${escapeHtml(competitor.positive.caption)}</div>
    </div>
    <div class="ew-operator ew-plus">+</div>
    <div class="ew-competitor-item ew-negative-item">
      ${resolvedAsset(assets, competitor.negative.asset, 'ew-competitor-shot', `${competitor.name} negative evidence crop`)}
      <div class="ew-competitor-meta">
        <span>${escapeHtml(competitor.negative.metric)}</span>
        <span class="ew-link">${escapeHtml(competitor.negative.link)}</span>
      </div>
      <div class="ew-competitor-caption ew-negative-caption">${escapeHtml(competitor.negative.caption)}</div>
    </div>
    <div class="ew-operator ew-minus">-</div>
  </article>`;
}

function sovMentionsCurrentPage(page, assets) {
  return `<section class="ew-page ew-sov-page ew-sov-mentions-current" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-sov-title">${escapeHtml(page.title)}</h2>
      ${resolvedAsset(assets, page.donutChartAsset, 'ew-sov-current-donut-chart', 'approved SOV mentions donut image fallback')}
      ${resolvedAsset(assets, page.lineChartAsset, 'ew-sov-current-line-chart', 'approved SOV mentions trend image fallback')}
      <div class="ew-sov-peaks">
        ${page.peakItems.map(item => `<article class="ew-sov-peak">
          ${resolvedAsset(assets, item.asset, 'ew-sov-peak-image', 'approved competitor peak evidence image fallback')}
          <div class="ew-sov-peak-caption">${escapeHtml(item.caption)}</div>
        </article>`).join('')}
      </div>
      <div class="ew-sov-peaks-label">Competitor Peaks</div>
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
      ${traceTag(page, page.chartDataState)}
    </div>
  </section>`;
}

function sovDonutComparisonPage(page, assets) {
  return `<section class="ew-page ew-sov-page ew-sov-donut-comparison" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-sov-title">${escapeHtml(page.title)}</h2>
      <div class="ew-sov-narrative">${lineBreaks(page.narrative)}</div>
      <div class="ew-sov-comparison-grid">
        ${page.charts.map(chart => `<article class="ew-sov-comparison-card">
          ${resolvedAsset(assets, chart.asset, 'ew-sov-comparison-image', `${chart.label} approved donut image fallback`)}
          ${chart.labelVisibility === 'image_fallback_only' ? '' : `<div class="ew-sov-comparison-label">${escapeHtml(chart.label)}</div>`}
        </article>`).join('')}
      </div>
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
      ${traceTag(page, page.chartDataState)}
    </div>
  </section>`;
}

function sovSourceCurrentPage(page, assets) {
  return `<section class="ew-page ew-sov-page ew-sov-source-current" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-sov-title">${escapeHtml(page.title)}</h2>
      <div class="ew-sov-subtitle">${lineBreaks(page.subtitle)}</div>
      ${resolvedAsset(assets, page.chartAsset, 'ew-sov-source-chart', 'approved SOV source-type ranked bar image fallback')}
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
      ${traceTag(page, page.chartDataState)}
    </div>
  </section>`;
}

function sovSourceComparisonPage(page, assets) {
  return `<section class="ew-page ew-sov-page ew-sov-source-comparison" aria-label="${escapeHtml(page.title)}">
    <div class="ew-sheet">
      <h2 class="ew-sov-title">${escapeHtml(page.title)}</h2>
      <div class="ew-sov-subtitle">${lineBreaks(page.subtitle)}</div>
      <div class="ew-sov-source-grid">
        ${page.charts.map(chart => `<article class="ew-sov-source-card">
          ${resolvedAsset(assets, chart.asset, 'ew-sov-source-comparison-image', `${chart.label} approved source chart image fallback`)}
          <div class="ew-sov-source-label">${escapeHtml(chart.label)}</div>
        </article>`).join('')}
      </div>
      <div class="ew-footer-title">${escapeHtml(page.footerTitle)}</div>
      <div class="ew-footer-note">${escapeHtml(page.note)}</div>
      ${traceTag(page, page.chartDataState)}
    </div>
  </section>`;
}

function competitorAndSovPage(page, assets) {
  if (page.type === 'competitorEvidence') return competitorEvidencePage(page, assets);
  if (page.type === 'sovMentionsCurrent') return sovMentionsCurrentPage(page, assets);
  if (page.type === 'sovDonutComparison') return sovDonutComparisonPage(page, assets);
  if (page.type === 'sovSourceCurrent') return sovSourceCurrentPage(page, assets);
  if (page.type === 'sovSourceComparison') return sovSourceComparisonPage(page, assets);
  return referenceSheetPage(page, assets);
}

function finalPage(page, report, assets) {
  if (page.type === 'sectionDivider') {
    return `<section class="ew-page ew-divider ew-final-divider" aria-label="${escapeHtml(page.title)}">
      <div class="ew-sheet">
        <h2 class="ew-divider-title">${lineBreaks(page.title)}</h2>
        ${traceTag(page)}
      </div>
    </section>`;
  }

  if (page.type === 'reportSummary') {
    const chunkSize = page.maxItemsPerPage || page.items.length;
    return chunkArray(page.items, chunkSize).map((items, pageIndex) => `<section class="ew-page ew-final-text-page ew-report-summary-page" aria-label="${escapeHtml(page.title)}${pageIndex ? ' continuation' : ''}">
      <div class="ew-sheet">
        <h2 class="ew-final-title">${escapeHtml(page.title)}${pageIndex ? ' Continued' : ''}</h2>
        <div class="ew-final-list ew-numbered-final-list">
          ${items.map((item, index) => `
            <div class="ew-final-num">${pageIndex * chunkSize + index + 1}.</div>
            <div class="ew-final-copy">
              ${paragraphWithLead(item)}
              ${item.subitems?.length ? `<ul class="ew-final-subitems">${item.subitems.map(subitem => `<li>${escapeHtml(subitem)}</li>`).join('')}</ul>` : ''}
              ${item.overflowState ? `<div class="ew-final-overflow-flag">${escapeHtml(item.overflowState)}</div>` : ''}
            </div>
          `).join('')}
        </div>
        ${traceTag({ referencePage: pageIndex ? `${page.referencePage}+` : page.referencePage })}
      </div>
    </section>`).join('');
  }

  if (page.type === 'recommendations') {
    const chunkSize = page.maxItemsPerPage || page.items.length;
    return chunkArray(page.items, chunkSize).map((items, pageIndex) => `<section class="ew-page ew-final-text-page ew-recommendations-page" aria-label="${escapeHtml(page.title)}${pageIndex ? ' continuation' : ''}">
      <div class="ew-sheet">
        <h2 class="ew-final-title">${escapeHtml(page.title)}${pageIndex ? ' Continued' : ''}</h2>
        <ul class="ew-recommendation-list">
          ${items.map(item => `
            <li><span class="ew-summary-lead">${escapeHtml(item.lead)}</span> - ${escapeHtml(item.body)}${item.overflowState ? `<div class="ew-final-overflow-flag">${escapeHtml(item.overflowState)}</div>` : ''}</li>
          `).join('')}
        </ul>
        ${traceTag({ referencePage: pageIndex ? `${page.referencePage}+` : page.referencePage })}
      </div>
    </section>`).join('');
  }

  return `<section class="ew-page ew-cover ew-closing-cover" aria-label="Closing cover">
    <div class="ew-sheet">
      ${assets.clientLogoDataUri ? `<img class="ew-client-logo" src="${assets.clientLogoDataUri}" alt="${escapeHtml(report.clientLogoAlt)}" />` : `<div class="ew-client-logo ew-missing-asset">${escapeHtml(report.clientLogoAlt)}</div>`}
      <h1 class="ew-cover-title">${escapeHtml(report.cover.title)}</h1>
      <div class="ew-cover-period">${escapeHtml(report.cover.period)}</div>
      <div class="ew-prepared-by">${escapeHtml(report.cover.preparedBy)}</div>
      ${assets.preparedByLogoDataUri ? `<img class="ew-prepared-logo" src="${assets.preparedByLogoDataUri}" alt="${escapeHtml(report.preparedByLogoAlt)}" />` : `<div class="ew-prepared-logo ew-missing-asset">${escapeHtml(report.preparedByLogoAlt)}</div>`}
      ${traceTag(page)}
    </div>
  </section>`;
}

function validationIssuesPages(issues = []) {
  if (!issues.length) return '';
  return chunkArray(issues, 7).map((pageIssues, pageIndex) => `<section class="ew-page ew-validation-page" aria-label="Synthetic validation issues${pageIndex ? ' continued' : ''}">
    <div class="ew-sheet">
      <h2 class="ew-validation-title">Synthetic Validation Issues${pageIndex ? ' Continued' : ''}</h2>
      <div class="ew-validation-subtitle">Test content only - these issues would block client export until corrected or explicitly continued.</div>
      <div class="ew-validation-list">
        ${pageIssues.map(item => `<div class="ew-validation-item">
          <div class="ew-validation-code">${escapeHtml(item.code)}${item.itemId ? ` - ${escapeHtml(item.itemId)}` : ''}</div>
          <div class="ew-validation-message">${escapeHtml(item.message)}</div>
          <div class="ew-validation-meta">${[item.section, item.referencePage ? `Reference page ${item.referencePage}` : ''].filter(Boolean).map(escapeHtml).join(' | ')}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>`).join('');
}

export const EASTWEST_REFERENCE_TITLE = 'EastWest Bank Reference Layout Proof';

export function eastWestReferenceDocumentHtml({
  report = EASTWEST_REFERENCE_REPORT,
  assets = {},
  showTraceLabels = false,
  showPageNumbers = false,
  documentTitle = EASTWEST_REFERENCE_TITLE,
  validationIssues = [],
} = {}) {
  const clientLogo = assets.clientLogoDataUri || '';
  const preparedByLogo = assets.preparedByLogoDataUri || '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ew-lime: #d8ea25;
      --ew-magenta: #bd007a;
      --ew-text: #5d5d5d;
      --ew-black: #191919;
      --ew-white: #ffffff;
    }

    * { box-sizing: border-box; }

    html,
    body {
      margin: 0;
      padding: 0;
      background: var(--ew-lime);
      color: var(--ew-text);
      font-family: 'Poppins', Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      counter-reset: ewPageNumber;
    }

    @page {
      size: 720pt 405pt;
      margin: 0;
    }

    .ew-proof {
      width: 720pt;
      min-height: 405pt;
      background: var(--ew-lime);
    }

    .ew-page {
      position: relative;
      width: 720pt;
      height: 405pt;
      background: var(--ew-lime);
      break-after: page;
      overflow: hidden;
      padding: 17pt 18.5pt 19pt;
      counter-increment: ewPageNumber;
    }

    .ew-page::before {
      display: none;
      content: counter(ewPageNumber);
      position: absolute;
      right: 23pt;
      bottom: 23pt;
      z-index: 20;
      color: #9a9a9a;
      font-size: 7pt;
      line-height: 1;
    }

    .ew-show-page-numbers .ew-page::before {
      display: block;
    }

    .ew-page:last-child {
      break-after: auto;
    }

    .ew-sheet {
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--ew-white);
      overflow: hidden;
    }

    .ew-cover .ew-sheet {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .ew-client-logo {
      width: 130pt;
      height: auto;
      margin-top: 28pt;
    }

    .ew-cover-title {
      margin: 37pt 0 0;
      color: var(--ew-magenta);
      font-size: 35pt;
      line-height: 1.08;
      font-weight: 400;
      letter-spacing: 0;
    }

    .ew-cover-period {
      margin-top: 13pt;
      color: #5f5f5f;
      font-size: 24pt;
      line-height: 1.2;
      font-weight: 400;
    }

    .ew-prepared-by {
      margin-top: 35pt;
      color: #5f5f5f;
      font-size: 17pt;
      line-height: 1.2;
      font-weight: 400;
    }

    .ew-prepared-logo {
      width: 96pt;
      height: auto;
      margin-top: 8pt;
    }

    .ew-divider .ew-sheet {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .ew-divider-title {
      margin: 2pt 0 0;
      color: var(--ew-magenta);
      font-size: 34pt;
      line-height: 1.24;
      font-weight: 400;
      white-space: pre-line;
      letter-spacing: 0;
    }

    .ew-summary .ew-sheet {
      padding: 26pt 54pt 24pt 37pt;
    }

    .ew-summary-title {
      margin: 0 0 17pt;
      color: var(--ew-magenta);
      font-size: 18pt;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: 0;
    }

    .ew-summary-list {
      display: grid;
      grid-template-columns: 24pt 1fr;
      column-gap: 6pt;
      row-gap: 1.5pt;
      margin: 0;
      color: #5b5b5b;
      font-size: 9.65pt;
      line-height: 1.25;
      font-weight: 400;
    }

    .ew-summary-num {
      text-align: right;
      padding-right: 11pt;
    }

    .ew-summary-text {
      min-width: 0;
    }

    .ew-summary-lead {
      font-weight: 700;
    }

    .ew-subitems {
      margin: 2pt 0 0 18pt;
      padding: 0;
      list-style: circle;
    }

    .ew-subitems li {
      margin: 0 0 1pt;
      padding-left: 6pt;
    }

    .ew-metric-page .ew-sheet,
    .ew-sentiment-page .ew-sheet {
      padding: 0;
    }

    .ew-metric-title {
      position: absolute;
      left: 24pt;
      right: 24pt;
      top: 28pt;
      margin: 0;
      color: var(--ew-magenta);
      font-size: 15.5pt;
      line-height: 1.1;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0;
      z-index: 4;
    }

    .ew-chart-image {
      display: block;
      object-fit: fill;
    }

    .ew-native-chart-shell {
      background: #ffffff;
      overflow: hidden;
    }

    .ew-approved-image-fallback {
      object-fit: fill;
    }

    .ew-missing-chart-state {
      display: flex;
      flex-direction: column;
      gap: 5pt;
      align-items: center;
      justify-content: center;
      color: #565656;
      border: 1.25pt dashed var(--ew-lime);
      background: #fafafa;
      padding: 12pt;
      font-size: 8pt;
      line-height: 1.25;
      text-align: center;
    }

    .ew-missing-chart-title {
      color: var(--ew-magenta);
      font-size: 9pt;
      font-weight: 700;
    }

    .ew-native-trend-svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .ew-native-grid line {
      stroke: #e7e7e7;
      stroke-width: 1;
    }

    .ew-native-line {
      fill: none;
      stroke: #4a9de8;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ew-native-point {
      fill: #4a9de8;
    }

    .ew-native-axis-label {
      fill: #555555;
      font-size: 9px;
      text-anchor: middle;
    }

    .ew-main-chart {
      position: absolute;
      left: 10pt;
      top: 59.5pt;
      width: 485pt;
      height: 241.5pt;
    }

    .ew-source .ew-main-chart {
      left: 14pt;
      top: 55pt;
      width: 395pt;
      height: 228.5pt;
    }

    .ew-reach .ew-main-chart {
      left: 7pt;
      top: 49pt;
      width: 484pt;
      height: 260.5pt;
    }

    .ew-metric-insight {
      position: absolute;
      z-index: 5;
      color: #93a90b;
      font-size: 12.4pt;
      line-height: 1.16;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .ew-mentions .ew-metric-insight {
      left: 286pt;
      top: 61pt;
      width: 208pt;
    }

    .ew-source .ew-metric-insight {
      left: 133pt;
      top: 271pt;
      width: 276pt;
      height: 66pt;
      padding: 1.5pt 10pt 2pt;
      color: #000000;
      background: var(--ew-lime);
      border-radius: 10pt 10pt 0 0;
      font-size: 7.45pt;
      line-height: 1.1;
      font-weight: 400;
      overflow: hidden;
      white-space: normal;
    }

    .ew-source .ew-metric-insight b {
      font-weight: 700;
    }

    .ew-reach .ew-metric-insight {
      left: 274pt;
      top: 53pt;
      width: 213pt;
    }

    .ew-comparison {
      position: absolute;
      right: 6pt;
      top: 47pt;
      width: 180pt;
      height: 300pt;
    }

    .ew-source .ew-comparison {
      right: 25pt;
      top: 51.5pt;
      width: 232pt;
    }

    .ew-comparison-title {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 26pt;
      color: #000000;
      background: var(--ew-lime);
      border-radius: 4pt;
      font-size: 12.2pt;
      line-height: 1;
      font-weight: 700;
      text-align: center;
    }

    .ew-comparison-chart {
      position: absolute;
      left: 8pt;
      width: 165pt;
      height: 90pt;
      border: 1.25pt solid var(--ew-lime);
      object-fit: fill;
    }

    .ew-source .ew-comparison-chart {
      left: 29pt;
      width: 178pt;
    }

    .ew-comparison-week {
      top: 32pt;
    }

    .ew-comparison-month {
      top: 162pt;
    }

    .ew-comparison-label,
    .ew-main-label {
      position: absolute;
      color: #606060;
      font-size: 12pt;
      line-height: 1.09;
      font-weight: 400;
      text-align: center;
      white-space: nowrap;
    }

    .ew-main-label {
      left: 202pt;
      top: 306pt;
      width: 110pt;
    }

    .ew-source .ew-main-label {
      left: 34pt;
      top: 295pt;
    }

    .ew-reach .ew-main-label {
      left: 217pt;
      top: 312pt;
    }

    .ew-week-label {
      left: 43pt;
      top: 127pt;
    }

    .ew-month-label {
      left: 37pt;
      top: 259pt;
    }

    .ew-source .ew-week-label {
      left: 85pt;
      top: 135pt;
    }

    .ew-source .ew-month-label {
      left: 82pt;
      top: 265pt;
    }

    .ew-footer-title {
      position: absolute;
      left: 17pt;
      bottom: 16pt;
      z-index: 10;
      color: #000000;
      font-size: 8.7pt;
      line-height: 1.1;
      font-style: italic;
      font-weight: 400;
    }

    .ew-footer-note {
      position: absolute;
      right: 14pt;
      bottom: 16pt;
      z-index: 10;
      color: #000000;
      font-size: 10.1pt;
      line-height: 1.1;
      font-weight: 400;
    }

    .ew-sentiment-statement {
      position: absolute;
      left: 46pt;
      top: 56pt;
      width: 343pt;
      color: #93a90b;
      font-size: 10.8pt;
      line-height: 1.14;
      font-weight: 700;
      text-align: center;
    }

    .ew-donut {
      position: absolute;
      border-radius: 50%;
      z-index: 2;
    }

    .ew-donut-hole {
      position: absolute;
      border-radius: 50%;
      background: #ffffff;
      z-index: 3;
    }

    .ew-current-donut {
      left: 24pt;
      top: 142pt;
      width: 169pt;
      height: 169pt;
      transform: rotate(0deg);
    }

    .ew-current-hole {
      left: 77pt;
      top: 195pt;
      width: 63pt;
      height: 63pt;
    }

    .ew-week-donut {
      left: 10pt;
      top: 34pt;
      width: 88pt;
      height: 88pt;
    }

    .ew-week-hole {
      left: 37pt;
      top: 61pt;
      width: 34pt;
      height: 34pt;
    }

    .ew-month-donut {
      left: 6pt;
      top: 166pt;
      width: 92pt;
      height: 92pt;
    }

    .ew-month-hole {
      left: 34pt;
      top: 194pt;
      width: 36pt;
      height: 36pt;
    }

    .ew-current-legend {
      position: absolute;
      left: 218pt;
      top: 188pt;
      width: 180pt;
    }

    .ew-sentiment-comparison {
      position: absolute;
      right: 25pt;
      top: 51.5pt;
      width: 244pt;
      height: 297pt;
    }

    .ew-week-legend {
      position: absolute;
      left: 105pt;
      top: 55pt;
      width: 122pt;
    }

    .ew-month-legend {
      position: absolute;
      left: 104pt;
      top: 190pt;
      width: 126pt;
    }

    .ew-sentiment-legend {
      display: flex;
      flex-direction: column;
      gap: 13pt;
    }

    .ew-week-legend .ew-sentiment-legend,
    .ew-month-legend .ew-sentiment-legend {
      gap: 9pt;
    }

    .ew-sentiment-row {
      display: grid;
      grid-template-columns: 11pt 67pt 1fr 36pt;
      align-items: center;
      color: #222222;
      font-size: 9pt;
      line-height: 1;
      white-space: nowrap;
    }

    .ew-current-legend .ew-sentiment-row {
      grid-template-columns: 15pt 89pt 1fr 43pt;
      font-size: 10.2pt;
    }

    .ew-sentiment-dot {
      width: 7pt;
      height: 7pt;
      border-radius: 999px;
      display: inline-block;
    }

    .ew-current-legend .ew-sentiment-dot {
      width: 9pt;
      height: 9pt;
    }

    .ew-neutral { background: #bfbfbf; }
    .ew-negative { background: #e74d3f; }
    .ew-positive { background: #63ae58; }

    .ew-sentiment-name {
      font-weight: 700;
    }

    .ew-sentiment-value,
    .ew-sentiment-percent {
      text-align: right;
      font-weight: 400;
    }

    .ew-sentiment-current-label {
      left: 174pt;
      top: 318pt;
    }

    .ew-sentiment-week-label {
      left: 93pt;
      top: 126pt;
    }

    .ew-sentiment-month-label {
      left: 84pt;
      top: 260pt;
    }

    .ew-missing-chart {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555555;
      background: #f5f5f5;
      border: 1.25pt dashed var(--ew-lime);
      font-size: 8pt;
      line-height: 1.25;
      text-align: center;
      padding: 8pt;
    }

    .ew-evidence-page .ew-sheet,
    .ew-word-cloud-page .ew-sheet {
      padding: 0;
    }

    .ew-evidence-title {
      position: absolute;
      left: 26pt;
      right: 26pt;
      top: 28pt;
      margin: 0;
      color: var(--ew-magenta);
      font-size: 15.5pt;
      line-height: 1.1;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0;
    }

    .ew-evidence-donut {
      position: absolute;
      left: 73pt;
      top: 72pt;
      width: 86pt;
      height: 86pt;
      border-radius: 50%;
    }

    .ew-evidence-hole {
      position: absolute;
      left: 108pt;
      top: 107pt;
      width: 35pt;
      height: 35pt;
      border-radius: 50%;
      background: #ffffff;
    }

    .ew-neutral-evidence .ew-evidence-donut {
      left: 59pt;
      top: 70pt;
      width: 89pt;
      height: 89pt;
    }

    .ew-neutral-evidence .ew-evidence-hole {
      left: 95pt;
      top: 106pt;
      width: 37pt;
      height: 37pt;
    }

    .ew-tone-row {
      position: absolute;
      left: 45pt;
      top: 161pt;
      display: grid;
      grid-template-columns: 14pt 82pt 39pt 38pt;
      align-items: center;
      color: #222222;
      font-size: 9.6pt;
      line-height: 1;
      white-space: nowrap;
    }

    .ew-neutral-evidence .ew-tone-row {
      left: 37pt;
    }

    .ew-tone-name {
      font-weight: 700;
    }

    .ew-tone-value,
    .ew-tone-percent {
      text-align: right;
      font-weight: 400;
    }

    .ew-evidence-statement {
      position: absolute;
      left: 26pt;
      top: 202pt;
      width: 210pt;
      color: #93a90b;
      font-size: 11.35pt;
      line-height: 1.29;
      font-weight: 400;
      letter-spacing: 0;
    }

    .ew-positive-evidence .ew-evidence-statement {
      width: 210pt;
      top: 201pt;
    }

    .ew-negative-evidence .ew-evidence-statement {
      left: 23pt;
      top: 202pt;
      width: 199pt;
      font-weight: 700;
      line-height: 1.34;
    }

    .ew-neutral-evidence .ew-evidence-statement {
      left: 37pt;
      top: 202pt;
      width: 178pt;
      font-weight: 700;
      line-height: 1.36;
    }

    .ew-positive-evidence .ew-evidence-statement::first-line,
    .ew-positive-evidence .ew-evidence-statement {
      font-weight: 400;
    }

    .ew-evidence-grid {
      position: absolute;
      left: 245pt;
      top: 57pt;
      right: 20pt;
      bottom: 25pt;
    }

    .ew-evidence-card {
      position: absolute;
      text-align: center;
      color: #000000;
    }

    .ew-evidence-image {
      display: block;
      width: 100%;
      object-fit: fill;
      border: 1.25pt solid var(--ew-lime);
      background: #ffffff;
    }

    .ew-evidence-meta {
      display: grid;
      grid-template-columns: 1fr 34pt;
      gap: 4pt;
      align-items: end;
      margin-top: 3pt;
      color: #5d5d5d;
      font-size: 6.8pt;
      line-height: 1;
      font-weight: 700;
    }

    .ew-link {
      color: #00899a;
      text-decoration: underline;
      text-align: right;
    }

    .ew-evidence-caption {
      margin-top: 5pt;
      min-height: 48pt;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6pt 9pt;
      color: #000000;
      background: var(--ew-lime);
      border-radius: 8pt;
      font-size: 7.5pt;
      line-height: 1.1;
      font-weight: 400;
    }

    .ew-evidence-caption-overflow {
      min-height: 42pt;
      padding: 4pt 8pt;
      color: #7a0028;
      background: #ffe9ef;
      border: 0.9pt solid #d00046;
      font-size: 7pt;
      line-height: 1.08;
      font-weight: 700;
    }

    .ew-overflow-flag {
      margin-top: 3pt;
      padding: 3pt 5pt;
      color: #7a0028;
      background: #ffe9ef;
      border: 0.75pt solid #d00046;
      border-radius: 4pt;
      font-size: 6.5pt;
      line-height: 1.12;
      font-weight: 700;
      text-align: center;
    }

    .ew-evidence-card-1 {
      left: 16pt;
      top: 17pt;
      width: 184pt;
    }

    .ew-evidence-card-2 {
      right: 0;
      top: 15pt;
      width: 184pt;
    }

    .ew-evidence-card-3 {
      left: 16pt;
      top: 160pt;
      width: 184pt;
    }

    .ew-evidence-card-4 {
      right: 0;
      top: 162pt;
      width: 184pt;
    }

    .ew-positive-evidence .ew-evidence-caption,
    .ew-negative-evidence .ew-evidence-caption {
      margin-top: 2pt;
      min-height: 47pt;
      font-size: 7.25pt;
      line-height: 1.06;
    }

    .ew-positive-evidence .ew-card-wide .ew-evidence-image {
      height: 87pt;
    }

    .ew-positive-evidence .ew-card-small .ew-evidence-image,
    .ew-positive-evidence .ew-card-tall .ew-evidence-image {
      width: 90pt;
      height: 86pt;
      margin-left: auto;
      margin-right: auto;
    }

    .ew-negative-evidence .ew-evidence-grid {
      left: 242pt;
      top: 57pt;
      right: 24pt;
      bottom: 25pt;
    }

    .ew-negative-evidence .ew-evidence-card {
      width: 184pt;
    }

    .ew-negative-evidence .ew-card-wide .ew-evidence-image {
      height: 74pt;
    }

    .ew-negative-evidence .ew-card-wide-short .ew-evidence-image {
      height: 36pt;
    }

    .ew-negative-evidence .ew-evidence-caption {
      min-height: 48pt;
      font-size: 7.7pt;
      line-height: 1.1;
      font-weight: 400;
    }

    .ew-negative-evidence .ew-evidence-card-3 {
      top: 164pt;
    }

    .ew-negative-evidence .ew-evidence-card-4 {
      top: 185pt;
    }

    .ew-neutral-evidence .ew-evidence-grid {
      left: 232pt;
      top: 93pt;
      right: 36pt;
      bottom: 52pt;
    }

    .ew-neutral-evidence .ew-evidence-card-1 {
      left: 34pt;
      top: 24pt;
      width: 158pt;
    }

    .ew-neutral-evidence .ew-evidence-card-2 {
      right: 3pt;
      top: 96pt;
      width: 181pt;
    }

    .ew-neutral-evidence .ew-evidence-image {
      height: auto;
    }

    .ew-neutral-evidence .ew-evidence-caption {
      margin-top: 11pt;
      min-height: 49pt;
      font-size: 12pt;
      line-height: 1.15;
      font-weight: 400;
    }

    .ew-reference-page-tag {
      display: none;
      position: absolute;
      right: 14pt;
      bottom: 5pt;
      color: #9a9a9a;
      font-size: 6pt;
      line-height: 1;
    }

    .ew-show-trace .ew-reference-page-tag {
      display: block;
    }

    .ew-word-cloud-subtitle {
      position: absolute;
      left: 70pt;
      right: 70pt;
      top: 60pt;
      color: #000000;
      font-size: 12.3pt;
      line-height: 1.25;
      font-weight: 400;
      text-align: center;
    }

    .ew-word-cloud-image {
      position: absolute;
      left: 155pt;
      top: 119pt;
      width: 412.5pt;
      height: 218.5pt;
      object-fit: fill;
      border: 0;
    }

    .ew-competitor-divider .ew-divider-title {
      font-size: 34pt;
      line-height: 1.22;
    }

    .ew-competitor-evidence-page .ew-sheet,
    .ew-sov-page .ew-sheet {
      padding: 0;
    }

    .ew-competitor-title,
    .ew-sov-title {
      position: absolute;
      left: 24pt;
      right: 24pt;
      top: 23pt;
      margin: 0;
      color: var(--ew-magenta);
      font-size: 15.5pt;
      line-height: 1.1;
      font-weight: 700;
      text-align: center;
    }

    .ew-competitor-grid {
      position: absolute;
      left: 50pt;
      right: 42pt;
      top: 47pt;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      column-gap: 64pt;
      height: 285pt;
    }

    .ew-competitor-count-2 .ew-competitor-grid {
      left: 164pt;
      right: 142pt;
      grid-template-columns: repeat(2, 1fr);
      column-gap: 88pt;
    }

    .ew-competitor-column {
      position: relative;
      min-width: 0;
      height: 285pt;
      text-align: center;
    }

    .ew-competitor-logo {
      display: block;
      width: 47pt;
      height: 47pt;
      object-fit: contain;
      margin: 0 auto 6pt;
      border: 0;
    }

    .ew-competitor-item {
      position: absolute;
      left: 0;
      right: 0;
    }

    .ew-positive-item {
      top: 53pt;
    }

    .ew-negative-item {
      top: 171pt;
    }

    .ew-competitor-shot {
      display: block;
      width: 60pt;
      height: 62pt;
      object-fit: contain;
      margin: 0 auto;
      border: 1pt solid currentColor;
      background: #ffffff;
    }

    .ew-comp-gold .ew-competitor-shot { color: #ffae00; }
    .ew-comp-orange .ew-competitor-shot { color: #ff7000; }
    .ew-comp-red .ew-competitor-shot { color: #ef3d3f; }
    .ew-comp-cyan .ew-competitor-shot { color: #37aee2; }
    .ew-comp-navy .ew-competitor-shot { color: #243f8f; }

    .ew-competitor-meta {
      display: grid;
      grid-template-columns: 1fr 30pt;
      align-items: end;
      margin: 4pt auto 4pt;
      width: 110pt;
      color: #5b5b5b;
      font-size: 6.9pt;
      line-height: 1;
      font-weight: 700;
    }

    .ew-competitor-caption {
      min-height: 33pt;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6pt;
      padding: 4pt 7pt;
      color: #000000;
      font-size: 7.45pt;
      line-height: 1.08;
      font-weight: 400;
    }

    .ew-positive-caption {
      background: #d8ea25;
    }

    .ew-negative-caption {
      background: #f5cdcd;
    }

    .ew-comp-red .ew-positive-caption { background: #f34243; }
    .ew-comp-gold .ew-positive-caption { background: #ffb313; }
    .ew-comp-orange .ew-positive-caption { background: #ff780b; }
    .ew-comp-cyan .ew-positive-caption { background: #3ab3df; }
    .ew-comp-navy .ew-positive-caption { background: #233f90; color: #ffffff; }

    .ew-operator {
      position: absolute;
      left: -18pt;
      width: 12pt;
      height: 12pt;
      font-size: 18pt;
      line-height: 10pt;
      font-weight: 700;
      text-align: center;
    }

    .ew-plus {
      top: 132pt;
      color: var(--ew-lime);
    }

    .ew-minus {
      top: 256pt;
      color: #e00000;
    }

    .ew-sov-current-donut-chart {
      position: absolute;
      left: 25pt;
      top: 58pt;
      width: 286pt;
      height: 145pt;
      object-fit: contain;
      border: 0;
    }

    .ew-sov-current-line-chart {
      position: absolute;
      right: 16pt;
      top: 70pt;
      width: 333pt;
      height: 230pt;
      object-fit: contain;
      border: 0;
    }

    .ew-sov-peaks {
      position: absolute;
      left: 26pt;
      top: 222pt;
      width: 302pt;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 12pt;
    }

    .ew-sov-peak-image {
      display: block;
      width: 100%;
      height: 71pt;
      object-fit: fill;
      border: 0;
      background: #ffffff;
    }

    .ew-sov-peak-caption {
      margin-top: 6pt;
      height: 33pt;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4pt 8pt;
      color: #000000;
      background: var(--ew-lime);
      border-radius: 6pt;
      font-size: 7.5pt;
      line-height: 1.08;
      text-align: center;
    }

    .ew-sov-peaks-label {
      position: absolute;
      left: 161pt;
      top: 334pt;
      color: #666666;
      font-size: 6.8pt;
      line-height: 1;
      font-weight: 700;
    }

    .ew-sov-narrative {
      position: absolute;
      left: 17pt;
      top: 73pt;
      width: 157pt;
      color: #93a90b;
      font-size: 10.35pt;
      line-height: 1.28;
      font-weight: 700;
    }

    .ew-sov-comparison-grid {
      position: absolute;
      left: 198pt;
      top: 66pt;
      width: 462pt;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 38pt;
      row-gap: 13pt;
    }

    .ew-sov-comparison-image {
      display: block;
      width: 100%;
      height: 118pt;
      object-fit: contain;
      border: 0;
    }

    .ew-sov-comparison-label,
    .ew-sov-source-label {
      margin-top: 2pt;
      color: #666666;
      font-size: 12.2pt;
      line-height: 1.05;
      text-align: center;
      font-weight: 400;
    }

    .ew-sov-subtitle {
      position: absolute;
      left: 55pt;
      right: 55pt;
      top: 57pt;
      color: #93a90b;
      font-size: 11.1pt;
      line-height: 1.25;
      font-weight: 700;
      text-align: center;
    }

    .ew-sov-source-chart {
      position: absolute;
      left: 69pt;
      top: 112pt;
      width: 590.5pt;
      height: 225.5pt;
      object-fit: fill;
      border: 0;
    }

    .ew-sov-source-comparison .ew-sov-subtitle {
      top: 55pt;
      font-size: 10.75pt;
    }

    .ew-sov-source-grid {
      position: absolute;
      left: 72pt;
      top: 117pt;
      width: 568pt;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 67pt;
      row-gap: 8pt;
    }

    .ew-sov-source-comparison-image {
      display: block;
      width: 100%;
      height: 95pt;
      object-fit: fill;
      border: 0;
    }

    .ew-reference-sheet-page .ew-sheet {
      padding: 0;
    }

    .ew-reference-sheet-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    .ew-final-divider .ew-divider-title {
      font-size: 34pt;
      line-height: 1.22;
    }

    .ew-final-text-page .ew-sheet {
      padding: 26pt 45pt 24pt 37pt;
    }

    .ew-final-title {
      margin: 0 0 18pt;
      color: var(--ew-magenta);
      font-size: 18pt;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: 0;
    }

    .ew-final-list {
      color: #4f4f4f;
      font-size: 9.25pt;
      line-height: 1.26;
      font-weight: 400;
    }

    .ew-numbered-final-list {
      display: grid;
      grid-template-columns: 31pt 1fr;
      column-gap: 8pt;
      row-gap: 3.2pt;
    }

    .ew-final-num {
      text-align: right;
      padding-right: 12pt;
      font-weight: 700;
    }

    .ew-final-copy {
      min-width: 0;
    }

    .ew-final-subitems {
      margin: 4pt 0 0 25pt;
      padding: 0;
      list-style: circle;
    }

    .ew-final-subitems li {
      margin: 0 0 4pt;
      padding-left: 4pt;
    }

    .ew-final-overflow-flag {
      display: inline-block;
      margin-top: 3pt;
      padding: 2pt 5pt;
      color: #7a0028;
      background: #ffe9ef;
      border: 0.75pt solid #d00046;
      border-radius: 4pt;
      font-size: 6.8pt;
      line-height: 1.15;
      font-weight: 700;
    }

    .ew-recommendations-page .ew-sheet {
      padding: 45pt 51pt 28pt 55pt;
    }

    .ew-recommendations-page .ew-final-title {
      margin-bottom: 20pt;
      font-size: 18pt;
    }

    .ew-recommendation-list {
      margin: 0;
      padding: 0 0 0 26pt;
      color: #4d4d4d;
      font-size: 9.75pt;
      line-height: 1.27;
      font-weight: 400;
    }

    .ew-recommendation-list li {
      margin: 0 0 13pt;
      padding-left: 17pt;
    }

    .ew-recommendation-list li::marker {
      font-size: 11pt;
      color: #4d4d4d;
    }

    .ew-validation-page .ew-sheet {
      padding: 31pt 42pt 28pt;
    }

    .ew-validation-title {
      margin: 0;
      color: var(--ew-magenta);
      font-size: 18pt;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: 0;
    }

    .ew-validation-subtitle {
      margin-top: 7pt;
      color: #7a0028;
      font-size: 9.5pt;
      line-height: 1.25;
      font-weight: 700;
    }

    .ew-validation-list {
      display: grid;
      grid-template-columns: 1fr;
      row-gap: 6pt;
      margin-top: 14pt;
    }

    .ew-validation-item {
      padding: 7pt 9pt;
      border: 1pt solid #d00046;
      border-radius: 5pt;
      background: #fff3f7;
    }

    .ew-validation-code {
      color: #7a0028;
      font-size: 8.4pt;
      line-height: 1.15;
      font-weight: 700;
    }

    .ew-validation-message {
      margin-top: 2pt;
      color: #333333;
      font-size: 8.2pt;
      line-height: 1.22;
    }

    .ew-validation-meta {
      margin-top: 2pt;
      color: #777777;
      font-size: 6.8pt;
      line-height: 1.1;
    }
  </style>
</head>
<body class="${[showTraceLabels ? 'ew-show-trace' : '', showPageNumbers ? 'ew-show-page-numbers' : ''].filter(Boolean).join(' ')}">
  <main class="ew-proof">
    <section class="ew-page ew-cover" aria-label="Cover">
      <div class="ew-sheet">
        ${clientLogo ? `<img class="ew-client-logo" src="${clientLogo}" alt="${escapeHtml(report.clientLogoAlt)}" />` : `<div class="ew-client-logo ew-missing-asset">${escapeHtml(report.clientLogoAlt)}</div>`}
        <h1 class="ew-cover-title">${escapeHtml(report.cover.title)}</h1>
        <div class="ew-cover-period">${escapeHtml(report.cover.period)}</div>
        <div class="ew-prepared-by">${escapeHtml(report.cover.preparedBy)}</div>
        ${preparedByLogo ? `<img class="ew-prepared-logo" src="${preparedByLogo}" alt="${escapeHtml(report.preparedByLogoAlt)}" />` : `<div class="ew-prepared-logo ew-missing-asset">${escapeHtml(report.preparedByLogoAlt)}</div>`}
      </div>
    </section>

    <section class="ew-page ew-divider" aria-label="Sentiment score report title">
      <div class="ew-sheet">
        <h2 class="ew-divider-title">${escapeHtml(report.sectionTitle)}</h2>
      </div>
    </section>

    <section class="ew-page ew-summary" aria-label="Previous report summary">
      <div class="ew-sheet">
        <h2 class="ew-summary-title">${escapeHtml(report.previousReportSummary.title)}</h2>
        <div class="ew-summary-list">
          ${report.previousReportSummary.items.map((item, index) => `
            <div class="ew-summary-num">${index + 1}.</div>
            <div class="ew-summary-text">
              ${paragraphWithLead(item)}
              ${item.subitems?.length ? `<ul class="ew-subitems">${item.subitems.map(subitem => `<li>${escapeHtml(subitem)}</li>`).join('')}</ul>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    ${report.metricsPages.map(page => metricsPage(page, assets)).join('')}
    ${sentimentPage(report.sentimentPage)}
    ${report.evidencePages.map(page => evidencePage(page, assets)).join('')}
    ${wordCloudPage(report.wordCloudPage, assets)}
    ${report.competitorAndSovPages.map(page => competitorAndSovPage(page, assets)).join('')}
    ${report.finalPages.map(page => finalPage(page, report, assets)).join('')}
    ${validationIssuesPages(validationIssues)}
  </main>
</body>
</html>`;
}
