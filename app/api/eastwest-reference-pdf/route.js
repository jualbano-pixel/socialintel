import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  EASTWEST_REFERENCE_TITLE,
  eastWestReferenceDocumentHtml,
} from '../../../lib/pdf-templates/eastwest-reference/template.mjs';
import { B24_BROAD_MEASUREMENT_MANIFEST_2026_08_31 } from '../../../lib/pdf-templates/eastwest-reference/b24-broad-measurement-manifest-2026-08-31.mjs';
import { adaptSignalIntelToEastWestProductionContract } from '../../../lib/pdf-templates/eastwest-reference/production-adapter.mjs';
import { eastWestProductionPreviewHtml } from '../../../lib/pdf-templates/eastwest-reference/production-preview-template.mjs';
import { buildEastWestReadinessInventory, eastWestCollectionChecklist } from '../../../lib/pdf-templates/eastwest-reference/production-readiness.mjs';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function sanitizeFilename(name = 'eastwest-reference-layout-proof') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eastwest-reference-layout-proof';
}

function assetDataUri(relativePath, mimeType = 'image/png') {
  const absolutePath = join(process.cwd(), 'public', relativePath);
  if (!existsSync(absolutePath)) return '';
  return `data:${mimeType};base64,${readFileSync(absolutePath).toString('base64')}`;
}

