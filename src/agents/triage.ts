/**
 * Triage Agent — in-process (ported from PR #2 packages/orchestration-service/src/agents/triage.ts)
 *
 * Classifies a TriageInput (§2 of 17_intake_contract.md) into a domain,
 * priority, route and duplicate signals, producing a TriageResult.
 *
 * KEY DIFFERENCE FROM PR #2:
 *   PR #2 accepted a full NormalizedRequest as input.
 *   We accept TriageInput only (§2 security boundary — see port.ts header).
 *   The public signature is kept stable for future extraction.
 *
 * LLM INJECTION POINT:
 *   Replace the stub body of `runTriage()` with an actual LLM call:
 *     const raw = await llmClient.complete(buildTriagePrompt(input));
 *     return applyPriorityScoring(JSON.parse(raw)) as TriageResult;
 *   The LLM should output signal scores only, never a priority (P10).
 */

import type { TriageInput } from '../triage/port.js';
import type { TriageResult, Domain } from '../db/schema.js';
import {
  extractPriorityScores,
  extractDomainFlags,
  computePriority,
  computeComposite,
  buildPriorityEvidence,
} from '../engine/priority-scoring.js';

// ─── Public function (stable signature for future extraction) ─────────────────

/**
 * Classifies a TriageInput and returns a TriageResult.
 * Priority is computed deterministically by the Priority Scoring Engine (I5/P10).
 * Signal scores are extracted by keyword rules from TriageInput fields.
 * Replace the domain classification stub with an LLM call before demo.
 */
export async function runTriage(input: TriageInput): Promise<TriageResult> {
  // Domain coercion: domain_hint is already a Domain (from TriageInput), use it directly.
  const domain: Domain = input.domain_hint ?? 'UNKNOWN';

  // ── Extract priority signals from available TriageInput fields ──────────────
  const scores = extractPriorityScores(
    input.normalized_message,
    input.intent,
    input.domain_hint,
    input.system_hint,
  );

  // ── Extract domain-level flags ───────────────────────────────────────────────
  const flags = extractDomainFlags(
    input.normalized_message,
    input.intent,
    input.domain_hint,
  );

  // ── Compute priority deterministically (I5 — never a literal assignment) ────
  const priority = computePriority(scores, domain, flags);
  const composite = computeComposite(scores);

  // ── Build evidence array (P4 — every decision references explicit signals) ──
  const evidence = buildPriorityEvidence(scores, composite, priority, flags);

  return {
    request_id:             input.request_id,
    domain,
    system:                 input.system_hint,
    module:                 input.module_hint,
    confidence:             input.domain_hint !== null ? 0.9 : 0.5,
    evidence,
    priority,
    priority_scores:        scores,
    route:                  domainToRoute(domain),
    is_duplicate:           false,
    correlated_request_ids: [],
    requires_human:         false,
    triaged_at:             new Date().toISOString(),
  };
}

// ─── Routing table (mirrored from PR #2 router.ts) ────────────────────────────

function domainToRoute(domain: Domain): TriageResult['route'] {
  switch (domain) {
    case 'SOFTWARE':         return 'engineering';
    case 'SECURITY':         return 'incident';
    case 'DIGITAL':          return 'knowledge';
    case 'BUSINESS_PROCESS': return 'knowledge';
    case 'QUESTION':         return 'knowledge';
    case 'HARDWARE':         return 'ticket';
    case 'ACCESS':           return 'ticket';
    case 'UNKNOWN':
    default:                 return 'knowledge';
  }
}
