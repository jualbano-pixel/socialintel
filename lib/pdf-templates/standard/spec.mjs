export const STANDARD_TEMPLATE_ID = 'signal-intel-standard-v1';

export const STANDARD_PAGE = {
  widthPt: 720,
  heightPt: 405,
  aspectRatio: '16:9',
  printCss: '@page { size: 720pt 405pt; margin: 0; }',
};

export const STANDARD_TOKENS = {
  colors: {
    page: '#FAF9F6', surface: '#FFFFFF', mutedSurface: '#F1EFE8', text: '#16150F', secondaryText: '#4E4C45', border: '#E2E0D9',
    live: '#146C43', positive: '#146C43', negative: '#B4232E', neutral: '#8A877E', info: '#1B5E8A', warning: '#A45B12',
    charts: ['#2563A8', '#AD2F7F', '#B9473F', '#B84B79', '#2F7D7B', '#6A55B8', '#A77A00', '#327D90', '#148A62', '#B85A13'],
  },
  fonts: {
    body: "'DM Sans', Arial, sans-serif",
    display: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
  },
  type: { bodyPt: 10.5, bodyLineHeight: 1.42, minimumPt: 9 },
};

export const STANDARD_TEMPLATE_SPEC = {
  templateId: STANDARD_TEMPLATE_ID,
  page: STANDARD_PAGE,
  optionalModulesOmitWhenEmpty: true,
  preserveWholeCharts: true,
  dynamicPageNumbers: true,
  diagnosticsDefault: true,
  clientExportRequiresValidation: true,
};

