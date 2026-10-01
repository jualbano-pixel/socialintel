const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/messages';
const MAX_DIRECT_ATTEMPTS = 3;
const MODEL_MAP = {
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
};

function configured(value) {
  return !!value && !String(value).startsWith('your_');
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: { message: raw } }; }
}

function errorMessage(data) {
  return String(data?.error?.message || data?.error || data?.message || '');
}

function isBillingError(data) {
  return /(credit balance.*too low|insufficient credits?|billing|payment required|purchase credits?)/i.test(errorMessage(data));
}

function retryableStatus(status) {
  return status === 429 || status === 529 || status >= 500;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function openRouterModel(model) {
  const mapped = MODEL_MAP[model];
  if (!mapped) throw new Error(`OpenRouter backup is not mapped for Anthropic model "${model}"; refusing to substitute a different model.`);
  return mapped;
}

export function claudeProviderMetadata(result) {
  return {
    claudeProvider: result.provider,
    claudeProviderLabel: result.usedBackup ? 'Claude via OpenRouter (backup)' : 'Claude direct',
    claudeBackupUsed: result.usedBackup,
    claudeModel: result.model,
    claudeDirectAttempts: result.directAttempts,
  };
}

export function attachClaudeMetadata(data, result) {
  return { ...(data || {}), _signalIntel: { ...(data?._signalIntel || {}), ...claudeProviderMetadata(result) } };
}

export async function requestClaude(body, { signal, anthropicHeaders = {}, label = 'Claude' } = {}) {
  if (!configured(process.env.ANTHROPIC_API_KEY)) throw new Error('ANTHROPIC_API_KEY is not configured.');
  let last = null;
  for (let attempt = 1; attempt <= MAX_DIRECT_ATTEMPTS; attempt += 1) {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...anthropicHeaders },
      body: JSON.stringify(body),
    });
    const data = await parseResponse(response);
    last = { response, data, attempt };
    if (response.ok && !data?.error) return { data, status: response.status, ok: true, provider: 'anthropic', usedBackup: false, model: body.model, directAttempts: attempt };
    if (isBillingError(data)) break;
    if (!retryableStatus(response.status)) return { data, status: response.status, ok: false, provider: 'anthropic', usedBackup: false, model: body.model, directAttempts: attempt };
    if (attempt < MAX_DIRECT_ATTEMPTS) await sleep(400 * (2 ** (attempt - 1)) + Math.round(Math.random() * 150));
  }

  const eligible = isBillingError(last?.data) || retryableStatus(last?.response?.status || 0);
  if (!eligible) return { data: last?.data || {}, status: last?.response?.status || 500, ok: false, provider: 'anthropic', usedBackup: false, model: body.model, directAttempts: last?.attempt || 0 };
  if (!configured(process.env.OPENROUTER_API_KEY)) {
    const data = last?.data || { error: { message: `${label} failed and OPENROUTER_API_KEY is not configured for backup.` } };
    data.error = { ...(typeof data.error === 'object' ? data.error : {}), message: `${errorMessage(data) || `${label} failed`}. OpenRouter backup is not configured.` };
    return { data, status: last?.response?.status || 502, ok: false, provider: 'anthropic', usedBackup: false, model: body.model, directAttempts: last?.attempt || 0 };
  }

  const backupModel = openRouterModel(body.model);
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'X-Title': 'Signal Intel' },
    body: JSON.stringify({ ...body, model: backupModel }),
  });
  const data = await parseResponse(response);
  return { data, status: response.status, ok: response.ok && !data?.error, provider: 'openrouter', usedBackup: true, model: backupModel, directAttempts: last?.attempt || 0 };
}
