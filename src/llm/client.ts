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

/**
 * Reads an env var, tolerating trailing whitespace and inline `# comments`
 * (which corrupt values in naive .env loaders). Falls back to `def` when unset
 * or empty. Only strips a `#` preceded by whitespace, so secrets like `a#b`
 * are preserved.
 */
function cleanEnv(v: string | undefined, def: string): string {
  if (v == null) return def;
  return v.replace(/\s+#.*$/, '').trim() || def;
}

export function createLLMClient(): LLMClient {
  const baseUrl   = cleanEnv(process.env['LLM_BASE_URL'], 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey    = cleanEnv(process.env['LLM_API_KEY'], '');
  const model     = cleanEnv(process.env['LLM_MODEL'], 'gpt-4o');
  const embedModel = cleanEnv(process.env['LLM_EMBED_MODEL'], 'text-embedding-3-small');
  const teamId    = cleanEnv(process.env['LLM_TEAM_ID'], '') || undefined;   // optional
  // LLM_AUTH_STYLE=apikey (default) sends X-API-Key; bearer sends Authorization: Bearer
  const authStyle = cleanEnv(process.env['LLM_AUTH_STYLE'], 'apikey') as 'apikey' | 'bearer';

  // Provider detection: IBM watsonx.ai speaks IAM auth + /ml/v1/text/chat, NOT
  // OpenAI's /chat/completions. Auto-detect by host, or force with LLM_PROVIDER.
  const provider = cleanEnv(process.env['LLM_PROVIDER'], '').toLowerCase()
    || (/\.ml\.cloud\.ibm\.com/i.test(baseUrl) ? 'watsonx' : 'openai');

  if (provider === 'watsonx') {
    const projectId = cleanEnv(process.env['LLM_PROJECT_ID'], '')
      || cleanEnv(process.env['WATSONX_PROJECT_ID'], '')
      || cleanEnv(process.env['project_id'], '');
    if (!apiKey)    throw new Error('[llm] watsonx requires LLM_API_KEY');
    if (!model)     throw new Error('[llm] watsonx requires LLM_MODEL (watsonx model_id, e.g. meta-llama/llama-3-3-70b-instruct)');
    if (!projectId) throw new Error('[llm] watsonx requires a project id (set LLM_PROJECT_ID or project_id)');
    return createWatsonxClient({ baseUrl, apiKey, model, embedModel, projectId });
  }

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

// ── watsonx.ai client ──────────────────────────────────────────────────────────
// IBM watsonx.ai: IAM-authenticated, model_id + project_id, /ml/v1/text/chat.
// The chat response is OpenAI-shaped (choices[0].message.content), so callers
// that already parse that field work unchanged.

interface WatsonxConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  embedModel: string;
  projectId: string;
}

function createWatsonxClient(cfg: WatsonxConfig): LLMClient {
  const version = cleanEnv(process.env['WATSONX_VERSION'], '2023-05-29');

  return { complete, embed };

  async function complete(
    params: { system: string; user: string; max_tokens?: number },
  ): Promise<string> {
    const token = await getIamToken(cfg.apiKey);
    const result = await fetchWithRetry(`${cfg.baseUrl}/ml/v1/text/chat?version=${version}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        model_id:   cfg.model,
        project_id: cfg.projectId,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user',   content: params.user   },
        ],
        temperature: 0,
        ...(params.max_tokens != null ? { max_tokens: params.max_tokens } : {}),
      }),
    });
    const content = (result as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    if (content == null) throw new Error('watsonx response missing choices[0].message.content');
    return content;
  }

  async function embed(text: string): Promise<number[]> {
    const token = await getIamToken(cfg.apiKey);
    const result = await fetchWithRetry(`${cfg.baseUrl}/ml/v1/text/embeddings?version=${version}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ model_id: cfg.embedModel, project_id: cfg.projectId, inputs: [text] }),
    });
    const vector = (result as { results?: Array<{ embedding?: number[] }> })
      .results?.[0]?.embedding;
    if (vector == null) throw new Error('watsonx response missing results[0].embedding');
    return vector;
  }
}

// ── IBM Cloud IAM token cache ────────────────────────────────────────────────
// watsonx needs a short-lived IAM bearer token exchanged from the API key.
// Cache per key and refresh a minute before expiry to avoid a round-trip per call.

interface CachedToken { token: string; expiresAt: number; }
const _iamTokens = new Map<string, CachedToken>();

async function getIamToken(apiKey: string): Promise<string> {
  const now = Date.now();
  const cached = _iamTokens.get(apiKey);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM token exchange failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('IAM token exchange missing access_token');
  _iamTokens.set(apiKey, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
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
