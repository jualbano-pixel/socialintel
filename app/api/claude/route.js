import { attachClaudeMetadata, requestClaude } from '../../../lib/claude-api';

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await requestClaude(body, { label: 'Claude agent' });
    return Response.json(attachClaudeMetadata(result.data, result), { status: result.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
