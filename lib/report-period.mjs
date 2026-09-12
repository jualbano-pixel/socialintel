export const INVALID_REPORTING_PERIOD_MESSAGE = 'Invalid reporting period. Use a range such as "September 6-12, 2026", "Aug 31-Sep 6, 2026", or "2026-09-06 to 2026-09-12".';

const MONTHS = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

const MONTH_TOKEN = '([a-z]+\\.?)';
const RANGE_SEPARATOR = '(?:-|–|—|to|through)';
const ISO_RANGE = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})\\s*${RANGE_SEPARATOR}\\s*(\\d{4}-\\d{2}-\\d{2})$`, 'i');
const CROSS_MONTH_RANGE = new RegExp(`^${MONTH_TOKEN}\\s+(\\d{1,2})\\s*${RANGE_SEPARATOR}\\s*${MONTH_TOKEN}\\s+(\\d{1,2}),?\\s*(\\d{4})$`, 'i');
const SAME_MONTH_RANGE = new RegExp(`^${MONTH_TOKEN}\\s+(\\d{1,2})\\s*${RANGE_SEPARATOR}\\s*(\\d{1,2}),?\\s*(\\d{4})$`, 'i');

function invalidPeriod() {
  throw new Error(INVALID_REPORTING_PERIOD_MESSAGE);
}

function monthNumber(token) {
  const key = String(token || '').toLowerCase().replace(/\.$/, '');
  return MONTHS[key] || invalidPeriod();
}

function validIsoDate(year, month, day) {
  const iso = `${year}-${month}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) invalidPeriod();
  return iso;
}

function validateRange(startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split('-');
  const [endYear, endMonth, endDay] = endDate.split('-');
  const start = validIsoDate(startYear, startMonth, startDay);
  const end = validIsoDate(endYear, endMonth, endDay);
  if (start > end) invalidPeriod();
  return { startDate: start, endDate: end };
}

export function parsePeriod(period) {
  const input = String(period ?? '').trim();
  if (!input) invalidPeriod();

  const isoRange = input.match(ISO_RANGE);
  if (isoRange) return validateRange(isoRange[1], isoRange[2]);

  const crossMonth = input.match(CROSS_MONTH_RANGE);
  if (crossMonth) {
    const [, startMonthToken, startDay, endMonthToken, endDay, year] = crossMonth;
    return validateRange(
      `${year}-${monthNumber(startMonthToken)}-${String(startDay).padStart(2, '0')}`,
      `${year}-${monthNumber(endMonthToken)}-${String(endDay).padStart(2, '0')}`,
    );
  }

  const sameMonth = input.match(SAME_MONTH_RANGE);
  if (sameMonth) {
    const [, monthToken, startDay, endDay, year] = sameMonth;
    const month = monthNumber(monthToken);
    return validateRange(
      `${year}-${month}-${String(startDay).padStart(2, '0')}`,
      `${year}-${month}-${String(endDay).padStart(2, '0')}`,
    );
  }

  return invalidPeriod();
}
