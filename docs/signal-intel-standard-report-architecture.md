# Signal Intel Standard Report Architecture

## Status And Scope

This note defines the proposed reusable reporting boundary after Signal Intel has produced its output. It does not change acquisition, Brand24 API or MCP behavior, extraction, geolocation, agents, calculations, tracking, authentication, dashboard settings, the standard export route, or live export wiring.

The approved EastWest implementation remains **Template 01**. Its historical reference sequence and visual treatment are not defaults for other clients.

No Standard PDF or PPTX renderer is implemented in this milestone.

## Architecture Decision

Use one canonical `SignalIntelReport` object, one shared module vocabulary, and separate template specifications:

```text
Existing Signal Intel output
        |
        v
Read-only output adapter
        |
        v
Canonical SignalIntelReport
  - values, states, periods, scope, provenance
  - evidence and approval status
  - quality conflicts and export blockers
        |
        +-------------------------+
        |                         |
        v                         v
Standard template          EastWest Template 01
  - flexible sequence        - approved reference sequence
  - neutral Praxis tokens    - lime/magenta/Poppins tokens
  - optional modules         - client-specific page rules
        |                         |
        +------------+------------+
                     v
          Shared HTML/PDF renderer
          Future native PPTX renderer
```

Templates select, order, and style modules. They must not recalculate or mutate report data.

## Existing Implementation Classification

| Existing element | Classification | Decision |
|---|---|---|
| `reportingContext`, explicit periods and data scopes | Canonical report data | Reuse unchanged in meaning; move behind a neutral schema name later |
| Metric value records with `state`, `value`, `displayValue`, provenance and calculation status | Canonical report data | Reuse; preserve rounded display-only values and estimates |
| Mentions, reach, sentiment and source-type datasets | Canonical report data | Reuse without reconciliation or template-side calculation |
| Competitor identities, cohort metadata and SOV period records | Canonical report data | Reuse; cohort and denominator compatibility remain validation concerns |
| Evidence records, relevance state, approval state and screenshot/source requirements | Canonical report data | Reuse; templates may vary card layout but not evidence eligibility |
| Approved narrative, optional intelligence and operational metrics | Canonical report data | Reuse; approval state remains attached to every narrative block |
| `dataQualityFlags` | Canonical safety data | Reuse; rendered in diagnostics and used by export gates |
| `numberOrUnavailable`, period derivation, source-series mapping and evidence mapping | Read-only adapter behavior | Extract later into a neutral adapter; preserve current outputs exactly |
| State validation, denominator policy, overflow limits and client-export assertions | Production diagnostics and gates | Extract later into shared validation with template-specific additions |
| `lineChart`, ranked bars, sentiment donut, missing-data panel and status tag | Reusable presentation primitives | Extract after token and module interfaces are approved |
| Evidence cards, metric-card grid, event cards, topic cards, competitor cards, findings and recommendation lists | Reusable presentation modules | Extract as themeable modules; keep content and layout contracts independent |
| Dynamic page numbering, continuation chunks and preview-only diagnostics toggle | Reusable rendering behavior | Reuse for Standard and EastWest |
| Puppeteer launch, font wait, print background and PDF response handling | Reusable export machinery | Consolidate later behind a renderer utility; do not change either live route now |
| 720 x 405 pt page size | EastWest requirement and suitable Standard default | EastWest remains fixed; Standard declares its own 16:9 page token even if the dimensions match |
| Lime frame, magenta headings, Poppins, EastWest logo placement and reference footer treatment | EastWest-specific presentation | Leave in Template 01 |
| Historical 22-page order, reference-page mapping and approved crops | EastWest-specific sequence and fixture | Leave in Template 01; never become Standard defaults |
| EastWest comparison panels and evidence placement | EastWest-specific layout variants | Keep as Template 01 variants of shared semantic modules |
| Readiness counts, source filenames, blocker summaries and collection checklist | Preview-only diagnostics | Keep optional and absent from client render mode |
| Whole-page historical crops and approved image fallbacks | Template fixture or fallback capability | Keep isolated; do not expose as Standard production defaults |
| Weighted word cloud, complete comparison periods, competitor evidence assets and extended demographic fields | Future or unsupported capability | Render unavailable or omit when optional; do not fabricate |

## Canonical Report Object

The current production contract already contains the required semantics. The proposed neutral name is `SignalIntelReport`; EastWest can temporarily import or re-export the same implementation during migration.

```js
{
  schemaVersion,
  reportingContext: {
    clientName,
    reportTitle,
    generatedAt,
    reportingPeriods: { current, previousWeek, previousFullMonth, ytd },
    provenance: { sourceRunId, generatedAt, approvedBy, dataSources },
    dataScopes: { primaryMetrics, mentionSample, reach }
  },
  metrics: {
    mentions: { total, dailyAverage, dailySeries },
    sourceTypes,
    reach: { total, social, nonSocial, dailySeries },
    sentiment
  },
  sov: { comparisonCohort, current, previousWeek, previousFullMonth, ytd },
  evidence: { records, screenshotPolicy },
  approvedNarrative: {
    previousReportSummary,
    executiveSummary,
    positiveThemes,
    negativeThemes,
    recommendations
  },
  optionalModules: {
    operationalMetrics,
    intelligence,
    extended
  },
  dataQualityFlags
}
```

