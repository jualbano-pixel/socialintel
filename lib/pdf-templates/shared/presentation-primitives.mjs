export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export const formatNumber = value => value === null || value === undefined || value === ''
  ? 'Unavailable'
  : Number(value).toLocaleString('en-US');

export function displayMetric(record) {
  if (record?.displayValue) return record.displayValue;
  if (record?.value === null || record?.value === undefined || record?.value === '') return 'Unavailable';
  return typeof record.value === 'number' ? formatNumber(record.value) : String(record.value);
}

export const stateLabel = state => ({
  verified: 'Verified',
  unavailable: 'Unavailable',
  awaiting_verification: 'Awaiting verification',
  pending_verification: 'Pending verification',
  not_applicable: 'Not applicable',
}[state] || String(state || 'Unavailable').replaceAll('_', ' '));

export function statePill(state, detail = '') {
  return `<span class="state-pill state-${escapeHtml(state || 'unavailable')}">${escapeHtml(detail || stateLabel(state))}</span>`;
}

export function missingState(title, detail, state = 'unavailable') {
  return `<div class="missing-state"><div>${statePill(state)}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function chunk(items = [], size = 1) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function balancedChunks(items = [], maximum = 1) {
  if (!items.length) return [];
  const pageCount = Math.ceil(items.length / maximum);
  const minimum = Math.floor(items.length / pageCount);
  let remainder = items.length % pageCount;
  let cursor = 0;
  return Array.from({ length: pageCount }, () => {
    const size = minimum + (remainder-- > 0 ? 1 : 0);
    const result = items.slice(cursor, cursor + size);
    cursor += size;
    return result;
  });
}

export function rankedBars(items = [], { value = item => item.rawCount?.value ?? item.percentage?.value, label = item => item.name, suffix = '' } = {}) {
  const available = items.map(item => ({ item, numeric: Number(value(item)) })).filter(row => Number.isFinite(row.numeric));
  if (!available.length) return '';
  const max = Math.max(...available.map(row => row.numeric), 1);
  return `<div class="ranked-bars">${available.map(({ item, numeric }, index) => `<div class="ranked-row"><span class="rank">${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(label(item))}</strong><i><b style="width:${Math.max(2, numeric / max * 100)}%"></b></i><span class="bar-value">${escapeHtml(numeric)}${escapeHtml(suffix)}</span></div>`).join('')}</div>`;
}

export function sentimentDonut(sentiment) {
  const positive = sentiment?.positive?.percentage?.value;
  const negative = sentiment?.negative?.percentage?.value;
  const neutral = sentiment?.neutral?.percentage?.value;
  if (![positive, negative, neutral].every(value => Number.isFinite(Number(value)))) return '';
  const positiveEnd = Number(positive);
  const negativeEnd = positiveEnd + Number(negative);
  return `<div class="sentiment-visual"><div class="donut" style="background:conic-gradient(var(--positive) 0 ${positiveEnd}%,var(--negative) ${positiveEnd}% ${negativeEnd}%,var(--neutral) ${negativeEnd}% 100%)"><span><b>${escapeHtml(neutral)}%</b><small>neutral</small></span></div><div class="sentiment-legend">${[
    ['positive', positive, sentiment.positive.count],
    ['negative', negative, sentiment.negative.count],
    ['neutral', neutral, sentiment.neutral.count],
  ].map(([tone, percent, count]) => `<div><i class="${tone}"></i><span>${tone}</span><b>${escapeHtml(percent)}%</b><small>${escapeHtml(displayMetric(count))} mentions</small></div>`).join('')}</div></div>`;
}

export function lineChart(series, { color = 'var(--chart-blue)' } = {}) {
  const points = (series?.points || []).filter(point => Number.isFinite(Number(point.value)));
  if (points.length < 2) return '';
  const width = 560;
  const height = 190;
  const pad = 24;
  const max = Math.max(...points.map(point => Number(point.value)), 1);
  const min = Math.min(...points.map(point => Number(point.value)), 0);
  const span = Math.max(max - min, 1);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: pad + index * ((width - pad * 2) / (points.length - 1)),
    y: height - pad - ((Number(point.value) - min) / span) * (height - pad * 2),
  }));
  const path = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily trend">${[0, 1, 2, 3].map(index => `<line x1="${pad}" y1="${pad + index * 45}" x2="${width - pad}" y2="${pad + index * 45}" class="grid-line"/>`).join('')}<path d="${path}" style="stroke:${color}" class="trend-line"/>${coordinates.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4"/><text x="${point.x}" y="${height - 6}" text-anchor="middle">${escapeHtml(String(point.date || '').slice(5))}</text>`).join('')}</svg>`;
}

