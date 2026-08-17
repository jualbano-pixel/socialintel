import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sanitizeFilename(name = 'signal-intel-report') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'signal-intel-report';
}

const LIGHT_THEME_CSS = `
    :root, [data-theme="light"] {
      --bg-primary: #FAF9F6;
      --bg-surface: #FFFFFF;
      --bg-surface-muted: #F1EFE8;
      --bg-surface-subtle: #F7F5EF;
      --bg-input: #FFFFFF;
      --bg-panel-live: #EFF7F1;
      --bg-panel-positive: #EAF7EF;
      --bg-panel-negative: #FCEDEE;
      --bg-panel-warning: #FFF7E3;
      --bg-overlay: #16150F66;
      --text-primary: #16150F;
      --text-secondary: #4E4C45;
      --text-muted: #6B6A62;
      --text-faint: #908E84;
      --text-inverse: #FFFFFF;
      --text-on-accent: #FFFFFF;
      --border: #E2E0D9;
      --border-strong: #CBC7BA;
      --border-subtle: #ECE9E1;
      --accent-live: #146C43;
      --accent-live-strong: #0F5132;
      --accent-live-soft: #DDEEE4;
      --accent-live-softer: #EEF7F1;
      --accent-live-border: #9DCBB1;
      --accent-positive: #146C43;
      --accent-positive-strong: #0F5132;
      --accent-positive-soft: #DDEEE4;
      --accent-highlight: #9A6A00;
      --accent-highlight-soft: #FFF1C9;
      --accent-highlight-border: #D4B565;
      --accent-negative: #B4232E;
      --accent-negative-soft: #F8D7DA;
      --accent-negative-border: #E5A4AA;
      --accent-info: #1B5E8A;
      --accent-info-soft: #E5F2FA;
      --accent-info-border: #9EC8DF;
      --accent-warning: #A45B12;
      --shadow-accent: 0 8px 24px rgba(20, 108, 67, 0.16);
      --focus-ring: #146C43;
      --chart-blue: #2563A8;
      --chart-pink: #AD2F7F;
      --chart-red: #B9473F;
      --chart-rose: #B84B79;
      --chart-teal: #2F7D7B;
      --chart-purple: #6A55B8;
      --chart-gold: #A77A00;
      --chart-cyan: #327D90;
      --chart-green: #148A62;
      --chart-orange: #B85A13;
      --chart-neutral: #8A877E;
    }
`;

function documentHtml({ title, reportHtml }) {
  return `<!doctype html>
<html data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
${LIGHT_THEME_CSS}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg-primary); color: var(--text-primary); font-family: 'DM Sans', Arial, sans-serif; }
    body { width: 100%; }
    a { color: inherit; text-decoration: none; }
    button, input, textarea { font-family: inherit; }
    button { pointer-events: none; }
    [data-pdf-hidden="true"] { display: none !important; }
    .pdf-shell { background: var(--bg-primary); padding: 28px 18px; }
    .pdf-shell > * { max-width: 960px !important; margin-left: auto !important; margin-right: auto !important; }
    @page { size: A4; margin: 12mm; }
    @media print {
      html, body { background: var(--bg-primary) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pdf-shell { padding: 0 !important; }
      div, p, h1, h2, h3, h4, span { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="pdf-shell">${reportHtml}</main>
</body>
</html>`;
}

async function getExecutablePath() {
  const localPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (process.platform === 'darwin') {
    const localPath = localPaths.find(path => existsSync(path));
    if (localPath) return localPath;
  }
  return chromium.executablePath();
}

export async function POST(request) {
  let browser;
  try {
    const { title = 'Signal Intel Report', reportHtml } = await request.json();
    if (!reportHtml || typeof reportHtml !== 'string') {
      return Response.json({ error: 'reportHtml is required' }, { status: 400 });
    }

    browser = await puppeteer.launch({
      args: process.platform === 'darwin' ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath: await getExecutablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(documentHtml({ title, reportHtml }), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]));
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(title)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('export-pdf error:', error);
    return Response.json({ error: error.message || 'Failed to export PDF' }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
