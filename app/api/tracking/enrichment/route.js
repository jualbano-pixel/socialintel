import { Brand24RestError, toClientSafeError } from '../../../../lib/brand24-rest';
import { getProvider } from '../../../../lib/providers';

const ENRICHMENT_TIMEOUT_MS = 90000;

export async function POST(request) {
  try {
    const body = await request.json();
    const provider = getProvider(body.provider);
    if (!provider.capabilities.enrichment) return Response.json({ provider: provider.name, available: false, note: 'Enrichment is not available from this provider.' });
    const projectId = String(body.projectId || body.monitorId || '').trim();
    if (!projectId) return Response.json({ error: 'Choose a tracking source before loading enrichment data.' }, { status: 400 });
    if (!body.dateFrom || !body.dateTo) return Response.json({ error: 'Choose a reporting date range before loading enrichment data.' }, { status: 400 });

    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Brand24RestError(
        `Tracking enrichment took longer than ${Math.round(ENRICHMENT_TIMEOUT_MS / 1000)}s. Try a narrower date range or fewer sections.`,
        { code: 'TIMEOUT' }
      )), ENRICHMENT_TIMEOUT_MS);
    });

    const enrichment = await Promise.race([
      provider.fetchEnrichment({ projectId, dateFrom: body.dateFrom, dateTo: body.dateTo, sections: body.sections }),
      timeout,
    ]).finally(() => clearTimeout(timeoutId));

    return Response.json(enrichment);
  } catch (error) {
    console.error('[Tracking enrichment] error', error);
    return Response.json({ error: toClientSafeError(error) }, { status: 502 });
  }
}