### Invariants

- Every value, dataset, evidence record and narrative retains state and provenance.
- `unavailable`, `not_applicable`, `awaiting_verification` and verified zero remain distinct.
- `Est.` is presentation metadata from the source and is never removed by a template.
- Measured values and inferred narrative remain visually and semantically distinct.
- Percentages are not recalculated across incompatible periods, cohorts, scopes or denominators.
- Evidence cannot become client-ready without relevance approval and required source fields.
- Templates may omit absent optional modules, but required missing content stays explicit and may block export.
- Quality flags are preserved even when preview diagnostics are hidden.

The representative EastWest fixture must continue preserving the 733/723 snapshot conflict, 790/733 SOV conflict, semantic-search contradiction, ambiguous evidence candidates, suspect BDO monitored zero, broader/unfiltered scope, estimates and narrative approval states.

## Shared Module Contract

Each renderable module should resolve to a template-neutral descriptor before HTML or future PPTX rendering:

```js
{
  moduleId,          // stable semantic type, such as "mentions"
  instanceId,        // unique within the report
  title,
  periodKey,
  scopeRef,
  provenanceRefs,
  state,
  approvalState,
  layoutVariant,
  continuation: { index, total, continuedFrom },
  content,
  assets,
  exportPolicy: { required, omitWhenEmpty, blockWhenInvalid }
}
```

`content` holds report data, not HTML. `layoutVariant` is selected by the template. The same module descriptor can therefore feed EastWest HTML, Standard HTML, or a later native slide renderer.

## Standard Section Specification

The Standard template uses a flexible sequence. It does not inherit EastWest reference-page numbers or force empty optional pages.

| Order | Module | Presence rule | Primary content | Overflow behavior |
|---|---|---|---|---|
| 1 | Overview | Required | Client, period, scope, executive summary and headline metrics | Continue summary; never shrink below readable body size |
| 2 | Mentions | Required | Current total, daily average, trend and available comparisons | One chart per frame; unavailable comparisons use an explicit state |
| 3 | Sources | Required | Ranked source mix, percentages/counts and source narrative | Continue detail tables; keep one chart intact |
| 4 | Reach | Required | Total, social/non-social splits, trend and comparisons | Add detail page for long series; do not substitute mentions for reach |
| 5 | Sentiment | Required | Counts, percentages, donut/comparison and sentiment narrative | Narrative may continue; chart remains whole |
| 6 | Evidence | Required when evidence is a report requirement | Positive, negative and neutral evidence records | Continue by tone and card capacity; never clip captions |
| 7 | Conversation Drivers | Optional | Topic clusters, themes and spike drivers | Measured cards and inferred copy may continue independently |
| 8 | Monitoring Events | Optional | Date, observation, evidence and status when supplied | Continue event cards; unsupported narrative remains one narrative record |
| 9 | Competitive Intelligence | Optional | Competitor identities and approved or review-state observations | Continue cards; full narrative remains in the report object |
| 10 | Share of Voice | Optional or client-required | Current SOV, comparison periods, cohorts, source mix and peaks | Add comparison/detail pages; never split one chart |
| 11 | Findings | Required when report narrative exists | Executive synthesis, positive drivers and negative themes | Balance findings across continuation pages |
| 12 | Recommendations | Required when report narrative exists | Approved or approval-dependent recommendations | Continue in balanced groups; avoid orphan pages when capacity permits |
| 13 | Additional Metrics | Optional | Presence Score, AVE, UGC and engagement metrics | Continue metric-card grids; preserve source display and estimate labels |

Template configuration may place Additional Metrics after Overview or after Evidence. It may not silently move narrative into an unrelated section.

### Optional-Module Policy

- `omitWhenEmpty: true` for optional modules.
- No blank page is generated for a missing optional module.
- A client-required module with unavailable content renders an explicit missing state in preview and remains an export blocker.
- Module presence is driven by the canonical report object and template requirements, not by historical page count.

### Overflow Policy

- Pagination operates on complete module items, evidence cards and chart frames.
- Text is continued before reducing type below the template minimum.
- A single chart, screenshot or evidence card is never split across pages.
- Continuations retain module title, period, scope reference, provenance references and dynamic page number.
- An item too large to continue safely blocks client export with its instance and source identifier.

## Standard Visual Tokens

The neutral Standard visual system should use tokens already present in Signal Intel. It is neutral in page furniture, not monochrome in data visualization.

### Page And Typography

