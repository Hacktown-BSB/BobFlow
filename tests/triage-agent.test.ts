/**
 * Triage Agent tests — covers the four primary demo scenarios from 16_demo_strategy.md.
 *
 * All tests run with TRIAGE_MODE=mock (default) — no LLM calls.
 * Assertions cover: domain, priority, route (AgentRoute), requires_human, confidence.
 * Also validates triage → getRoute() handoff (AgentServiceRoute).
 *
 * Additional coverage:
 *   - createIssue() with CODE_INTELLIGENCE_PROVIDER=mock (accessible context):
 *       verifies the demo path — requires_human_approval=false, body references
 *       real code symbols, labels exclude 'needs-investigation'.
 *   - createIssue() degraded path (inaccessible context):
 *       verifies honest fallback — requires_human_approval=true, confidence=0,
 *       labels include 'needs-investigation'.
 *   - Triage LLM path (TRIAGE_MODE=llm) with MockLLMClient: verifies LLM output
 *     is parsed and refined_signals are merged.
 *   - Triage LLM path failure: verifies graceful degradation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { runTriage, setLLMClient } from '../src/agents/triage.js';
import { createIssue, setCodeIntelligenceService } from '../src/agents/issue.js';
import { getRoute } from '../src/orchestrator/router.js';
import { MockLLMClient } from '../src/llm/client.js';
import { createCodeIntelligenceService } from '../src/context/service.js';
import { MockCodeGraphProvider } from '../src/context/providers/mock.js';
import type { TriageInput } from '../src/triage/port.js';
import type { CodeGraphProvider, CodeIntelligenceInput, CodeContext } from '../src/context/types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    request_id:          randomUUID(),
    normalized_message:  'test message',
    intent:              'test intent',
    domain_hint:         null,
    system_hint:         null,
    module_hint:         null,
    is_complete:         true,
    clarification_round: 0,
    notes:               null,
    created_at:          new Date().toISOString(),
    ...overrides,
  };
}

// Ensure TRIAGE_MODE stays mock for all tests in this file
const originalTriageMode = process.env['TRIAGE_MODE'];
const originalIssueMode  = process.env['ISSUE_MODE'];

before(() => {
  // Force mock mode — tests must not depend on a live LLM
  process.env['TRIAGE_MODE'] = 'mock';
  process.env['ISSUE_MODE']  = 'mock';
});

after(() => {
  if (originalTriageMode === undefined) delete process.env['TRIAGE_MODE'];
  else process.env['TRIAGE_MODE'] = originalTriageMode;
  if (originalIssueMode === undefined) delete process.env['ISSUE_MODE'];
  else process.env['ISSUE_MODE'] = originalIssueMode;
});

// ── Demo scenario tests ───────────────────────────────────────────────────────

describe('triage-agent — four demo scenarios', () => {

  it('(1) SOFTWARE / ERP 500 → domain=SOFTWARE, priority≥HIGH, route=engineering, AgentServiceRoute=issue', async () => {
    const input = makeInput({
      // Exact demo message from 16_demo_strategy.md / priority-scoring tests (score ≥40 → HIGH)
      normalized_message: 'Everyone on the finance team is blocked — ERP invoices for clients are failing',
      intent:             'Report critical ERP error — whole team blocked',
      domain_hint:        'SOFTWARE',
      system_hint:        'ERP',
    });

    const result = await runTriage(input);

    assert.equal(result.domain, 'SOFTWARE');
    assert.ok(['HIGH', 'CRITICAL'].includes(result.priority),
      `priority should be HIGH or CRITICAL, got: ${result.priority}`);
    assert.equal(result.route, 'engineering');
    assert.ok(result.confidence >= 0.5, `confidence should be ≥0.5, got: ${result.confidence}`);
    assert.ok(result.evidence.length > 0, 'evidence array should not be empty');

    // getRoute() uses AgentServiceRoute type space — 'issue' for SOFTWARE
    assert.equal(getRoute(result), 'issue');
  });

  it('(2) HARDWARE / printer broken → domain=HARDWARE, priority=LOW, route=ticket, AgentServiceRoute=ticket', async () => {
    const input = makeInput({
      normalized_message: "my printer won't turn on",
      intent:             'Report a hardware problem',
      domain_hint:        'HARDWARE',
    });

    const result = await runTriage(input);

    assert.equal(result.domain, 'HARDWARE');
    // Deterministic: urgency=0, users_affected=1, workaround=5, criticality=1 → composite=9 → LOW
    assert.equal(result.priority, 'LOW',
      `priority should be LOW (composite=9), got: ${result.priority}`);
    assert.equal(result.route, 'ticket');
    assert.ok(result.confidence >= 0.5, `confidence should be ≥0.5, got: ${result.confidence}`);

    assert.equal(getRoute(result), 'ticket');
  });

  it('(3) QUESTION / tool usage → domain=QUESTION, priority=INFORMATIONAL, route=knowledge, AgentServiceRoute=knowledge', async () => {
    const input = makeInput({
      normalized_message: 'how do I use Confluence?',
      intent:             'Question about a tool',
      domain_hint:        'QUESTION',
    });

    const result = await runTriage(input);

    assert.equal(result.domain, 'QUESTION');
    // QUESTION domain: workaround defaults to 5 (no workaround mentioned) which
    // adds 5 points — composite may reach LOW band (5–19). Accept INFORMATIONAL or LOW.
    assert.ok(['INFORMATIONAL', 'LOW'].includes(result.priority),
      `priority should be INFORMATIONAL or LOW, got: ${result.priority}`);
    assert.equal(result.route, 'knowledge');
    assert.ok(result.confidence >= 0.5, `confidence should be ≥0.5, got: ${result.confidence}`);

    assert.equal(getRoute(result), 'knowledge');
  });

  it('(4) UNKNOWN / ambiguous → domain=UNKNOWN, requires_human=true', async () => {
    const input = makeInput({
      normalized_message: "I don't know what happened",
      intent:             'describe an unknown situation',
      domain_hint:        null,  // no hint → UNKNOWN
    });

    const result = await runTriage(input);

    assert.equal(result.domain, 'UNKNOWN');
    assert.equal(result.requires_human, true,
      'UNKNOWN domain with low confidence must set requires_human=true');
  });

});

// ── Issue Agent demo path (CODE_INTELLIGENCE_PROVIDER=mock → accessible context) ─

describe('triage-agent — Issue Agent (accessible code context)', () => {

  it('(5) SOFTWARE / accessible context → github_issue populated, requires_human_approval=false, body references code symbols', async () => {
    // Inject the mock provider directly so the singleton is controlled regardless of env
    setCodeIntelligenceService(createCodeIntelligenceService(new MockCodeGraphProvider()));

    try {
      const input = makeInput({
        normalized_message: 'Everyone on the finance team is blocked — ERP invoices for clients are failing',
        intent:             'Report critical ERP error',
        domain_hint:        'SOFTWARE',
        system_hint:        'ERP',
        module_hint:        'invoice',
      });

      const triageResult = await runTriage(input);
      assert.equal(triageResult.domain, 'SOFTWARE');

      const issueResult = await createIssue(input, triageResult);

      // github_issue is populated
      assert.ok(issueResult.github_issue !== null, 'github_issue should be set');
      assert.ok(issueResult.github_issue!.title.startsWith('[SOFTWARE]'),
        `title should start with [SOFTWARE], got: ${issueResult.github_issue!.title}`);

      // labels are deterministic — domain + priority, no 'needs-investigation'
      assert.ok(issueResult.github_issue!.labels.includes('software'),
        'labels should include "software"');
      assert.ok(issueResult.github_issue!.labels.includes(triageResult.priority.toLowerCase()),
        `labels should include priority "${triageResult.priority.toLowerCase()}"`);
      assert.ok(!issueResult.github_issue!.labels.includes('needs-investigation'),
        'accessible context must NOT add "needs-investigation" label');

      // mock provider returns status=accessible → confidence=0.8 → requires_human_approval=false
      assert.equal(issueResult.requires_human_approval, false,
        `accessible context with non-CRITICAL priority should not require human approval`);

      // body references at least one real symbol from the mock CodeContext fixture
      const body = issueResult.github_issue!.body;
      const mockSymbols = ['AuthController', 'UserService', 'UserRepository'];
      assert.ok(
        mockSymbols.some(s => body.includes(s)),
        `body should reference at least one mock symbol (${mockSymbols.join(', ')}), got body:\n${body.slice(0, 300)}`,
      );
    } finally {
      // Reset to default (lazy) service so subsequent tests are unaffected
      setCodeIntelligenceService(createCodeIntelligenceService(new MockCodeGraphProvider()));
    }
  });

});

// ── Issue Agent degraded path (inaccessible context) ─────────────────────────

describe('triage-agent — Issue Agent (inaccessible code context)', () => {

  it('(5b) inaccessible context → requires_human_approval=true, confidence=0, needs-investigation label', async () => {
    // Provider that always returns inaccessible status
    const inaccessibleProvider: CodeGraphProvider = {
      name: 'test-inaccessible',
      async getContext(ci: CodeIntelligenceInput): Promise<CodeContext> {
        return {
          requestId:           ci.input.request_id,
          status:              'inaccessible',
          repository:          null,
          ref:                 null,
          relevantSymbols:     [],
          relevantFiles:       [],
          relations:           [],
          callPaths:           [],
          potentiallyImpacted: [],
          summary:             'Repository path not available in test environment.',
          evidence:            ['provider:test-inaccessible'],
          provider:            'test-inaccessible',
        };
      },
    };

    setCodeIntelligenceService(createCodeIntelligenceService(inaccessibleProvider));

    try {
      const input = makeInput({
        normalized_message: 'ERP error 500',
        intent:             'report bug',
        domain_hint:        'SOFTWARE',
      });

      const triageResult = await runTriage(input);
      const issueResult  = await createIssue(input, triageResult);

      // Honest degradation — everything is uncertain
      assert.equal(issueResult.confidence, 0,
        `inaccessible context should give confidence=0, got: ${issueResult.confidence}`);
      assert.equal(issueResult.requires_human_approval, true,
        'inaccessible context must set requires_human_approval=true');
      assert.ok(issueResult.github_issue!.labels.includes('needs-investigation'),
        'inaccessible context must add "needs-investigation" label');
    } finally {
      setCodeIntelligenceService(createCodeIntelligenceService(new MockCodeGraphProvider()));
    }
  });

});

// ── Triage LLM path tests (TRIAGE_MODE=llm with MockLLMClient) ───────────────

describe('triage-agent — LLM path with MockLLMClient', () => {

  it('(6) valid LLM response → domain, confidence, evidence, refined_signals all applied', async () => {
    const savedMode = process.env['TRIAGE_MODE'];
    process.env['TRIAGE_MODE'] = 'llm';

    const mockClient = new MockLLMClient({
      completeContent: JSON.stringify({
        domain:     'SOFTWARE',
        confidence: 0.95,
        evidence:   ['keyword: ERP', 'keyword: error 500'],
        system:     'ERP',
        module:     'invoice',
        refined_signals: {
          urgency:         5,
          users_affected:  5,
          criticality:     4,
          workaround:      5,
          customer_impact: 2,
          financial_impact: 2,
          security_flag:   0,
        },
      }),
    });
    setLLMClient(mockClient);

    try {
      const input = makeInput({
        normalized_message: 'ERP error 500 for all users',
        intent:             'report ERP error',
        domain_hint:        'SOFTWARE',
        system_hint:        'ERP',
      });

      const result = await runTriage(input);

      assert.equal(result.domain, 'SOFTWARE');
      assert.ok(result.confidence >= 0.9, `confidence should be ≥0.9, got: ${result.confidence}`);
      assert.equal(result.system, 'ERP');
      assert.equal(result.module, 'invoice');
      assert.ok(result.evidence.some(e => e.includes('refined_signals:from_llm')),
        'evidence should mention refined_signals:from_llm');
      // refined_signals merged → urgency=5 means HIGH/CRITICAL
      assert.ok(['HIGH', 'CRITICAL'].includes(result.priority),
        `priority should be HIGH or CRITICAL with refined_signals, got: ${result.priority}`);
      assert.equal(result.requires_human, false,
        'confidence 0.95 should not trigger requires_human');
    } finally {
      if (savedMode === undefined) delete process.env['TRIAGE_MODE'];
      else process.env['TRIAGE_MODE'] = savedMode;
      setLLMClient(new MockLLMClient());  // reset to default mock
    }
  });

  it('(7) LLM failure → graceful degradation, requires_human=true, no exception', async () => {
    const savedMode = process.env['TRIAGE_MODE'];
    process.env['TRIAGE_MODE'] = 'llm';

    // LLMClient that always throws
    const failingClient = {
      complete: async (_p: unknown): Promise<string> => {
        throw new Error('simulated network error');
      },
      embed: async (_t: unknown): Promise<number[]> => {
        throw new Error('simulated network error');
      },
    };
    setLLMClient(failingClient);

    try {
      const input = makeInput({
        normalized_message: 'ERP error 500',
        intent:             'report error',
        domain_hint:        'SOFTWARE',
      });

      const result = await runTriage(input);

      // Should not throw — must degrade gracefully
      assert.equal(result.domain, 'SOFTWARE',    'fallback domain should be domain_hint');
      assert.equal(result.requires_human, true,  'LLM failure must set requires_human=true');
      assert.ok(result.evidence.some(e => e.startsWith('llm_failure:')),
        'evidence should record LLM failure');
    } finally {
      if (savedMode === undefined) delete process.env['TRIAGE_MODE'];
      else process.env['TRIAGE_MODE'] = savedMode;
      setLLMClient(new MockLLMClient());
    }
  });

  it('(8) LLM returns invalid domain → falls back to domain_hint', async () => {
    const savedMode = process.env['TRIAGE_MODE'];
    process.env['TRIAGE_MODE'] = 'llm';

    setLLMClient(new MockLLMClient({
      completeContent: JSON.stringify({
        domain:     'INVALID_DOMAIN',
        confidence: 0.8,
        evidence:   ['some evidence'],
        system:     null,
        module:     null,
      }),
    }));

    try {
      const input = makeInput({
        normalized_message: 'printer broken',
        intent:             'hardware issue',
        domain_hint:        'HARDWARE',
      });

      const result = await runTriage(input);

      // INVALID_DOMAIN not in VALID_DOMAINS → falls back to domain_hint
      assert.equal(result.domain, 'HARDWARE', 'invalid LLM domain should fall back to domain_hint');
    } finally {
      if (savedMode === undefined) delete process.env['TRIAGE_MODE'];
      else process.env['TRIAGE_MODE'] = savedMode;
      setLLMClient(new MockLLMClient());
    }
  });

  it('(9) LLM refined_signals with out-of-range values are ignored', async () => {
    const savedMode = process.env['TRIAGE_MODE'];
    process.env['TRIAGE_MODE'] = 'llm';

    setLLMClient(new MockLLMClient({
      completeContent: JSON.stringify({
        domain:     'SOFTWARE',
        confidence: 0.7,
        evidence:   ['test'],
        system:     null,
        module:     null,
        refined_signals: {
          urgency:          99,   // out of range → ignored
          users_affected:   -1,   // out of range → ignored
          criticality:       3,   // valid → applied
          workaround:        5,   // valid → applied
          customer_impact:   2,   // valid → applied
          financial_impact:  1,   // valid → applied
          security_flag:     0,   // valid → applied
        },
      }),
    }));

    try {
      const input = makeInput({
        normalized_message: 'software error in CRM',
        intent:             'report bug',
        domain_hint:        'SOFTWARE',
        system_hint:        'CRM',
      });

      const result = await runTriage(input);

      // urgency and users_affected should come from keyword extraction (not 99/-1)
      assert.ok(result.priority_scores.urgency <= 5,
        `urgency should be ≤5, got: ${result.priority_scores.urgency}`);
      assert.ok(result.priority_scores.users_affected >= 0 && result.priority_scores.users_affected <= 5,
        `users_affected should be 0–5, got: ${result.priority_scores.users_affected}`);
      // criticality=3 from LLM should have been applied
      assert.equal(result.priority_scores.criticality, 3,
        `criticality should be 3 (from LLM refined_signals), got: ${result.priority_scores.criticality}`);
    } finally {
      if (savedMode === undefined) delete process.env['TRIAGE_MODE'];
      else process.env['TRIAGE_MODE'] = savedMode;
      setLLMClient(new MockLLMClient());
    }
  });

});
