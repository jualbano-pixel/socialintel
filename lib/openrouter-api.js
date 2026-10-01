const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function configured(value) {
  return !!value && !String(value).startsWith('your_');
}

export async function requestOpenRouterChat({ model, messages, maxTokens = null, tools = null, signal = undefined }) {
  if (!configured(process.env.OPENROUTER_API_KEY)) throw new Error('OPENROUTER_API_KEY is not configured.');
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'X-Title': 'Signal Intel' },
    body: JSON.stringify({
      model,
      messages,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(tools ? { tools } : {}),
    }),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { message: raw || 'Invalid OpenRouter response.' } }; }
  if (!response.ok || data?.error) throw new Error(data?.error?.message || data?.error || `OpenRouter request failed (${response.status}).`);
  return data;
}
