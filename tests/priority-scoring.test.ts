/**
 * Priority Scoring unit tests — covers 08_priority_model.md boundary cases
 * and the primary demo scenario from 16_demo_strategy.md.
 *
 * All tests use computeComposite / computePriority / extractPriorityScores directly
 * (pure functions, no I/O).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePriority,
  computeComposite,
  extractPriorityScores,
  extractDomainFlags,
  buildPriorityEvidence,
} from '../src/engine/priority-scoring.js';
import type { PriorityScores } from '../src/db/schema.js';
import type { DomainFlags } from '../src/engine/priority-scoring.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Convenience: compute priority directly from raw scores + domain + flags */
function score(
  s: PriorityScores,
  domain: Parameters<typeof computePriority>[1] = 'SOFTWARE',
  flags: DomainFlags = { production_down: false, clevel_blocked: false },
) {
  return computePriority(s, domain, flags);
}

/** All-zero scores baseline */
const ZERO: PriorityScores = {
  urgency: 0, users_affected: 0, customer_impact: 0,
  financial_impact: 0, security_flag: 0, workaround: 0, criticality: 0,
};

// ── Score band boundaries ─────────────────────────────────────────────────────

describe('priority-scoring — score band boundaries', () => {

  it('composite 0 → INFORMATIONAL', () => {
    assert.equal(computeComposite(ZERO), 0);
    assert.equal(score(ZERO, 'UNKNOWN'), 'INFORMATIONAL');
  });

  it('composite 4 → INFORMATIONAL (upper bound of band)', () => {
    // urgency=2 → 2*2=4
    const s: PriorityScores = { ...ZERO, urgency: 2 };
    assert.equal(computeComposite(s), 4);
    assert.equal(score(s, 'UNKNOWN'), 'INFORMATIONAL');
  });

  it('composite 5 → LOW (lower bound of band)', () => {
    // urgency=2 (4) + workaround=1 (1) = 5
    const s: PriorityScores = { ...ZERO, urgency: 2, workaround: 1 };
    assert.equal(computeComposite(s), 5);
    assert.equal(score(s, 'UNKNOWN'), 'LOW');
  });

  it('composite 19 → LOW (upper bound of band)', () => {
    // urgency=4(8) + users_affected=1(2) + workaround=4(4) + criticality=2(4) + financial_impact=1(1) = 19
    const s: PriorityScores = { ...ZERO, urgency: 4, users_affected: 1, workaround: 4, criticality: 2, financial_impact: 1 };
    const c = computeComposite(s);
    assert.equal(c, 19);
    assert.equal(score(s, 'UNKNOWN'), 'LOW');
  });

  it('composite 20 → MEDIUM (lower bound of band)', () => {
    // urgency=5(10) + users_affected=5(10) = 20
    const s: PriorityScores = { ...ZERO, urgency: 5, users_affected: 5 };
    assert.equal(computeComposite(s), 20);
    assert.equal(score(s, 'UNKNOWN'), 'MEDIUM');
  });

  it('composite 39 → MEDIUM (upper bound of band)', () => {
    // urgency=4(8) + users_affected=4(8) + customer_impact=4(12) + financial_impact=1(1) + criticality=5(10) = 39
    const s: PriorityScores = { ...ZERO, urgency: 4, users_affected: 4, customer_impact: 4, financial_impact: 1, criticality: 5 };
    assert.equal(computeComposite(s), 39);
    assert.equal(score(s, 'UNKNOWN'), 'MEDIUM');
  });

  it('composite 40 → HIGH (lower bound of band)', () => {
    // urgency=5(10) + users_affected=5(10) + customer_impact=5(15) + criticality=2(4) + workaround=1(1) = 40
    const s: PriorityScores = { ...ZERO, urgency: 5, users_affected: 5, customer_impact: 5, criticality: 2, workaround: 1 };
    assert.equal(computeComposite(s), 40);
    assert.equal(score(s, 'UNKNOWN'), 'HIGH');
  });

  it('composite 59 → HIGH (upper bound of band)', () => {
    // urgency=5(10) + users_affected=5(10) + customer_impact=5(15) + financial_impact=5(5) + security_flag=3(12) + workaround=3(3) + criticality=2(4) = 59
    const s: PriorityScores = { urgency: 5, users_affected: 5, customer_impact: 5, financial_impact: 5, security_flag: 3, workaround: 3, criticality: 2 };
    assert.equal(computeComposite(s), 59);
    assert.equal(score(s, 'UNKNOWN'), 'HIGH');
  });

  it('composite 60 → CRITICAL (lower bound of band)', () => {
    // urgency=5(10) + users_affected=5(10) + customer_impact=5(15) + financial_impact=5(5) + security_flag=3(12) + workaround=4(4) + criticality=2(4) = 60
    const s: PriorityScores = { urgency: 5, users_affected: 5, customer_impact: 5, financial_impact: 5, security_flag: 3, workaround: 4, criticality: 2 };
    assert.equal(computeComposite(s), 60);
    assert.equal(score(s, 'UNKNOWN'), 'CRITICAL');
  });

  it('composite 75 → CRITICAL (maximum possible score)', () => {
    const s: PriorityScores = {
      urgency: 5, users_affected: 5, customer_impact: 5,
      financial_impact: 5, security_flag: 5, workaround: 5, criticality: 5,
    };
    assert.equal(computeComposite(s), 75);
    assert.equal(score(s, 'UNKNOWN'), 'CRITICAL');
  });

});

