// ─── LLM Client Interface ─────────────────────────────────────────────────────

export interface LLMResponse {
  content: string;
  model: string;
  finish_reason: 'stop' | 'length' | 'error';
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMClient {
  /**
   * Send a prompt and receive a completion.
   */
  complete(prompt: string): Promise<LLMResponse>;

  /**
   * Embed a text string into a vector representation.
   */
  embed(text: string): Promise<number[]>;
}

// ─── MockLLMClient ────────────────────────────────────────────────────────────

export interface MockFixtures {
  /** If set, `complete()` will return this content verbatim. */
  completeContent?: string;
  /** If set, `embed()` will return this vector. */
  embedding?: number[];
}

export class MockLLMClient implements LLMClient {
  private fixtures: MockFixtures;

  constructor(fixtures: MockFixtures = {}) {
    this.fixtures = fixtures;
  }

  async complete(prompt: string): Promise<LLMResponse> {
    return {
      content: this.fixtures.completeContent ?? `Mock response for: ${prompt.slice(0, 80)}`,
      model: 'mock-model-1.0',
      finish_reason: 'stop',
      usage: {
        prompt_tokens: Math.ceil(prompt.length / 4),
        completion_tokens: 32,
        total_tokens: Math.ceil(prompt.length / 4) + 32,
      },
    };
  }

  async embed(text: string): Promise<number[]> {
    if (this.fixtures.embedding) {
      return this.fixtures.embedding;
    }
    // Deterministic 8-dim pseudo-embedding based on character codes
    const vec = new Array<number>(8).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 8] = (vec[i % 8] + text.charCodeAt(i)) % 1000;
    }
    return vec.map((v) => v / 1000);
  }

  /** Override fixtures at runtime (useful in tests). */
  setFixtures(fixtures: MockFixtures): void {
    this.fixtures = fixtures;
  }
}
