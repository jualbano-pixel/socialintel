import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSignalIntelReport, buildSignalIntelSafetyInventory } from '../lib/pdf-templates/shared/signal-intel-report.mjs';
import { resolveStandardModules } from '../lib/pdf-templates/shared/module-descriptors.mjs';
import { STANDARD_SYNTHETIC_FIXTURE } from '../lib/pdf-templates/standard/synthetic-fixture.mjs';
import { standardProductionPreviewHtml } from '../lib/pdf-templates/standard/template.mjs';

const outputDir = join(process.cwd(), 'output/pdf');
const readinessDir = join(process.cwd(), 'output/readiness');
const pdfPath = join(outputDir, 'signal-intel-standard-preview.pdf');
const inventoryPath = join(readinessDir, 'signal-intel-standard-preview.json');

async function loadReport() {
  const localPath = process.env.STANDARD_REPORT_FIXTURE;
  if (!localPath) return createSignalIntelReport(STANDARD_SYNTHETIC_FIXTURE);
  const absolutePath = isAbsolute(localPath) ? localPath : join(process.cwd(), localPath);
  const fixtureModule = await import(pathToFileURL(absolutePath));
  const fixture = fixtureModule.STANDARD_REPORT_FIXTURE || fixtureModule.default || fixtureModule.EASTWEST_REAL_OUTPUT_FIXTURE;
  if (!fixture) throw new Error('Local fixture must export STANDARD_REPORT_FIXTURE, default, or EASTWEST_REAL_OUTPUT_FIXTURE.');
  if (fixture.schemaVersion === 'signal-intel-report-v1') return createSignalIntelReport(fixture);
  const { adaptSignalIntelToReport } = await import('../lib/pdf-templates/eastwest-reference/production-adapter.mjs');
  return createSignalIntelReport(adaptSignalIntelToReport(fixture));
}

const executablePath = () => ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(path => existsSync(path));
const report = await loadReport();
const inventory = buildSignalIntelSafetyInventory(report);
const modules = resolveStandardModules(report);
mkdirSync(outputDir, { recursive: true });
mkdirSync(readinessDir, { recursive: true });
writeFileSync(inventoryPath, `${JSON.stringify({ reportSchemaVersion: report.schemaVersion, source: report.reportingContext.provenance.dataSources[0], modules, inventory }, null, 2)}\n`);

const browser = await puppeteer.launch({ args: process.platform === 'darwin' ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args, defaultViewport: { width: 1440, height: 810 }, executablePath: executablePath() || await chromium.executablePath(), headless: true });
try {
  const browserPage = await browser.newPage();
  await browserPage.setJavaScriptEnabled(false);
  await browserPage.setContent(standardProductionPreviewHtml({ report, inventory }), { waitUntil: 'networkidle0', timeout: 30000 });
  await browserPage.evaluate(() => document.fonts.ready);
  await browserPage.pdf({ path: pdfPath, width: '10in', height: '5.625in', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
} finally { await browser.close(); }

console.log(JSON.stringify({ fixture: process.env.STANDARD_REPORT_FIXTURE || 'neutral synthetic default', pdfPath, inventoryPath, pageModules: modules.map(module => module.moduleId), summary: inventory.summary }, null, 2));