// ── Named test cases from 14_testing_strategy.md ─────────────────────────────

describe('priority-scoring — named test cases', () => {

  it('security_flag=5, users=5, no workaround → CRITICAL', () => {
    const s: PriorityScores = { ...ZERO, security_flag: 5, users_affected: 5, workaround: 5 };
    // composite = 5*2 + 5*4 + 5*1 = 10+20+5 = 35 → MEDIUM by band
    // but security_flag=5 triggers score override → CRITICAL
    assert.equal(score(s, 'SECURITY'), 'CRITICAL');
  });

  it('users=2, easy workaround, no customer impact → LOW', () => {
    // users_affected=2(4), workaround=0(0), urgency=1(2), criticality=1(2) = 8 → LOW
    const s: PriorityScores = { ...ZERO, users_affected: 2, workaround: 0, urgency: 1, criticality: 1 };
    const c = computeComposite(s);
    assert.ok(c >= 5 && c < 20, `expected LOW band (5–19), got composite=${c}`);
    assert.equal(score(s, 'UNKNOWN'), 'LOW');
  });

  it('single user, minor display issue → LOW', () => {
    // users_affected=1(2), urgency=1(2), workaround=1(1) = 5 → LOW
    const s: PriorityScores = { ...ZERO, users_affected: 1, urgency: 1, workaround: 1 };
    const c = computeComposite(s);
    assert.equal(c, 5, `expected composite=5 (lower bound of LOW), got ${c}`);
    assert.equal(score(s, 'UNKNOWN'), 'LOW');
  });

  it('multiple users, major feature broken, no workaround → HIGH', () => {
    // users=5(10), urgency=4(8), workaround=5(5), criticality=4(8), customer_impact=3(9) = 40 → HIGH
    const s: PriorityScores = {
      ...ZERO,
      users_affected: 5, urgency: 4, workaround: 5, criticality: 4, customer_impact: 3,
    };
    assert.equal(computeComposite(s), 40);
    assert.equal(score(s, 'UNKNOWN'), 'HIGH');
  });

});

// ── Domain override tests ─────────────────────────────────────────────────────

