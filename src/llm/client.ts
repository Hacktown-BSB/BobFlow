/**
 * LLM HTTP client — OpenAI-compatible, configured by env vars.
 * Works against any OpenAI-compatible endpoint (plain OpenAI, Azure, Bob inference API, etc.).
 * Bob inference API (General API key): pass LLM_TEAM_ID to send the X-Team-ID header.
 * Bob inference API (Inference API key): LLM_TEAM_ID is not required.
 */
export interface LLMClient {
  complete(params: { system: string; user: string; max_tokens?: number }): Promise<string>;
}

const TIMEOUT_MS = 60_000;   // §06_workflow_architecture AGENT_EXECUTING budget

export function createLLMClient(): LLMClient {
  const baseUrl = (process.env['LLM_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey  = process.env['LLM_API_KEY']  ?? '';
  const model   = process.env['LLM_MODEL']    ?? 'gpt-4o';
  const teamId  = process.env['LLM_TEAM_ID'];   // optional — only sent when set

  return { complete };

  async function complete(
    params: { system: string; user: string; max_tokens?: number },
  ): Promise<string> {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user',   content: params.user   },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
      ...(params.max_tokens != null ? { max_tokens: params.max_tokens } : {}),
    });

    const headers: Record<string, string> = {
      'Content-Type':  'application/json',
      'X-API-Key': apiKey,
    };
    if (teamId) headers['X-Team-ID'] = teamId;

    const result = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method:  'POST',
      headers,
      body,
    });

    const choice = (result as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    if (choice == null) throw new Error('LLM response missing choices[0].message.content');
    return choice;
  }
}

// ── internal helpers ───────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1_000));
    }
  }
  throw lastErr;
}
