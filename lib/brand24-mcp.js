import { requestClaude } from './claude-api';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 120000;

export class Brand24McpError extends Error {
  constructor(message, { cause, status } = {}) {
    super(message);
    this.name = 'Brand24McpError';
    this.cause = cause;
    this.status = status;
  }
}

function brand24TokenConfig() {
  const token = process.env.BRAND24_TOKEN;
  return token && !token.startsWith('your_') ? { authorization_token: token } : {};
}

function parseToolJson(toolResult) {
  const text = toolResult?.content?.find(item => item.type === 'text')?.text || '';
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function getFilteredProjectSources({ projectId, dateFrom, dateTo, country = 'PH', language = 'en', timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!projectId) throw new Brand24McpError('Monitor was not found.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let result;
  try {
    result = await requestClaude({
      model: process.env.ANTHROPIC_MCP_MODEL || DEFAULT_MODEL,
      max_tokens: 8000,
      tools: [{
        type: 'mcp_toolset',
        mcp_server_name: 'brand24',
      }],
      mcp_servers: [{
        type: 'url',
        url: 'https://mcp.brand24.com/v1/mcp',
        name: 'brand24',
        ...brand24TokenConfig(),
      }],
      messages: [{
        role: 'user',
        content: `Call brand24_project_sources exactly once with operationName="getMentionsTopAuthors", projectId=${projectId}, dateRange.from="${dateFrom}", dateRange.to="${dateTo}", filters.ctr=["${country}"], filters.lang=["${language}"]. After the tool call, return no prose.`,
      }],
    }, {
      signal: controller.signal,
      label: 'Claude Brand24 MCP source filter',
      anthropicHeaders: { 'anthropic-beta': 'mcp-client-2025-11-20' },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === 'AbortError') throw new Brand24McpError('MCP source filter timed out.');
    throw error;
  }
  clearTimeout(timeout);

  const data = result.data;
  if (!result.ok || data?.error) {
    throw new Brand24McpError(data?.error?.message || 'MCP source filter failed.', { status: result.status, cause: data });
  }
  const toolResult = data?.content?.find(item => item.type === 'mcp_tool_result' && !item.is_error);
  const parsed = parseToolJson(toolResult);
  const mentions = parsed?.getMentionsTopAuthors;
  if (!Array.isArray(mentions)) {
    throw new Brand24McpError('MCP source filter did not return mention data.', { cause: data });
  }
  return {
    mentions,
    toolName: data?.content?.find(item => item.type === 'mcp_tool_use')?.name || 'brand24_project_sources',
    recordCount: mentions.length,
    cappedAt: 100,
    sampleLimited: mentions.length >= 100,
    country,
    language,
    claudeProvider: result.usedBackup ? 'Claude via OpenRouter (backup)' : 'Claude direct',
  };
}
