// Provider-agnostic client for any OpenAI-compatible chat completions endpoint.
// Configured only by env vars (see .env.example). Server-side only: never import from client components.

export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmConfig {
  /**
   * Endpoints to try, in order: every model of LLM_MODEL (comma-separated) on the main provider, then every model
   * of LLM_FALLBACK_MODEL on the fallback provider. Free tiers limit tokens per model and per day, so when one is
   * rate limited (HTTP 429) or fails, the next is tried before the cached report is served.
   */
  endpoints: LlmEndpoint[];
  /** LLM_REASONING_EFFORT: a value to send as `reasoning_effort`, "none" to send nothing, or null for the default. */
  reasoningEffort: string | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  /** The model that produced the text. */
  model: string;
}

function endpointsFrom(baseUrl: string | undefined, apiKey: string | undefined, models: string | undefined): LlmEndpoint[] {
  const url = baseUrl?.trim().replace(/\/+$/, '');
  const key = apiKey?.trim();
  if (!url || !key) return [];
  return (models ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map((model) => ({ baseUrl: url, apiKey: key, model }));
}

/** Returns null when no endpoint is configured, in which case the route serves the cached report. */
export function getLlmConfig(): LlmConfig | null {
  const endpoints = [
    ...endpointsFrom(process.env.LLM_BASE_URL, process.env.LLM_API_KEY, process.env.LLM_MODEL),
    ...endpointsFrom(process.env.LLM_FALLBACK_BASE_URL, process.env.LLM_FALLBACK_API_KEY, process.env.LLM_FALLBACK_MODEL),
  ];
  if (endpoints.length === 0) return null;
  return { endpoints, reasoningEffort: process.env.LLM_REASONING_EFFORT?.trim() || null };
}

/**
 * `reasoning_effort` for a model. Unset: "low" for gpt-oss models, which accept the parameter and otherwise spend
 * the token limit on reasoning and return empty or cut-off text; nothing for other models.
 */
function reasoningEffortFor(cfg: LlmConfig, model: string): string | null {
  if (cfg.reasoningEffort) return cfg.reasoningEffort === 'none' ? null : cfg.reasoningEffort;
  return /gpt-oss/i.test(model) ? 'low' : null;
}

/** Provider answered with an HTTP error. 429 = rate limit on a free tier. */
export class LlmHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfterSeconds: number | null,
    public readonly model: string,
  ) {
    super(`LLM provider returned HTTP ${status} for ${model}`);
    this.name = 'LlmHttpError';
  }
}

/** Timeout matches docs/CONTRACTS.md section 7: after 25 s the route falls back to the cached report. */
export const LLM_TIMEOUT_MS = 25_000;

async function completeWith(
  cfg: LlmConfig,
  endpoint: LlmEndpoint,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number },
  timeoutMs: number,
): Promise<string> {
  const effort = reasoningEffortFor(cfg, endpoint.model);
  const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 900,
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new LlmHttpError(res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null, endpoint.model);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error(`LLM provider returned an empty completion for ${endpoint.model}`);
  return text;
}

/**
 * One completion. Tries the configured endpoints in order and returns the first answer; the whole call shares one
 * time budget. Throws the last error when every endpoint fails; the caller then serves the cached report.
 */
export async function chatCompletion(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? LLM_TIMEOUT_MS);
  let lastError: unknown = new Error('no LLM endpoint configured');
  for (const endpoint of cfg.endpoints) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    try {
      return { text: await completeWith(cfg, endpoint, messages, opts, remaining), model: endpoint.model };
    } catch (e) {
      lastError = e;
      console.warn(`[llm] ${endpoint.model} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw lastError;
}
