// Claude API + Brand24 MCP
// Brand24 OAuth is stored per Anthropic account — same API key = same connected Brand24
import { attachClaudeMetadata, requestClaude } from '../../../lib/claude-api';

export async function POST(request) {
  try {
    const body = await request.json();
    const brand24Token = process.env.BRAND24_TOKEN;
    const hasBrand24Token = brand24Token && !brand24Token.startsWith('your_');
    const result = await requestClaude({
        ...body,
        tools: [
          {
            type: 'mcp_toolset',
            mcp_server_name: 'brand24',
          },
        ],
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.brand24.com/v1/mcp',
            name: 'brand24',
            ...(hasBrand24Token && { authorization_token: brand24Token }),
          },
        ],
      }, { label: 'Claude Brand24 agent', anthropicHeaders: { 'anthropic-beta': 'mcp-client-2025-11-20' } });
    const data = attachClaudeMetadata(result.data, result);
    console.log('Claude+B24 content types:', data.content?.map(b => b.type).join(', ') || data.error?.message);
    return Response.json(data, { status: result.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
