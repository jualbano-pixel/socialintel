import { createProject, listProjects, toClientSafeError } from '../../../../lib/brand24-rest';

function accountIdFrom(body) {
  return process.env.BRAND24_ACCOUNT_ID || body.accountId;
}

function setupRecord(body, created) {
  return {
    id: `monitor-${Date.now()}`,
    primaryBrand: body.primaryBrand,
    dateRange: body.dateRange,
    philippinesOnly: !!body.philippinesOnly,
    language: body.language || '',
    monitors: created.map(item => ({
      role: item.role,
      name: item.name,
      monitorId: item.projectId,
      projectId: item.projectId,
      status: item.status,
    })),
    createdAt: new Date().toISOString(),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = process.env.BRAND24_ACCOUNT_ID || searchParams.get('accountId');
    const projects = await listProjects(accountId);
    return Response.json({ projects });
  } catch (error) {
    console.error('[Tracking projects list] error', error);
    return Response.json({ error: toClientSafeError(error) }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const accountId = accountIdFrom(body);
    const monitors = Array.isArray(body.monitors) ? body.monitors : [];
    if (!monitors.length) return Response.json({ error: 'Add at least one monitor before creating the setup.' }, { status: 400 });

    const created = [];
    for (const monitor of monitors) {
      const name = String(monitor.name || '').trim();
      const keywords = Array.isArray(monitor.keywords) ? monitor.keywords : [];
      if (!name || !keywords.length) continue;
      const response = await createProject(accountId, name, keywords, body.language || undefined);
      const projectId = response?.data?.[0] || response?.projectId || response?.id || null;
      created.push({
        role: monitor.role || 'competitor',
        name,
        projectId,
        status: 'created',
      });
    }

    if (!created.length) return Response.json({ error: 'Add monitor names and keywords before creating the setup.' }, { status: 400 });

    return Response.json({
      status: 'success',
      setup: setupRecord(body, created),
    });
  } catch (error) {
    console.error('[Tracking projects create] error', error);
    return Response.json({ error: toClientSafeError(error) }, { status: 502 });
  }
}
