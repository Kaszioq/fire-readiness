// Provider-agnostic client for any OpenAI-compatible chat completions endpoint.
// Configured only by env vars (see .env.example). Server-side only: never import from client components.

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Returns null when the env vars are missing, in which case the route serves the cached report. */
export function getLlmConfig(): LlmConfig | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model };
}

/** Timeout matches docs/CONTRACTS.md section 7: after 25 s the route falls back to the cached report. */
export const LLM_TIMEOUT_MS = 25_000;

export async function chatCompletion(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 900,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? LLM_TIMEOUT_MS),
  });
  if (!res.ok) {
    // 429 = rate limit on a free tier. The caller falls back to the cached report.
    throw new Error(`LLM provider returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('LLM provider returned an empty completion');
  return text;
}
