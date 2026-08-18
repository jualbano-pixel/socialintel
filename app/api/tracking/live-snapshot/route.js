import { getLiveSnapshot } from '../utils';
import { Brand24RestError, toClientSafeError } from '../../../../lib/brand24-rest';

const LIVE_SNAPSHOT_TIMEOUT_MS = 90000;
export async function POST(request) {
  try {
    const body = await request.json();
    const accountId = process.env.BRAND24_ACCOUNT_ID || body.accountId;
    const brand = String(body.brand || '').trim();
    if (!brand) return Response.json({ error: 'Enter a brand before running the report.' }, { status: 400 });
    if (!body.dateFrom || !body.dateTo) return Response.json({ error: 'Choose a reporting date range before running the report.' }, { status: 400 });
    console.info('[Tracking live snapshot] env/config check', {
      brand,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      countryFilter: body.philippinesOnly ? 'PH' : '',
      hasApiKey: !!process.env.BRAND24_API_KEY,
      hasAccountId: !!accountId,
      accountIdLength: String(accountId || '').length,
      accountIdSuffix: accountId ? String(accountId).slice(-4) : '',
    });

    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Brand24RestError(
        `Live tracking snapshot took longer than ${Math.round(LIVE_SNAPSHOT_TIMEOUT_MS / 1000)}s. Try a narrower date range or retry shortly.`,
        { code: 'TIMEOUT' }
      )), LIVE_SNAPSHOT_TIMEOUT_MS);
    });

    const snapshot = await Promise.race([
      getLiveSnapshot({
        accountId,
        brand,
        aliases: Array.isArray(body.aliases) ? body.aliases : [],
        projectId: body.projectId,
        projectName: body.projectName,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        countryFilter: body.philippinesOnly ? 'PH' : '',
        filters: {
          sentiment: body.sentiment,
          category: body.category,
        },
      }),
      timeout,
    ]).finally(() => clearTimeout(timeoutId));

    return Response.json(snapshot);
  } catch (error) {
    console.error('[Tracking live snapshot] error', error);
    return Response.json({ error: toClientSafeError(error) }, { status: 502 });
  }
}
