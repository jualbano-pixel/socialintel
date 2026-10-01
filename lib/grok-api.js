import { requestOpenRouterChat } from './openrouter-api';

export const GROK_OPENROUTER_MODEL = 'x-ai/grok-4.7';
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';

export const GROK_OPENROUTER_SEARCH_TOOLS = [{
  type: 'openrouter:web_search',
  parameters: {
    engine: 'native',
    x_search: {},
  },
}];

function configured(value) {
  return !!value && !String(value).startsWith('your_');
}

function normalizeMessages(input) {
  if (Array.isArray(input)) return input;
  return [{ role: 'user', content: String(input || '') }];
}

function urlsFromMetadataNodes(nodes) {
  const urls = new Set();
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['url', 'uri', 'link'].includes(key) && typeof child === 'string' && /^https?:\/\//i.test(child)) urls.add(child);
      else visit(child);
    }
  };
  visit(nodes);
  return [...urls];
}

export function extractOpenRouterAnnotationUrls(data) {
  const annotations = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'annotations') annotations.push(child);
      else visit(child);
    }
  };
  visit(data);
  return urlsFromMetadataNodes(annotations);
}

function extractXaiCitationUrls(data) {
  const metadata = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['annotations', 'citations', 'sources'].includes(key)) metadata.push(child);
      else visit(child);
    }
  };
  visit(data);
  return urlsFromMetadataNodes(metadata);
}

function openRouterText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('');
  return '';
}

function xaiText(data) {
  return data?.output_text
    || data?.output?.find(block => block.type === 'message')?.content?.find(block => block.type === 'output_text')?.text
    || data?.output?.find(block => block?.content?.[0]?.text)?.content?.[0]?.text
    || '';
}

async function requestXaiFallback({ input, maxTokens }) {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: 'grok-4.7',
      input: normalizeMessages(input),
      tools: [{ type: 'x_search' }, { type: 'web_search' }],
      ...(maxTokens ? { max_output_tokens: maxTokens } : {}),
    }),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { message: raw || 'Invalid xAI response.' } }; }
  if (!response.ok || data?.error) throw new Error(data?.error?.message || data?.error || `xAI fallback failed (${response.status}).`);
  return { data, text: xaiText(data), sourceUrls: extractXaiCitationUrls(data), provider: 'xAI fallback' };
}

export async function requestGrokSearch({ input, maxTokens = null }) {
  const messages = [
    { role: 'system', content: 'Use native web search and X search for this request. Include the relevant x.com source URLs in the answer whenever X results are returned. Never imply that X was searched if no X results were found.' },
    ...normalizeMessages(input),
  ];
  if (configured(process.env.OPENROUTER_API_KEY)) {
    try {
      const data = await requestOpenRouterChat({
        model: GROK_OPENROUTER_MODEL,
        messages,
        maxTokens,
        tools: GROK_OPENROUTER_SEARCH_TOOLS,
      });
      const text = openRouterText(data);
      const sourceUrls = extractOpenRouterAnnotationUrls(data);
      console.log('Grok via OpenRouter', {
        model: GROK_OPENROUTER_MODEL,
        xSearchEnabled: true,
        sourceUrlCount: sourceUrls.length,
        xSourceUrlCount: sourceUrls.filter(url => /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(url)).length,
      });
      return { data, text, sourceUrls, provider: 'Grok via OpenRouter' };
    } catch (error) {
      console.error('Grok via OpenRouter failed', { model: GROK_OPENROUTER_MODEL, error: error?.message });
      if (!configured(process.env.XAI_API_KEY)) throw new Error('Grok unavailable this run');
    }
  }

  if (!configured(process.env.XAI_API_KEY)) throw new Error('Grok unavailable this run');
  console.warn('Grok via OpenRouter unavailable; using configured xAI fallback');
  return requestXaiFallback({ input: messages, maxTokens });
}
