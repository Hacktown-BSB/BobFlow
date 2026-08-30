/**
 * CodeIntelligenceService
 *
 * Public facade for the Code Intelligence layer.
 *
 * Usage:
 *   const svc = createCodeIntelligenceService();
 *   const ctx = await svc.enrich({ input, triageResult, repositoryPath });
 *
 * Configuration (env vars):
 *   CODE_INTELLIGENCE_PROVIDER=graphify   (default) — uses Graphify CLI
 *   CODE_INTELLIGENCE_PROVIDER=mock       — uses mock fixture (tests/fallback)
 *   GRAPHIFY_REPO_PATH                    — default repository path when
 *                                           repositoryPath is not passed per-call
 *
 * The service:
 *   - Injects the configured provider
 *   - Wraps every provider call in a try/catch (providers must not throw,
 *     but this is a second safety net)
 *   - Enforces output budgets (relevantSymbols ≤ 10, etc.)
 *   - Never throws — always returns a CodeContext
 */

import type { CodeContext, CodeGraphProvider, CodeIntelligenceInput } from './types.js';
import { MockCodeGraphProvider }    from './providers/mock.js';
import { GraphifyCodeGraphProvider } from './providers/graphify.js';

// ── Budget constants ──────────────────────────────────────────────────────────

const MAX_SYMBOLS  = 10;
const MAX_FILES    = 5;
const MAX_PATHS    = 3;
const MAX_IMPACTED = 10;
const MAX_EVIDENCE = 10;

// ── Budget enforcement ────────────────────────────────────────────────────────

function applyBudget(ctx: CodeContext): CodeContext {
  return {
    ...ctx,
    relevantSymbols:     ctx.relevantSymbols.slice(0, MAX_SYMBOLS),
    relevantFiles:       ctx.relevantFiles.slice(0, MAX_FILES),
    callPaths:           ctx.callPaths.slice(0, MAX_PATHS),
    potentiallyImpacted: ctx.potentiallyImpacted.slice(0, MAX_IMPACTED),
    evidence:            ctx.evidence.slice(0, MAX_EVIDENCE),
  };
}

// ── Error context helper ──────────────────────────────────────────────────────

function serviceErrorContext(requestId: string, message: string): CodeContext {
  return {
    requestId,
    status:              'error',
    repository:          null,
    ref:                 null,
    relevantSymbols:     [],
    relevantFiles:       [],
    relations:           [],
    callPaths:           [],
    potentiallyImpacted: [],
    summary:             `Code Intelligence unavailable: ${message}`,
    evidence:            [],
    provider:            'service-error',
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CodeIntelligenceService {
  constructor(private readonly provider: CodeGraphProvider) {}

  /**
   * Enriches a triage result with structural code context.
   * Never throws — returns an error CodeContext on any failure.
   */
  async enrich(input: CodeIntelligenceInput): Promise<CodeContext> {
    const requestId = input.input.request_id;
    try {
      const ctx = await this.provider.getContext(input);
      return applyBudget(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[code-intelligence] provider "${this.provider.name}" threw:`, message);
      return serviceErrorContext(requestId, message);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates the CodeIntelligenceService with the provider selected by
 * CODE_INTELLIGENCE_PROVIDER env var.
 *
 * @param providerOverride — inject a specific provider (useful in tests)
 */
export function createCodeIntelligenceService(
  providerOverride?: CodeGraphProvider,
): CodeIntelligenceService {
  if (providerOverride) {
    return new CodeIntelligenceService(providerOverride);
  }

  const providerName = process.env['CODE_INTELLIGENCE_PROVIDER'] ?? 'graphify';

  switch (providerName) {
    case 'mock':
      return new CodeIntelligenceService(new MockCodeGraphProvider());
    case 'graphify':
    default:
      return new CodeIntelligenceService(new GraphifyCodeGraphProvider());
  }
}