describe('priority-scoring — domain overrides', () => {

  it('SECURITY domain elevates LOW → HIGH', () => {
    const s: PriorityScores = { ...ZERO, urgency: 1, users_affected: 1, workaround: 1 };
    const c = computeComposite(s);
    assert.ok(c < 20, `pre-condition: composite=${c} should be LOW`);
    assert.equal(score(s, 'UNKNOWN'), 'LOW');
    assert.equal(score(s, 'SECURITY'), 'HIGH');
  });

  it('SECURITY domain does NOT lower CRITICAL', () => {
    const s: PriorityScores = {
      urgency: 5, users_affected: 5, customer_impact: 5,
      financial_impact: 5, security_flag: 5, workaround: 5, criticality: 5,
    };
    assert.equal(score(s, 'SECURITY'), 'CRITICAL');
  });

  it('SECURITY domain does NOT fire when score is already HIGH', () => {
    // score already HIGH — override should leave it HIGH (not elevate or lower)
    const s: PriorityScores = { ...ZERO, urgency: 5, users_affected: 5, customer_impact: 5, criticality: 2, workaround: 1 };
    assert.equal(computeComposite(s), 40); // exactly HIGH
    assert.equal(score(s, 'SECURITY'), 'HIGH');
  });

  it('SOFTWARE production_down flag elevates LOW → CRITICAL', () => {
    const s: PriorityScores = { ...ZERO, urgency: 3, users_affected: 3, workaround: 3 };
    // 3*2+3*2+3*1 = 15 → LOW without flag
    assert.equal(score(s, 'SOFTWARE', { production_down: false, clevel_blocked: false }), 'LOW');
    assert.equal(score(s, 'SOFTWARE', { production_down: true,  clevel_blocked: false }), 'CRITICAL');
  });

  it('SOFTWARE production_down does NOT fire when domain is not SOFTWARE', () => {
    const s: PriorityScores = { ...ZERO, urgency: 2, users_affected: 2 };
    // Flag is set but domain is HARDWARE — should not trigger
    assert.notEqual(score(s, 'HARDWARE', { production_down: true, clevel_blocked: false }), 'CRITICAL');
  });

  it('SOFTWARE production_down does NOT fire when score is already CRITICAL', () => {
    // Score independently reaches CRITICAL — override is a no-op floor
    const s: PriorityScores = {
      urgency: 5, users_affected: 5, customer_impact: 5,
      financial_impact: 5, security_flag: 3, workaround: 4, criticality: 2,
    };
    assert.equal(computeComposite(s), 60); // CRITICAL by band
    assert.equal(score(s, 'SOFTWARE', { production_down: true, clevel_blocked: false }), 'CRITICAL');
  });

  it('ACCESS clevel_blocked flag elevates INFORMATIONAL → HIGH', () => {
    const s: PriorityScores = { ...ZERO, urgency: 1, users_affected: 1 };
    assert.equal(score(s, 'ACCESS', { production_down: false, clevel_blocked: false }), 'INFORMATIONAL');
    assert.equal(score(s, 'ACCESS', { production_down: false, clevel_blocked: true  }), 'HIGH');
  });

  it('ACCESS clevel_blocked does NOT fire when domain is not ACCESS', () => {
    const s: PriorityScores = { ...ZERO, urgency: 1, users_affected: 1 };
    // Flag set but domain is DIGITAL — no override
    const result = score(s, 'DIGITAL', { production_down: false, clevel_blocked: true });
    assert.notEqual(result, 'HIGH');
  });

  it('ACCESS clevel_blocked does NOT fire when score is already CRITICAL', () => {
    const s: PriorityScores = {
      urgency: 5, users_affected: 5, customer_impact: 5,
      financial_impact: 5, security_flag: 3, workaround: 4, criticality: 2,
    };
    assert.equal(computeComposite(s), 60); // CRITICAL by band
    assert.equal(score(s, 'ACCESS', { production_down: false, clevel_blocked: true }), 'CRITICAL');
  });

  it('security_flag=5 always → CRITICAL regardless of domain', () => {
    const s: PriorityScores = { ...ZERO, security_flag: 5 };
    // security_flag=5*4=20 → MEDIUM by band, but score override → CRITICAL
    assert.equal(score(s, 'HARDWARE'), 'CRITICAL');
    assert.equal(score(s, 'DIGITAL'),  'CRITICAL');
    assert.equal(score(s, 'UNKNOWN'),  'CRITICAL');
  });

});

