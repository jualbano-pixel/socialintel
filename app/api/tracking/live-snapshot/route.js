import { getLiveSnapshot } from '../utils';
import { toClientSafeError } from '../../../../lib/brand24-rest';

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

    const snapshot = await getLiveSnapshot({
      accountId,
      brand,
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      countryFilter: body.philippinesOnly ? 'PH' : '',
      filters: {
        sentiment: body.sentiment,
        category: body.category,
      },
    });

    return Response.json(snapshot);
  } catch (error) {
    console.error('[Tracking live snapshot] error', error);
    return Response.json({ error: toClientSafeError(error) }, { status: 502 });
  }
}
