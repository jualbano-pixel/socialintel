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

function documentHtml({ title, reportHtml }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #080808; color: #f0f0f0; font-family: 'DM Sans', Arial, sans-serif; }
    body { width: 100%; }
    a { color: inherit; text-decoration: none; }
    button, input, textarea { font-family: inherit; }
    button { pointer-events: none; }
    [data-pdf-hidden="true"] { display: none !important; }
    .pdf-shell { background: #080808; padding: 28px 18px; }
    .pdf-shell > * { max-width: 960px !important; margin-left: auto !important; margin-right: auto !important; }
    @page { size: A4; margin: 12mm; }
    @media print {
      html, body { background: #080808 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
    await page.setContent(documentHtml({ title, reportHtml }), { waitUntil: 'networkidle0', timeout: 30000 });
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
