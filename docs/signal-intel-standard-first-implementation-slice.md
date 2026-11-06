# Signal Intel Standard: First Implementation Slice

## Status

Implemented a non-distributable Standard PDF preview from the existing real EastWest Signal Intel output fixture for August 31-September 6, 2026. No upstream acquisition, calculation, agent, dashboard, standard export, or live export path changed.

The Standard preview is 26 pages. Its client-presentation sequence is 22 pages; four clearly separated internal-review appendix pages carry readiness and export-blocker diagnostics.

## Changed Files

- `lib/pdf-templates/eastwest-reference/production-adapter.mjs`: extracted one private mapping core and added a neutral `adaptSignalIntelToReport` export. The existing EastWest export remains a wrapper with its original `eastwest-landscape-v1` schema version.
- `lib/pdf-templates/shared/signal-intel-report.mjs`: neutral contract, safety-inventory, and client-export gate aliases over the existing implementation.
- `lib/pdf-templates/shared/module-descriptors.mjs`: template-neutral module descriptors and Standard optional-module resolution.
- `lib/pdf-templates/shared/presentation-primitives.mjs`: pure escaping, display, state, pagination, bar, line, and sentiment-donut primitives.
- `lib/pdf-templates/standard/spec.mjs`: independent 720 x 405 pt Standard page settings, neutral tokens, requested font stacks, and chart palette.
- `lib/pdf-templates/standard/template.mjs`: Standard HTML/PDF renderer with dynamic pagination and separate diagnostics mode.
- `scripts/render-standard-real-output-preview.mjs`: read-only Standard preview and inventory renderer.
- `scripts/validate-standard-real-output-preview.mjs`: contract parity, module, safety, branding, diagnostics, and export-gate checks.

## Reusable Components

- Canonical reporting periods, metric/evidence/narrative records, provenance, scope, approval states, estimates, and quality flags.
- Module descriptors for Overview, Additional Metrics, Mentions, Sources, Reach, Sentiment, Evidence, Conversation Drivers, Monitoring Events, Competitive Intelligence, SOV, Findings, and Recommendations.
- Missing-data panels, state pills, metric cards, ranked bars, line charts, sentiment donuts, evidence cards, narrative lists, continuation helpers, dynamic page numbers, and diagnostics separation.
- Conversation Drivers preserve independent `intelligenceBasis` and `verificationState` dimensions. Source-reported topic counts remain awaiting verification; agent-inferred spike explanations remain separately identified and awaiting verification.

## EastWest Template 01 Remains Isolated

- Lime frame, magenta headings, Poppins direction, client logos, reference page mapping, fixed reference sequence, historical fixtures, approved image fallbacks, chart crops, evidence crops, and EastWest-specific comparison compositions.
- `app/api/eastwest-reference-pdf/route.js`, the historical proof renderer, the 32-page production-preview renderer, and all EastWest output files were not changed by the Standard renderer.

## Standard Presentation Differences

- Neutral warm-white page furniture with a restrained Signal Intel green rail and text-based Signal Intel / Praxis identities.
- DM Sans body, Barlow Condensed display, and JetBrains Mono metadata stacks, with approved Arial, Arial Narrow, SFMono, and Consolas fallbacks.
- Existing colorful chart palette and fixed semantic positive, negative, and neutral colors.
- Flexible module order with populated optional modules included and absent optional modules omitted.
- 10.5pt narrative target with 9pt used only for compact evidence/findings copy; 9pt remains the absolute body-copy floor.
- No EastWest page numbers, crop assets, lime frame, magenta heading system, or client-specific logo requirement.

## Safety Inventory Comparison

| Inventory | Verified | Unavailable | Awaiting verification | Export blockers |
|---|---:|---:|---:|---:|
| Standard | 19 | 27 | 30 | 26 |
| EastWest Template 01 | 19 | 29 | 30 | 28 |

The only inventory difference is the exclusion of `branding.clientLogo` and `branding.preparedByLogo` from Standard. The approved Standard architecture uses text identities and requires no new logo asset. All data, comparison, evidence, narrative, word-cloud, scope, and quality blockers are preserved. Both inventories retain the same five quality flags:

- `snapshot-total-conflict`
- `semantic-search-conflict`
- `evidence-relevance-noise`
- `bdo-monitored-zero`
- `scope-unconfirmed`

## Verification

- Production contract validation: pass.
- Production readiness validation: pass.
- EastWest real-output preview validation: pass, with the original 28 blockers.
- Standard real-output preview validation: pass, with 26 blockers and an enforced client-export failure.
- Next.js production build: pass.
- PDF geometry: 26 pages, 720 x 405 pt.
- Browser layout audit: no overflow detected in constrained narrative, evidence, competitor, recommendation, or diagnostic components.
- Visual inspection: all 26 pages rendered to PNG; appendix overlap was corrected and blocker pages were balanced 9/9/8.
- EastWest historical proof SHA-256 remains `34ca4cfc7494094d80d6996f723044dbec99ee81872ab48733e8b4c6fe24d60e`.
- EastWest 32-page real-output preview SHA-256 remains `440eda9da18ef483cc832662964ab6edbadc6362acd026d78620de524a733de5`.

## Unresolved Issues

The Standard preview remains blocked from client export. Missing or approval-dependent inputs include comparison-period chart datasets, raw daily mention/reach data, approved evidence URLs and screenshots, evidence-level reach/views, approved competitor evidence, weighted word-cloud terms, previous-report summary, and editorial approval for agent-produced summary, findings, recommendations, events, and competitor narratives.

The 733/723 snapshot conflict, 790/733 SOV distinction, semantic-search contradiction, ambiguous evidence candidates, suspect BDO monitored zero, broader/unfiltered scope, and estimated operational metrics remain explicit or traceable. No reconciliation was performed.

