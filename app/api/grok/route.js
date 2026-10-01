import { requestGrokSearch } from '../../../lib/grok-api';

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await requestGrokSearch({ input: body.input, maxTokens: body.max_output_tokens });
    return Response.json({
      ...result.data,
      output_text: result.text,
      source_urls: result.sourceUrls,
      _signalIntel: { grokProvider: result.provider },
    });
  } catch (e) {
    const unavailable = e.message === 'Grok unavailable this run';
    return Response.json({ error: e.message }, { status: unavailable ? 503 : 502 });
  }
}