function eastWestReferenceAssets() {
  return {
    clientLogoDataUri: assetDataUri('eastwest-reference/eastwest-logo-reference.png'),
    preparedByLogoDataUri: assetDataUri('eastwest-reference/praxis-logo-reference.png'),
    mentionsMain: assetDataUri('eastwest-reference/mentions-main-chart-reference.png'),
    mentionsPreviousWeek: assetDataUri('eastwest-reference/mentions-prev-week-chart-reference.png'),
    mentionsPreviousMonth: assetDataUri('eastwest-reference/mentions-prev-month-chart-reference.png'),
    sourceMain: assetDataUri('eastwest-reference/source-main-chart-reference.png'),
    sourcePreviousWeek: assetDataUri('eastwest-reference/source-prev-week-chart-reference.png'),
    sourcePreviousMonth: assetDataUri('eastwest-reference/source-prev-month-chart-reference.png'),
    reachMain: assetDataUri('eastwest-reference/reach-main-chart-reference.png'),
    reachPreviousWeek: assetDataUri('eastwest-reference/reach-prev-week-chart-reference.png'),
    reachPreviousMonth: assetDataUri('eastwest-reference/reach-prev-month-chart-reference.png'),
    positiveDreamRun: assetDataUri('eastwest-reference/positive-dream-run-reference.png'),
    positiveHotDeals: assetDataUri('eastwest-reference/positive-hot-deals-reference.png'),
    positiveAwards: assetDataUri('eastwest-reference/positive-awards-reference.png'),
    positiveRetirement: assetDataUri('eastwest-reference/positive-retirement-reference.png'),
    negativeScamText: assetDataUri('eastwest-reference/negative-scam-text-reference.png'),
    negativeCustomerService: assetDataUri('eastwest-reference/negative-customer-service-reference.png'),
    negativeCardHold: assetDataUri('eastwest-reference/negative-card-hold-reference.png'),
    negativeUnauthorized: assetDataUri('eastwest-reference/negative-unauthorized-reference.png'),
    neutralPlatinum: assetDataUri('eastwest-reference/neutral-platinum-reference.png'),
    neutralBills: assetDataUri('eastwest-reference/neutral-bills-reference.png'),
    wordCloud: assetDataUri('eastwest-reference/word-cloud-reference.png'),
    page13Sheet: assetDataUri('eastwest-reference/page-13-sheet-reference.png'),
    page14Sheet: assetDataUri('eastwest-reference/page-14-sheet-reference.png'),
    page15Sheet: assetDataUri('eastwest-reference/page-15-sheet-reference.png'),
    page16Sheet: assetDataUri('eastwest-reference/page-16-sheet-reference.png'),
    page17Sheet: assetDataUri('eastwest-reference/page-17-sheet-reference.png'),
    page18Sheet: assetDataUri('eastwest-reference/page-18-sheet-reference.png'),
    compBpiLogo: assetDataUri('eastwest-reference/comp-bpi-logo-reference.png'),
    compBdoLogo: assetDataUri('eastwest-reference/comp-bdo-logo-reference.png'),
    compUnionbankLogo: assetDataUri('eastwest-reference/comp-unionbank-logo-reference.png'),
    compSecurityLogo: assetDataUri('eastwest-reference/comp-security-logo-reference.png'),
    compMetrobankLogo: assetDataUri('eastwest-reference/comp-metrobank-logo-reference.png'),
    compBpiPositive: assetDataUri('eastwest-reference/comp-bpi-positive-reference.png'),
    compBpiNegative: assetDataUri('eastwest-reference/comp-bpi-negative-reference.png'),
    compBdoPositive: assetDataUri('eastwest-reference/comp-bdo-positive-reference.png'),
    compBdoNegative: assetDataUri('eastwest-reference/comp-bdo-negative-reference.png'),
    compUnionbankPositive: assetDataUri('eastwest-reference/comp-ub-positive-reference.png'),
    compUnionbankNegative: assetDataUri('eastwest-reference/comp-ub-negative-reference.png'),
    compSecurityPositive: assetDataUri('eastwest-reference/comp-security-positive-reference.png'),
    compSecurityNegative: assetDataUri('eastwest-reference/comp-security-negative-reference.png'),
    compMetrobankPositive: assetDataUri('eastwest-reference/comp-metrobank-positive-reference.png'),
    compMetrobankNegative: assetDataUri('eastwest-reference/comp-metrobank-negative-reference.png'),
    sovMentionsDonutCurrent: assetDataUri('eastwest-reference/sov-mentions-donut-current-reference.png'),
    sovMentionsLineCurrent: assetDataUri('eastwest-reference/sov-mentions-line-current-reference.png'),
    sovMentionsPeaksBdo: assetDataUri('eastwest-reference/sov-mentions-peaks-bdo-reference.png'),
    sovMentionsPeaksMetrobank: assetDataUri('eastwest-reference/sov-mentions-peaks-metrobank-reference.png'),
    sovMentionsCompareCurrent: assetDataUri('eastwest-reference/sov-mentions-compare-current-reference.png'),
    sovMentionsComparePrevMonth: assetDataUri('eastwest-reference/sov-mentions-compare-prev-month-reference.png'),
    sovMentionsComparePrevWeek: assetDataUri('eastwest-reference/sov-mentions-compare-prev-week-reference.png'),
    sovMentionsCompareYtd: assetDataUri('eastwest-reference/sov-mentions-compare-ytd-reference.png'),
    sovSourceCurrent: assetDataUri('eastwest-reference/sov-source-current-reference.png'),
    sovSourceCompareCurrent: assetDataUri('eastwest-reference/sov-source-compare-current-reference.png'),
    sovSourceComparePrevMonth: assetDataUri('eastwest-reference/sov-source-compare-prev-month-reference.png'),
    sovSourceComparePrevWeek: assetDataUri('eastwest-reference/sov-source-compare-prev-week-reference.png'),
    sovSourceCompareYtd: assetDataUri('eastwest-reference/sov-source-compare-ytd-reference.png'),
  };
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

async function renderLandscapePdf(html) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: process.platform === 'darwin' ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args,
      defaultViewport: { width: 1440, height: 810 },
      executablePath: await getExecutablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]));
    return await page.pdf({
      width: '10in',
      height: '5.625in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    if (browser) await browser.close();
  }
}

export async function GET() {
  try {
    const pdf = await renderLandscapePdf(eastWestReferenceDocumentHtml({
      assets: eastWestReferenceAssets(),
    }));

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(EASTWEST_REFERENCE_TITLE)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('eastwest-reference-pdf error:', error);
    return Response.json({ error: error.message || 'Failed to export EastWest reference PDF' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { title = 'EastWest Production Preview', reportInput } = await request.json();
    if (!reportInput || typeof reportInput !== 'object') {
      return Response.json({ error: 'reportInput is required' }, { status: 400 });
    }
    const contract = adaptSignalIntelToEastWestProductionContract({
      ...reportInput,
      measurementManifest: B24_BROAD_MEASUREMENT_MANIFEST_2026_08_31,
    });
    const inventory = buildEastWestReadinessInventory(contract);
    const checklist = eastWestCollectionChecklist(inventory);
    const pdf = await renderLandscapePdf(eastWestProductionPreviewHtml({
      contract,
      inventory,
      checklist,
      includeDiagnostics: true,
    }));
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(title)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('eastwest-production-pdf error:', error);
    return Response.json({ error: error.message || 'Failed to export EastWest production preview' }, { status: 500 });
  }
}