// ── Workaround inversion fix verification ─────────────────────────────────────

describe('priority-scoring — workaround inversion fix', () => {

  it('workaround=0 (easy) contributes 0 to composite', () => {
    const s: PriorityScores = { ...ZERO, workaround: 0 };
    assert.equal(computeComposite(s), 0);
  });

  it('workaround=5 (none) contributes 5 to composite', () => {
    const s: PriorityScores = { ...ZERO, workaround: 5 };
    assert.equal(computeComposite(s), 5);
  });

  it('no workaround raises score (5 > 0)', () => {
    const none:  PriorityScores = { ...ZERO, workaround: 5 };
    const easy:  PriorityScores = { ...ZERO, workaround: 0 };
    assert.ok(
      computeComposite(none) > computeComposite(easy),
      'no workaround must produce higher composite than easy workaround',
    );
  });

});

// ── Signal extraction ─────────────────────────────────────────────────────────

describe('priority-scoring — signal extraction', () => {

  it('ERP mention → criticality ≥ 4', () => {
    const s = extractPriorityScores('ERP system is down', 'report error', 'SOFTWARE', 'ERP');
    assert.ok(s.criticality >= 4, `expected criticality>=4, got ${s.criticality}`);
  });

  it('"everyone on the finance team is blocked" → urgency=5, users_affected=5', () => {
    // finance team is blocked → entire business function stopped → urgency=5
    const s = extractPriorityScores(
      'Everyone on the finance team is blocked',
      'report blockage',
      'SOFTWARE',
      null,
    );
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('invoice keywords → customer_impact ≥ 1 and financial_impact ≥ 1', () => {
    const s = extractPriorityScores('invoice generation failing for clients', 'billing issue', 'SOFTWARE', null);
    assert.ok(s.customer_impact >= 1, `customer_impact=${s.customer_impact}`);
    assert.ok(s.financial_impact >= 1, `financial_impact=${s.financial_impact}`);
  });

  it('SECURITY domain_hint → security_flag ≥ 4', () => {
    const s = extractPriorityScores('suspicious email received', 'phishing report', 'SECURITY', null);
    assert.ok(s.security_flag >= 4, `security_flag=${s.security_flag}`);
  });

  it('no workaround signal → workaround defaults to 5 (none)', () => {
    const s = extractPriorityScores('system broken', 'error report', 'SOFTWARE', null);
    assert.equal(s.workaround, 5);
  });

  it('"workaround available" → workaround = 1', () => {
    const s = extractPriorityScores('there is a workaround for now', 'workaround', 'SOFTWARE', null);
    assert.equal(s.workaround, 1);
  });

});

// ── pt-BR pattern coverage ────────────────────────────────────────────────────
//
// Defect 1: gender and number agreement misses in pt-BR extraction patterns.
// "Todo o time" does not match /toda.+(equipe|time)/ because "todo" ≠ "toda".
// All four agreement forms must be accepted: todo/toda/todos/todas + o/a (article).
// Target words: equipe, time, setor, área.

describe('priority-scoring — pt-BR gender/number agreement (Defect 1)', () => {

  // ── urgency patterns ────────────────────────────────────────────────────────

  it('pt-BR urgency: "Todo o time está bloqueado" → urgency=5', () => {
    // todo (masc. sing.) + o (article) + time → entire team blocked
    const s = extractPriorityScores('Todo o time está bloqueado', 'report', 'SOFTWARE', null);
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
  });

  it('pt-BR urgency: "Toda a equipe está bloqueada" → urgency=5', () => {
    // toda (fem. sing.) + a (article) + equipe
    const s = extractPriorityScores('Toda a equipe está bloqueada', 'report', 'SOFTWARE', null);
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
  });

  it('pt-BR urgency: "Todos do setor estão bloqueados" → urgency=5', () => {
    // todos (masc. plur.) + setor
    const s = extractPriorityScores('Todos do setor estão bloqueados', 'report', 'SOFTWARE', null);
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
  });

  it('pt-BR urgency: "Toda a área de finanças está parada" → urgency=5', () => {
    // toda + a + área (team unit stopped)
    const s = extractPriorityScores('Toda a área de finanças está parada', 'report', 'SOFTWARE', null);
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
  });

  it('pt-BR urgency: "Todo o time de finanças está bloqueado" → urgency=5', () => {
    // the exact phrase from the demo failure report
    const s = extractPriorityScores('Todo o time de finanças está bloqueado', 'report', 'SOFTWARE', null);
    assert.equal(s.urgency, 5, `urgency=${s.urgency}`);
  });

  // ── users_affected patterns ─────────────────────────────────────────────────

  it('pt-BR users_affected: "Todo o time" → users_affected=5', () => {
    const s = extractPriorityScores('Todo o time não consegue acessar', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('pt-BR users_affected: "Toda a equipe" → users_affected=5', () => {
    const s = extractPriorityScores('Toda a equipe está com problema', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('pt-BR users_affected: "Todos do setor" → users_affected=5', () => {
    const s = extractPriorityScores('Todos do setor de RH estão afetados', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('pt-BR users_affected: "Toda a área" → users_affected=5', () => {
    const s = extractPriorityScores('Toda a área comercial está impactada', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('pt-BR users_affected: "Todos bloqueados" → users_affected=5', () => {
    // todos (plural all) + bloqueados
    const s = extractPriorityScores('Todos estão bloqueados no sistema', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

  it('pre-existing pt-BR users_affected: "toda a equipe" (original pattern) still works', () => {
    // Regression: the pre-existing "toda" form must still match
    const s = extractPriorityScores('toda a equipe está com problema', 'report', 'SOFTWARE', null);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected}`);
  });

});

// ── Domain flag extraction ────────────────────────────────────────────────────

describe('priority-scoring — domain flag extraction', () => {

  it('SOFTWARE + HTTP 500 → production_down = false (error code ≠ system down)', () => {
    // Defect 2: a bare HTTP 500 means ONE OPERATION failed, not the system is unavailable.
    // production_down must NOT fire merely because a status code appears in the message.
    const flags = extractDomainFlags(
      'ERP is throwing HTTP 500 Internal Server Error when creating invoices',
      'report error',
      'SOFTWARE',
    );
    assert.equal(flags.production_down, false,
      'HTTP 500 on one operation should NOT set production_down — that flag means the system itself is unreachable');
  });

  it('SOFTWARE + explicit "system is down" → production_down = true', () => {
    const flags = extractDomainFlags('The ERP system is completely down for everyone', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('SOFTWARE + "service unavailable" → production_down = true', () => {
    const flags = extractDomainFlags('Getting service unavailable on all requests', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('SOFTWARE + "out of service" → production_down = true', () => {
    const flags = extractDomainFlags('The system is out of service since this morning', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('SOFTWARE + "sistema fora" → production_down = true', () => {
    const flags = extractDomainFlags('O sistema está fora, ninguém consegue acessar', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('SOFTWARE + "fora do ar" → production_down = true', () => {
    const flags = extractDomainFlags('O portal está fora do ar desde ontem', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('SOFTWARE + "completamente bloqueado" → production_down = true', () => {
    const flags = extractDomainFlags('O acesso está completamente bloqueado para todos', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, true);
  });

  it('HARDWARE + "system is down" → production_down = false (domain mismatch)', () => {
    const flags = extractDomainFlags('server is down', 'hardware issue', 'HARDWARE');
    assert.equal(flags.production_down, false);
  });

  it('SOFTWARE + "não funciona" alone → production_down = false ("does not work" ≠ system down)', () => {
    // "não funciona" = "does not work" — describes a feature failure, not system unavailability
    const flags = extractDomainFlags('a funcionalidade não funciona no módulo de vendas', 'report', 'SOFTWARE');
    assert.equal(flags.production_down, false,
      '"não funciona" for a feature should NOT set production_down');
  });

  it('ACCESS + CEO blocked → clevel_blocked = true', () => {
    const flags = extractDomainFlags('CEO cannot log in', 'access issue', 'ACCESS');
    assert.equal(flags.clevel_blocked, true);
  });

  it('ACCESS + regular user blocked → clevel_blocked = false', () => {
    const flags = extractDomainFlags('analyst cannot log in', 'access issue', 'ACCESS');
    assert.equal(flags.clevel_blocked, false);
  });

});

// ── Evidence array ────────────────────────────────────────────────────────────

describe('priority-scoring — evidence array', () => {

  it('evidence includes all seven signal names and score:band', () => {
    const s: PriorityScores = { ...ZERO, urgency: 2, users_affected: 3 };
    const flags: DomainFlags = { production_down: false, clevel_blocked: false };
    const composite = computeComposite(s);
    const priority = computePriority(s, 'SOFTWARE', flags);
    const evidence = buildPriorityEvidence(s, composite, priority, flags);

    assert.ok(evidence.some(e => e.startsWith('priority_score:')), 'missing priority_score');
    assert.ok(evidence.some(e => e.startsWith('priority_band:')), 'missing priority_band');
    assert.ok(evidence.some(e => e.startsWith('urgency:')), 'missing urgency');
    assert.ok(evidence.some(e => e.startsWith('users_affected:')), 'missing users_affected');
    assert.ok(evidence.some(e => e.startsWith('customer_impact:')), 'missing customer_impact');
    assert.ok(evidence.some(e => e.startsWith('financial_impact:')), 'missing financial_impact');
    assert.ok(evidence.some(e => e.startsWith('security_flag:')), 'missing security_flag');
    assert.ok(evidence.some(e => e.startsWith('workaround:')), 'missing workaround');
    assert.ok(evidence.some(e => e.startsWith('criticality:')), 'missing criticality');
  });

  it('evidence includes override label when production_down', () => {
    const s: PriorityScores = { ...ZERO };
    const flags: DomainFlags = { production_down: true, clevel_blocked: false };
    const evidence = buildPriorityEvidence(s, 0, 'CRITICAL', flags);
    assert.ok(evidence.some(e => e.includes('production_down')), 'missing production_down override label');
  });

});

// ── PRIMARY DEMO TEST ─────────────────────────────────────────────────────────
//
// Scenario from 16_demo_strategy.md step 1+3 (combined normalized message):
//   "@triage-bot The ERP system is throwing errors when I try to generate invoices for clients.
//    Everyone on the finance team is blocked. This started yesterday afternoon."
//   + clarification answer: "HTTP 500 Internal Server Error"
//
// Requirements (from task spec):
//   - composite score alone → HIGH (≥ 40, < 60)
//   - production_down MUST NOT fire: this is invoice generation failing, not the ERP being down
//   - Seven term contributions reported

describe('priority-scoring — primary demo scenario (16_demo_strategy.md)', () => {

  // The full normalized message after refinement (messages 1 + 3 combined):
  const DEMO_MESSAGE =
    'The ERP system is throwing errors when I try to generate invoices for clients. ' +
    'Everyone on the finance team is blocked. This started yesterday afternoon. ' +
    'HTTP 500 Internal Server Error';
  const DEMO_INTENT  = 'Report ERP invoice generation failure';
  const DEMO_DOMAIN  = 'SOFTWARE' as const;
  const DEMO_SYSTEM  = 'ERP';

  it('demo: production_down does NOT fire — invoice failure ≠ system down', () => {
    // The ERP system is operational; only invoice generation throws 500 errors.
    // production_down requires the service itself to be unreachable, not one operation to fail.
    const flags = extractDomainFlags(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN);
    assert.equal(flags.production_down, false,
      'HTTP 500 on invoice generation must NOT set production_down; the ERP itself is not down');
  });

  it('demo: term 1 — urgency = 5 ("everyone on the finance team is blocked" → entire dept stopped)', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.urgency, 5, `urgency=${s.urgency} (expected 5: entire finance team blocked)`);
  });

  it('demo: term 2 — users_affected = 5 ("everyone on the finance team")', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.users_affected, 5, `users_affected=${s.users_affected} (expected 5: whole team)`);
  });

  it('demo: term 3 — customer_impact = 2 ("invoices for clients")', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.customer_impact, 2, `customer_impact=${s.customer_impact}`);
  });

  it('demo: term 4 — financial_impact = 2 ("invoices")', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.financial_impact, 2, `financial_impact=${s.financial_impact}`);
  });

  it('demo: term 5 — security_flag = 0 (no security signals)', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.security_flag, 0, `security_flag=${s.security_flag}`);
  });

  it('demo: term 6 — workaround = 5 (no workaround mentioned → default none)', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.workaround, 5, `workaround=${s.workaround}`);
  });

  it('demo: term 7 — criticality = 4 (ERP → core system)', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    assert.equal(s.criticality, 4, `criticality=${s.criticality}`);
  });

  it('demo: composite score ≥ 40 (HIGH band)', () => {
    const s = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    // urgency=5*2=10, users=5*2=10, customer=2*3=6, financial=2*1=2,
    // security=0*4=0, workaround=5*1=5, criticality=4*2=8 → total=41
    const c = computeComposite(s);
    assert.ok(c >= 40 && c < 60,
      `composite=${c}: expected HIGH band (40–59). ` +
      `Terms: urgency=${s.urgency}*2=${s.urgency*2}, users=${s.users_affected}*2=${s.users_affected*2}, ` +
      `customer=${s.customer_impact}*3=${s.customer_impact*3}, financial=${s.financial_impact}*1=${s.financial_impact}, ` +
      `security=${s.security_flag}*4=${s.security_flag*4}, workaround=${s.workaround}*1=${s.workaround}, ` +
      `criticality=${s.criticality}*2=${s.criticality*2}`);
  });

  it('demo: final priority = HIGH from composite alone, no override needed', () => {
    // This is the primary demo assertion: invoice generation failure → HIGH,
    // driven entirely by the composite score, WITHOUT the production_down override.
    const s     = extractPriorityScores(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN, DEMO_SYSTEM);
    const flags = extractDomainFlags(DEMO_MESSAGE, DEMO_INTENT, DEMO_DOMAIN);
    const p     = computePriority(s, DEMO_DOMAIN, flags);

    assert.equal(flags.production_down, false, 'pre-condition: production_down must not fire');
    assert.equal(p, 'HIGH',
      `Expected HIGH (composite ≥ 40 without production_down override). ` +
      `Got: composite=${computeComposite(s)}, flags=${JSON.stringify(flags)}, priority=${p}`);
  });

  it('demo: pt-BR variant "Todo o time de finanças está bloqueado" → HIGH', () => {
    // The exact phrase from the bug report must also produce HIGH.
    const ptBrMessage =
      'O sistema ERP está gerando erros ao tentar criar notas fiscais para clientes. ' +
      'Todo o time de finanças está bloqueado. Isso começou ontem à tarde. ' +
      'HTTP 500 Internal Server Error';
    const s     = extractPriorityScores(ptBrMessage, 'Erro no módulo de notas fiscais do ERP', DEMO_DOMAIN, DEMO_SYSTEM);
    const flags = extractDomainFlags(ptBrMessage, 'Erro no módulo de notas fiscais do ERP', DEMO_DOMAIN);
    const p     = computePriority(s, DEMO_DOMAIN, flags);

    assert.equal(flags.production_down, false, 'pre-condition: production_down must not fire');
    assert.equal(p, 'HIGH',
      `pt-BR demo message must produce HIGH. ` +
      `composite=${computeComposite(s)}, urgency=${s.urgency}, users=${s.users_affected}, priority=${p}`);
  });

});
