// Claude API + Brand24 MCP
// Brand24 OAuth is stored per Anthropic account — same API key = same connected Brand24
export async function POST(request) {
  try {
    const body = await request.json();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-11-20',
      },
      body: JSON.stringify({
        ...body,
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.brand24.com/v1/mcp',
            name: 'brand24',
          },
        ],
      }),
    });
    const data = await response.json();
    console.log('Claude+B24 content types:', data.content?.map(b => b.type).join(', ') || data.error?.message);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
