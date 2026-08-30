/**
 * Code Intelligence — unit tests
 *
 * Uses Node.js built-in test runner (same pattern as existing tests).
 * All tests are isolated — no real Graphify CLI calls, no real filesystem I/O.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CodeContext, CodeGraphProvider, CodeIntelligenceInput } from '../src/context/types.js';
import { MockCodeGraphProvider }     from '../src/context/providers/mock.js';
import { CodeIntelligenceService, createCodeIntelligenceService } from '../src/context/service.js';
import { createIssue }               from '../src/agents/issue.js';
import type { TriageResult }          from '../src/db/schema.js';
import type { TriageInput }           from '../src/triage/port.js';

// ── smoke test guard ──────────────────────────────────────────────────────────
//
// Returns a skip reason string when smoke prerequisites are not met,
// or false (no skip) when everything is in place.
// Used as the `skip` option on the smoke test.

function smokeSkipReason(): string | false {
  if (!process.env['GRAPHIFY_SMOKE_TEST']) {
    return 'set GRAPHIFY_SMOKE_TEST=1 to enable';
  }
  // Check CLI availability
  try {
    execFileSync('graphify', ['--version'], { timeout: 5_000, stdio: 'pipe' });
  } catch {
    return 'graphify CLI not available in PATH';
  }
  // Check graph.json exists
  const repoPath = process.env['GRAPHIFY_REPO_PATH'] ?? process.cwd();
  const graphPath = join(repoPath, 'graphify-out', 'graph.json');
  if (!existsSync(graphPath)) {
    return `graph.json not found at ${graphPath} — run: graphify extract ${repoPath} --code-only --no-cluster`;
  }
  return false;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeTriageInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    request_id:          'req-001',
    normalized_message:  'Login returns 500 after UserService change',
    intent:              'login returns 500',
    domain_hint:         'SOFTWARE',
    system_hint:         'auth',
    module_hint:         'login',
    is_complete:         true,
    clarification_round: 0,
    notes:               null,
    created_at:          new Date().toISOString(),
    ...overrides,
  };
}

function makeTriageResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    request_id:             'req-001',
    domain:                 'SOFTWARE',
    system:                 'auth',
    module:                 'login',
    confidence:             0.9,
    evidence:               ['keyword: UserService', 'keyword: login'],
    priority:               'HIGH',
    priority_scores: {
      urgency: 3, users_affected: 2, customer_impact: 2,
      financial_impact: 1, security_flag: 0, workaround: 1, criticality: 2,
    },
    route:                  'engineering',
    is_duplicate:           false,
    correlated_request_ids: [],
    requires_human:         false,
    triaged_at:             new Date().toISOString(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<CodeIntelligenceInput> = {}): CodeIntelligenceInput {
  return {
    input:         makeTriageInput(),
    triageResult:  makeTriageResult(),
    repositoryPath: '/tmp/demo-repo',
    ...overrides,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<CodeContext> = {}): CodeContext {
  return {
    requestId:            'req-001',
    status:               'accessible',
    repository:           '/tmp/demo-repo',
    ref:                  null,
    relevantSymbols:      ['AuthController', 'UserService'],
    relevantFiles:        ['src/auth/AuthController.ts'],
    relations:            [{ from: 'AuthController', to: 'UserService', kind: 'calls' }],
    callPaths:            ['AuthController -> UserService'],
    potentiallyImpacted:  ['LoginController'],
    summary:              'Found 2 relevant symbols.',
    evidence:             ['query: login UserService'],
    provider:             'test',
    ...overrides,
  };
}

// ── MockCodeGraphProvider ─────────────────────────────────────────────────────

describe('MockCodeGraphProvider', () => {
  it('returns a CodeContext with request_id from input', async () => {
    const provider = new MockCodeGraphProvider();
    const ctx = await provider.getContext(makeInput());
    assert.equal(ctx.requestId, 'req-001');
    assert.equal(ctx.status, 'accessible');
    assert.ok(ctx.relevantSymbols.length > 0);
    assert.ok(ctx.relevantFiles.length > 0);
    assert.ok(ctx.callPaths.length > 0);
    assert.equal(ctx.provider, 'mock');
  });

  it('always returns accessible status', async () => {
    const provider = new MockCodeGraphProvider();
    const ctx = await provider.getContext(makeInput({ repositoryPath: undefined }));
    assert.equal(ctx.status, 'accessible');
  });
});

// ── CodeIntelligenceService — budget enforcement ──────────────────────────────

describe('CodeIntelligenceService budget enforcement', () => {
  it('caps relevantSymbols at 10', async () => {
    const bigCtx = makeContext({
      relevantSymbols: Array.from({ length: 20 }, (_, i) => `Symbol${i}`),
    });
    const provider: CodeGraphProvider = {
      name: 'test',
      async getContext() { return bigCtx; },
    };
    const svc = new CodeIntelligenceService(provider);
    const result = await svc.enrich(makeInput());
    assert.equal(result.relevantSymbols.length, 10);
  });

  it('caps relevantFiles at 5', async () => {
    const bigCtx = makeContext({
      relevantFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`),
    });
    const provider: CodeGraphProvider = {
      name: 'test',
      async getContext() { return bigCtx; },
    };
    const svc = new CodeIntelligenceService(provider);
    const result = await svc.enrich(makeInput());
    assert.equal(result.relevantFiles.length, 5);
  });

  it('caps callPaths at 3', async () => {
    const bigCtx = makeContext({
      callPaths: ['A -> B', 'B -> C', 'C -> D', 'D -> E', 'E -> F'],
    });
    const provider: CodeGraphProvider = {
      name: 'test',
      async getContext() { return bigCtx; },
    };
    const svc = new CodeIntelligenceService(provider);
    const result = await svc.enrich(makeInput());
    assert.equal(result.callPaths.length, 3);
  });

  it('caps potentiallyImpacted at 10', async () => {
    const bigCtx = makeContext({
      potentiallyImpacted: Array.from({ length: 25 }, (_, i) => `Node${i}`),
    });
    const provider: CodeGraphProvider = {
      name: 'test',
      async getContext() { return bigCtx; },
    };
    const svc = new CodeIntelligenceService(provider);
    const result = await svc.enrich(makeInput());
    assert.equal(result.potentiallyImpacted.length, 10);
  });
});

// ── CodeIntelligenceService — fallback on provider error ─────────────────────

describe('CodeIntelligenceService fallback', () => {
  it('returns error CodeContext when provider throws', async () => {
    const broken: CodeGraphProvider = {
      name: 'broken',
      async getContext() { throw new Error('provider boom'); },
    };
    const svc = new CodeIntelligenceService(broken);
    const result = await svc.enrich(makeInput());
    assert.equal(result.status, 'error');
    assert.ok(result.summary.includes('provider boom'));
    assert.equal(result.relevantSymbols.length, 0);
  });

  it('does not throw even when provider throws synchronously', async () => {
    const broken: CodeGraphProvider = {
      name: 'broken-sync',
      getContext() { throw new Error('sync throw'); },
    };
    const svc = new CodeIntelligenceService(broken);
    // Should not throw
    const result = await svc.enrich(makeInput());
    assert.equal(result.status, 'error');
  });
});

// ── CodeIntelligenceService — status pass-through ────────────────────────────

describe('CodeIntelligenceService status pass-through', () => {
  for (const status of ['accessible', 'no_match', 'inaccessible', 'error'] as const) {
    it(`passes through status="${status}"`, async () => {
      const provider: CodeGraphProvider = {
        name: 'stub',
        async getContext() { return makeContext({ status }); },
      };
      const svc = new CodeIntelligenceService(provider);
      const result = await svc.enrich(makeInput());
      assert.equal(result.status, status);
    });
  }
});

// ── createCodeIntelligenceService factory ─────────────────────────────────────

describe('createCodeIntelligenceService factory', () => {
  beforeEach(() => {
    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
  });

  it('returns a service with a provider when given an override', async () => {
    const provider = new MockCodeGraphProvider();
    const svc = createCodeIntelligenceService(provider);
    const result = await svc.enrich(makeInput());
    assert.equal(result.provider, 'mock');
  });

  it('uses mock provider when CODE_INTELLIGENCE_PROVIDER=mock', async () => {
    process.env['CODE_INTELLIGENCE_PROVIDER'] = 'mock';
    const svc = createCodeIntelligenceService();
    const result = await svc.enrich(makeInput());
    assert.equal(result.provider, 'mock');
    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
  });
});

// ── GraphifyCodeGraphProvider — structural (no real CLI) ─────────────────────

describe('GraphifyCodeGraphProvider — structural', () => {
  it('returns inaccessible when repositoryPath is undefined', async () => {
    const { GraphifyCodeGraphProvider } = await import('../src/context/providers/graphify.js');
    const provider = new GraphifyCodeGraphProvider();
    const result = await provider.getContext(makeInput({ repositoryPath: undefined }));
    assert.equal(result.status, 'inaccessible');
  });

  it('returns inaccessible when repository path does not exist', async () => {
    const { GraphifyCodeGraphProvider } = await import('../src/context/providers/graphify.js');
    const provider = new GraphifyCodeGraphProvider();
    const result = await provider.getContext(makeInput({ repositoryPath: '/nonexistent/path' }));
    assert.equal(result.status, 'inaccessible');
  });
});

// ── Graphify smoke test (optional — requires GRAPHIFY_SMOKE_TEST=1) ───────────
//
// Run with:  GRAPHIFY_SMOKE_TEST=1 node --test dist/tests/code-intelligence.test.js
//
// Prerequisites checked at runtime:
//   - graphify CLI available in PATH
//   - graph.json present at repositoryPath/graphify-out/graph.json
//   - GRAPHIFY_REPO_PATH set, or process.cwd() contains a graph

describe('GraphifyCodeGraphProvider — smoke (real CLI)', () => {
  it('no_match for impossible query on real graph', { skip: smokeSkipReason() }, async () => {
    const { GraphifyCodeGraphProvider } = await import('../src/context/providers/graphify.js');
    const provider = new GraphifyCodeGraphProvider();
    const repoPath = process.env['GRAPHIFY_REPO_PATH'] ?? process.cwd();
    const result = await provider.getContext(makeInput({
      repositoryPath: repoPath,
      input: makeTriageInput({
        normalized_message: 'xyzzy impossible symbol name that cannot match',
        intent:             'xyzzy',
      }),
    }));
    assert.ok(['no_match', 'accessible'].includes(result.status),
      `expected no_match or accessible, got "${result.status}": ${result.summary}`);
  });
});

// ── Issue Agent — IssueResult contract compliance ─────────────────────────────

describe('Issue Agent — IssueResult contract', () => {
  it('returns a valid IssueResult with accessible code context (mock provider)', async () => {
    // Force mock provider so we do not depend on Graphify during unit tests
    process.env['CODE_INTELLIGENCE_PROVIDER'] = 'mock';
    process.env['GRAPHIFY_REPO_PATH'] = '/tmp/does-not-exist';

    const result = await createIssue(makeTriageInput(), makeTriageResult());

    assert.ok(result.issue_id);
    assert.equal(result.request_id, 'req-001');
    assert.equal(result.issue_type, 'BUG');
    assert.ok(result.analysis);
    assert.ok(typeof result.confidence === 'number');
    assert.ok(Array.isArray(result.evidence));
    assert.ok(result.github_issue !== null);
    assert.ok(result.github_issue!.title.includes('SOFTWARE'));
    assert.ok(Array.isArray(result.github_issue!.labels));
    assert.ok(result.github_issue!.labels.includes('software'));

    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
    delete process.env['GRAPHIFY_REPO_PATH'];
  });

  it('sets issue_type=INCIDENT for SECURITY domain', async () => {
    process.env['CODE_INTELLIGENCE_PROVIDER'] = 'mock';
    const result = await createIssue(
      makeTriageInput(),
      makeTriageResult({ domain: 'SECURITY' }),
    );
    assert.equal(result.issue_type, 'INCIDENT');
    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
  });

  it('sets requires_human_approval=true for CRITICAL priority', async () => {
    process.env['CODE_INTELLIGENCE_PROVIDER'] = 'mock';
    const result = await createIssue(
      makeTriageInput(),
      makeTriageResult({ priority: 'CRITICAL' }),
    );
    assert.equal(result.requires_human_approval, true);
    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
  });

  it('sets classification=DUPLICATE when triageResult.is_duplicate=true', async () => {
    process.env['CODE_INTELLIGENCE_PROVIDER'] = 'mock';
    const result = await createIssue(
      makeTriageInput(),
      makeTriageResult({ is_duplicate: true, correlated_request_ids: ['req-000'] }),
    );
    assert.equal(result.classification, 'DUPLICATE');
    assert.deepEqual(result.correlated_request_ids, ['req-000']);
    delete process.env['CODE_INTELLIGENCE_PROVIDER'];
  });
});
