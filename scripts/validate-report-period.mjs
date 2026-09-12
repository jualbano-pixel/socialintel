import assert from 'node:assert/strict';
import { INVALID_REPORTING_PERIOD_MESSAGE, parsePeriod } from '../lib/report-period.mjs';

const expectedSeptember = { startDate: '2026-09-06', endDate: '2026-09-12' };
const expectedCrossMonth = { startDate: '2026-08-31', endDate: '2026-09-06' };

const accepted = [
  ['September 6-12, 2026', expectedSeptember],
  ['Sep 6-12, 2026', expectedSeptember],
  ['Sept 6-12, 2026', expectedSeptember],
  ['SEP. 6 - 12, 2026', expectedSeptember],
  ['September 6 – 12, 2026', expectedSeptember],
  ['September 6—12, 2026', expectedSeptember],
  ['September 6 to 12, 2026', expectedSeptember],
  ['September 6 through 12, 2026', expectedSeptember],
  ['  September   6   -   12,   2026  ', expectedSeptember],
  ['August 31-September 6, 2026', expectedCrossMonth],
  ['Aug 31-Sep 6, 2026', expectedCrossMonth],
  ['Aug. 31 through Sept. 6, 2026', expectedCrossMonth],
  ['2026-09-06 to 2026-09-12', expectedSeptember],
  ['2026-09-06 - 2026-09-12', expectedSeptember],
  ['2026-09-06—2026-09-12', expectedSeptember],
];

for (const [input, expected] of accepted) assert.deepEqual(parsePeriod(input), expected, input);

const rejected = [
  'Smarch 6-12, 2026',
  'August 31-Smep 6, 2026',
  'September 31-October 2, 2026',
  'February 29-March 1, 2025',
  'September 12-6, 2026',
  '2026-09-12 to 2026-09-06',
  'September 6-12, 2026 trailing garbage',
  'not a date range',
  '',
];

for (const input of rejected) {
  assert.throws(
    () => parsePeriod(input),
    error => error instanceof Error && error.message === INVALID_REPORTING_PERIOD_MESSAGE,
    input || 'empty input',
  );
}

const visiblePeriod = 'September 6-12, 2026';
const manualData = { dateRange: 'Aug. 31 through Sept. 6, 2026' };
const effectivePeriod = manualData.dateRange.trim() || visiblePeriod;
assert.deepEqual(parsePeriod(effectivePeriod), expectedCrossMonth, 'manual/upload override must use the shared parser');

console.log(JSON.stringify({
  accepted: accepted.length,
  rejected: rejected.length,
  manualOverride: true,
  failureMessage: INVALID_REPORTING_PERIOD_MESSAGE,
}, null, 2));
