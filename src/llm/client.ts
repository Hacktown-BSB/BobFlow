/**
 * LLM HTTP client — OpenAI-compatible, configured by env vars.
 * Works against any OpenAI-compatible endpoint (plain OpenAI, Azure, Bob inference API, etc.).
 * Bob inference API (General API key): pass LLM_TEAM_ID to send the X-Team-ID header.
 * Bob inference API (Inference API key): LLM_TEAM_ID is not required.
 */
export interface LLMClient {
  complete(params: { system: string; user: string; max_tokens?: number }): Promise<string>;
  /**
   * Embed a text string into a vector representation.
   * Restored from PR #2 packages/llm-client — required by 09_incident_model.md
   * (cosine-similarity correlation) and by KB semantic search.
   */
  embed(text: string): Promise<number[]>;
}

const TIMEOUT_MS = 60_000;   // §06_workflow_architecture AGENT_EXECUTING budget

export function createLLMClient(): LLMClient {
  const baseUrl   = (process.env['LLM_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey    = process.env['LLM_API_KEY']  ?? '';
  const model     = process.env['LLM_MODEL']    ?? 'gpt-4o';
  const embedModel = process.env['LLM_EMBED_MODEL'] ?? 'text-embedding-3-small';
  const teamId    = process.env['LLM_TEAM_ID'];   // optional — only sent when set
  // LLM_AUTH_STYLE=apikey (default) sends X-API-Key; bearer sends Authorization: Bearer
  const authStyle = (process.env['LLM_AUTH_STYLE'] ?? 'apikey') as 'apikey' | 'bearer';

  return { complete, embed };

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
      'Content-Type': 'application/json',
      ...(authStyle === 'bearer'
        ? { 'Authorization': `Bearer ${apiKey}` }
        : { 'X-API-Key': apiKey }),
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

  async function embed(text: string): Promise<number[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authStyle === 'bearer'
        ? { 'Authorization': `Bearer ${apiKey}` }
        : { 'X-API-Key': apiKey }),
    };
    if (teamId) headers['X-Team-ID'] = teamId;

    const result = await fetchWithRetry(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: embedModel, input: text }),
    });

    const vector = (result as { data?: Array<{ embedding?: number[] }> })
      .data?.[0]?.embedding;
    if (vector == null) throw new Error('LLM response missing data[0].embedding');
    return vector;
  }
}

// ── MockLLMClient ─────────────────────────────────────────────────────────────
// Restored from PR #2 packages/llm-client. Deterministic, no network.

export interface MockFixtures {
  /** If set, complete() returns this content verbatim. */
  completeContent?: string;
  /** If set, embed() returns this vector. */
  embedding?: number[];
}

export class MockLLMClient implements LLMClient {
  private fixtures: MockFixtures;

  constructor(fixtures: MockFixtures = {}) {
    this.fixtures = fixtures;
  }

  async complete(params: { system: string; user: string; max_tokens?: number }): Promise<string> {
    return this.fixtures.completeContent ?? `{"mock":"response for: ${params.user.slice(0, 60)}"}`;
  }

  async embed(text: string): Promise<number[]> {
    if (this.fixtures.embedding) return this.fixtures.embedding;
    // Deterministic 8-dim pseudo-embedding based on character codes.
    const vec = new Array<number>(8).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 8] = (vec[i % 8]! + text.charCodeAt(i)) % 1000;
    }
    return vec.map((v) => v / 1000);
  }

  /** Override fixtures at runtime (useful in tests). */
  setFixtures(fixtures: MockFixtures): void {
    this.fixtures = fixtures;
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
