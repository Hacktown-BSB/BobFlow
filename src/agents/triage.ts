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
 */

import type { TriageInput } from '../triage/port.js';
import type { TriageResult, Domain } from '../db/schema.js';

// ─── Public function (stable signature for future extraction) ─────────────────

/**
 * Classifies a TriageInput and returns a TriageResult.
 * Stub implementation: deterministic SOFTWARE/MEDIUM result.
 * Replace body with LLM call before demo.
 */
export async function runTriage(input: TriageInput): Promise<TriageResult> {
  // Domain coercion: domain_hint is already a Domain (from TriageInput), use it directly.
  const domain: Domain = input.domain_hint ?? 'UNKNOWN';

  return {
    request_id:             input.request_id,
    domain,
    system:                 input.system_hint,
    module:                 input.module_hint,
    confidence:             input.domain_hint !== null ? 0.9 : 0.5,
    evidence:               ['stub: deterministic classification from domain_hint'],
    priority:               'MEDIUM',
    priority_scores: {
      urgency:          2,
      users_affected:   1,
      customer_impact:  0,
      financial_impact: 0,
      security_flag:    0,
      workaround:       1,
      criticality:      0,
    },
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