| Token | Proposed Standard value | Source |
|---|---|---|
| `page.width` / `page.height` | 720pt / 405pt | Independent 16:9 Standard canvas; slide-friendly |
| `page.background` | `#FAF9F6` | Existing Signal Intel light theme |
| `surface.primary` | `#FFFFFF` | Existing Signal Intel light theme |
| `surface.muted` | `#F1EFE8` | Existing Signal Intel light theme |
| `text.primary` | `#16150F` | Existing Signal Intel light theme |
| `text.secondary` | `#4E4C45` | Existing Signal Intel light theme |
| `border.default` | `#E2E0D9` | Existing Signal Intel light theme |
| `font.body` | DM Sans, Arial, sans-serif | Existing Signal Intel app/export |
| `font.display` | Barlow Condensed, Arial, sans-serif | Existing Signal Intel app/export |
| `font.meta` | JetBrains Mono, monospace | Existing Signal Intel app/export |
| `type.body.minimum` | 9pt | Existing production safety rule |
| `spacing.base` | 4pt | Proposed token scale derived from current 8/12/16 spacing rhythm |

Standard headings use dark text with restrained green live-status accents. Standard pages do not use EastWest's lime frame, magenta heading rule or Poppins font.

### Semantic And Chart Palette

| Purpose | Token | Value |
|---|---|---|
| Live / verified | `accent.live` | `#146C43` |
| Positive | `sentiment.positive` | `#146C43` |
| Negative | `sentiment.negative` | `#B4232E` |
| Neutral | `sentiment.neutral` | `#8A877E` |
| Information | `accent.info` | `#1B5E8A` |
| Warning / awaiting review | `accent.warning` | `#A45B12` |
| Chart blue | `chart.blue` | `#2563A8` |
| Chart pink | `chart.pink` | `#AD2F7F` |
| Chart red | `chart.red` | `#B9473F` |
| Chart rose | `chart.rose` | `#B84B79` |
| Chart teal | `chart.teal` | `#2F7D7B` |
| Chart purple | `chart.purple` | `#6A55B8` |
| Chart gold | `chart.gold` | `#A77A00` |
| Chart cyan | `chart.cyan` | `#327D90` |
| Chart green | `chart.green` | `#148A62` |
| Chart orange | `chart.orange` | `#B85A13` |

Source categories receive a deterministic color from this existing palette. Sentiment colors remain semantic and cannot be reassigned per report.

### Branding

- Use the existing text identities `Signal Intel` and `Praxis Experiential` for the Standard template.
- No new logo is required for the first Standard implementation.
- The only repository logo assets currently available are EastWest reference crops, including the cropped Praxis mark; they remain isolated from Standard until their production use is approved.
- A later approved Praxis or Signal Intel lockup can be supplied through branding tokens without changing module contracts.

## Template Responsibilities

### Standard Template

- Selects the flexible Standard module sequence.
- Uses neutral Standard tokens and the existing colorful chart palette.
- Omits absent optional modules.
- Uses shared continuation and diagnostics behavior.
- Has no EastWest reference-page mapping or client crop dependency.

### EastWest Template 01

- Preserves the approved EastWest section sequence and 720 x 405 pt architecture.
- Owns lime frame, magenta headings, Poppins, logo positions, comparison layouts and evidence composition.
- Owns historical reference fixtures, page mappings and approved fallback crops.
- May use shared semantic modules and chart primitives only when their rendered output remains equivalent.
- Continues to consume the same canonical object without changing safety behavior.

## Diagnostics And Export Gates

Diagnostics are a separate render mode, not a mandatory report section.

- Preview mode may include readiness counts, source filenames, quality flags, blocker summaries and collection checklists.
- Client mode omits technical diagnostic pages and filenames but does not remove underlying flags or blockers.
- Client export remains blocked when required data, evidence, approval, denominator compatibility or overflow handling is invalid.
- Template-level checks may add stricter requirements; they may not weaken canonical safety checks.

## PowerPoint Readiness

PowerPoint readiness is achieved through module boundaries, not by exporting HTML screenshots.

### Slide Contract

- One resolved module frame maps to one 10 x 5.625 inch slide by default.
- The canonical content box is 720 x 405 pt; each template defines its safe area and footer zone with tokens.
- Continuation pages become continuation slides with stable module and item identifiers.
- Chart modules receive structured categories, series, labels, annotations and palette tokens.
- Evidence modules receive image assets, crop intent, captions, source links and provenance references.
- Narrative modules receive complete text plus any explicitly approved display excerpt.

### Later Native PPTX Work

A future PPTX exporter would require:

1. A renderer that maps module descriptors to native text boxes, shapes, images and charts.
2. Font embedding or an approved font-substitution policy.
3. Asset sizing and crop rules shared with the PDF template.
4. Hyperlink mapping for evidence sources.
5. Speaker-note or hidden metadata placement for provenance and approval status.
6. Visual regression comparisons between PDF pages and PPTX slides.

No PPTX-specific field should be added to the canonical report data. Export-only geometry belongs to template and renderer contracts.

## Proposed Migration Sequence

No extraction is implemented yet. The lowest-risk implementation sequence after approval is:

1. Add neutral aliases for the current state, provenance and report-contract definitions while keeping EastWest exports stable.
2. Extract pure module descriptors and chart data interfaces from the production preview renderer.
3. Add Standard tokens and a Standard template specification.
4. Render a Standard fixture from the existing real Signal Intel output and compare safety inventory results with EastWest.
5. Consolidate Puppeteer mechanics only after both templates pass regression checks.

This avoids a second report engine and gives EastWest Template 01 a compatibility path throughout the migration.
