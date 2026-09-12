export const CONTENT_STATES = {
  verified: 'verified',
  unavailable: 'unavailable',
  notApplicable: 'not_applicable',
  awaitingVerification: 'awaiting_verification',
};

const VALID_DATA_STATES = new Set([
  ...Object.values(CONTENT_STATES),
  'approved_image_fallback',
  'approved_image_fallback_raw_daily_series_unavailable',
  'approved_image_fallback_raw_daily_source_series_unavailable',
  'approved_image_fallback_raw_daily_reach_series_unavailable',
]);

export const EASTWEST_VALIDATION_LIMITS = {
  evidenceCaptionChars: 280,
  summaryItemChars: 720,
  recommendationItemChars: 760,
};

function issue({ code, severity = 'error', referencePage, section, itemId, message }) {
  return { code, severity, referencePage, section, itemId, message };
}

function textLength(...parts) {
  return parts.filter(Boolean).join(' ').trim().length;
}

function validateState(value, path, issues) {
  if (!value) return;
  if (!VALID_DATA_STATES.has(value)) {
    issues.push(issue({
      code: 'invalid-state',
      section: path,
      message: `${path} uses unsupported state "${value}".`,
    }));
  }
}

export function validateEastWestProductionReport(report, {
  limits = EASTWEST_VALIDATION_LIMITS,
  requireVerifiedProductionData = false,
} = {}) {
  const issues = [];

  const context = report?.reportingContext;
  const periods = context?.reportingPeriods;
  if (requireVerifiedProductionData) {
    ['current', 'previousWeek', 'previousFullMonth', 'ytd'].forEach(key => {
      if (!periods?.[key]?.label || !periods?.[key]?.startDate || !periods?.[key]?.endDate) {
        issues.push(issue({
          code: 'missing-reporting-period',
          section: 'reportingContext.reportingPeriods',
          itemId: key,
          message: `Missing explicit ${key} reporting period label, startDate, or endDate.`,
        }));
      }
    });
  }

  report?.metricsPages?.forEach(page => {
    Object.entries(page.charts || {}).forEach(([periodKey, chart]) => {
      validateState(chart.dataState, `metricsPages.${page.kind}.charts.${periodKey}.dataState`, issues);
      if (requireVerifiedProductionData && chart.dataState !== CONTENT_STATES.verified && !chart.fallbackAsset) {
        issues.push(issue({
          code: 'missing-chart-data',
          referencePage: page.referencePage,
          section: `metricsPages.${page.kind}`,
          itemId: periodKey,
          message: `Chart for ${page.kind} ${periodKey} is not verified and has no approved fallback asset.`,
        }));
      }
    });
  });

  report?.evidencePages?.forEach(page => {
    page.cards?.forEach((card, index) => {
      const length = textLength(card.text);
      if (length > limits.evidenceCaptionChars && card.continuationStrategy !== 'captionContinuation') {
        issues.push(issue({
          code: 'oversized-evidence-caption',
          referencePage: page.referencePage,
          section: `evidencePages.${page.tone}`,
          itemId: card.id || `${page.tone}-card-${index + 1}`,
          message: `Evidence caption is ${length} characters; max fixed-card capacity is ${limits.evidenceCaptionChars}. Add captionContinuation or block client export.`,
        }));
      }
      if (requireVerifiedProductionData && !card.link) {
        issues.push(issue({
          code: 'missing-evidence-source-url',
          referencePage: page.referencePage,
          section: `evidencePages.${page.tone}`,
          itemId: card.id || `${page.tone}-card-${index + 1}`,
          message: 'Evidence item is missing a source URL.',
        }));
      }
    });
  });

  report?.competitorAndSovPages?.forEach(page => {
    if (page.type === 'competitorEvidence') {
      page.competitors?.forEach((competitor, competitorIndex) => {
        ['positiveEvidence', 'negativeEvidence'].forEach(kind => {
          const item = competitor[kind];
          if (!item) return;
          const length = textLength(item.caption);
          if (length > limits.evidenceCaptionChars && item.continuationStrategy !== 'captionContinuation') {
            issues.push(issue({
              code: 'oversized-competitor-caption',
              referencePage: page.referencePage,
              section: 'competitorEvidence',
              itemId: `${competitor.name || `competitor-${competitorIndex + 1}`}.${kind}`,
              message: `Competitor evidence caption is ${length} characters; max fixed-card capacity is ${limits.evidenceCaptionChars}. Add captionContinuation or block client export.`,
            }));
          }
        });
      });
    }
    if (page.chartDataState) validateState(page.chartDataState, `competitorAndSovPages.${page.type}.chartDataState`, issues);
  });

  report?.finalPages?.forEach(page => {
    if (page.type === 'reportSummary') {
      page.items?.forEach((item, index) => {
        const length = textLength(item.lead, item.body, ...(item.subitems || []));
        if (length > limits.summaryItemChars && item.continuationStrategy !== 'itemContinuation') {
          issues.push(issue({
            code: 'oversized-summary-item',
            referencePage: page.referencePage,
            section: 'reportSummary',
            itemId: item.id || `summary-${index + 1}`,
            message: `Summary item is ${length} characters; max single-item capacity is ${limits.summaryItemChars}. Add itemContinuation or block client export.`,
          }));
        }
      });
    }
    if (page.type === 'recommendations') {
      page.items?.forEach((item, index) => {
        const length = textLength(item.lead, item.body);
        if (length > limits.recommendationItemChars && item.continuationStrategy !== 'itemContinuation') {
          issues.push(issue({
            code: 'oversized-recommendation-item',
            referencePage: page.referencePage,
            section: 'recommendations',
            itemId: item.id || `recommendation-${index + 1}`,
            message: `Recommendation item is ${length} characters; max single-item capacity is ${limits.recommendationItemChars}. Add itemContinuation or block client export.`,
          }));
        }
      });
    }
  });

  return {
    ok: !issues.some(item => item.severity === 'error'),
    issues,
  };
}

export function assertEastWestClientExportable(report, options = {}) {
  const result = validateEastWestProductionReport(report, {
    ...options,
    requireVerifiedProductionData: true,
  });
  if (!result.ok) {
    const detail = result.issues.map(item => `${item.code}${item.itemId ? `:${item.itemId}` : ''}`).join(', ');
    const error = new Error(`EastWest client export blocked: ${detail}`);
    error.validation = result;
    throw error;
  }
  return result;
}
