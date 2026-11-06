import { createSignalIntelReport, buildSignalIntelSafetyInventory } from '../lib/pdf-templates/shared/signal-intel-report.mjs';
import { resolveStandardModules } from '../lib/pdf-templates/shared/module-descriptors.mjs';
import { STANDARD_SYNTHETIC_FIXTURE } from '../lib/pdf-templates/standard/synthetic-fixture.mjs';
import { standardProductionPreviewHtml } from '../lib/pdf-templates/standard/template.mjs';

const report = createSignalIntelReport(STANDARD_SYNTHETIC_FIXTURE);
const inventory = buildSignalIntelSafetyInventory(report);
const modules = resolveStandardModules(report);
const html = standardProductionPreviewHtml({ report, inventory });
let clientExportBlocked = false;
try { standardProductionPreviewHtml({ report, inventory, includeDiagnostics: false, renderMode: 'client' }); } catch (error) { clientExportBlocked = error.message.startsWith('Signal Intel client export blocked:'); }

const moduleIds = modules.map(module => module.moduleId);
const checks = {
  neutralSchema: report.schemaVersion === 'signal-intel-report-v1',
  neutralFixture: report.reportingContext.clientName === 'Sample Brand' && report.reportingContext.provenance.dataSources[0].extra.containsClientData === false,
  noClientNames: !/eastwest|bdo|bpi|metrobank|unionbank|security bank/i.test(JSON.stringify(report)),
  requiredModulesPresent: ['overview', 'mentions', 'sources', 'reach', 'sentiment', 'evidence', 'findings', 'recommendations'].every(id => moduleIds.includes(id)),
  standardBrandingIsNeutral: html.includes('SIGNAL</b> INTEL') && html.includes('PRAXIS EXPERIENTIAL'),
  syntheticMetricsRendered: html.includes('<span>Mentions</span><b>1,200</b>') && html.includes('<span>Reach</span><b>2.45M</b>'),
  invalidClientExportBlocked: clientExportBlocked,
  previewMarkedNonDistributable: html.includes('Not for client distribution') && html.includes('INTERNAL REVIEW PREVIEW'),
};

console.log(JSON.stringify({ checks, moduleIds, summary: inventory.summary }, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
