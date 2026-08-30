/**
 * Mock Triage Agent — deterministic fixture, no LLM call.
 * Used when TRIAGE_MODE !== 'llm' (default).
 *
 * Pattern mirrors src/agents/refinement.mock.ts.
 *
 * Confidence by domain_hint:
 *   UNKNOWN / null → 0.4  (triggers requires_human via < 0.6 threshold)
 *   all other domains     → 0.9
 *
 * Priority is always computed deterministically by the priority-scoring engine.
 * Route is derived by the single domainToRoute() exported from triage.ts.
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
import { domainToRoute } from './triage.js';

// ── Mock fixtures ─────────────────────────────────────────────────────────────

const FIXTURE_CONFIDENCE: Partial<Record<Domain, number>> = {
  SOFTWARE:         0.9,
  HARDWARE:         0.9,
  ACCESS:           0.9,
  DIGITAL:          0.9,
  SECURITY:         0.9,
  BUSINESS_PROCESS: 0.9,
  QUESTION:         0.9,
  UNKNOWN:          0.4,
};

export async function mockRunTriage(input: TriageInput): Promise<TriageResult> {
  const domain: Domain = input.domain_hint ?? 'UNKNOWN';
  const confidence = FIXTURE_CONFIDENCE[domain] ?? 0.5;

  const scores = extractPriorityScores(
    input.normalized_message,
    input.intent,
    domain,
    input.system_hint,
  );

  const flags = extractDomainFlags(
    input.normalized_message,
    input.intent,
    domain,
  );

  const priority  = computePriority(scores, domain, flags);
  const composite = computeComposite(scores);
  const evidence  = [
    `mock:domain=${domain}`,
    ...buildPriorityEvidence(scores, composite, priority, flags),
  ];

  return {
    request_id:             input.request_id,
    domain,
    system:                 input.system_hint,
    module:                 input.module_hint,
    confidence,
    evidence,
    priority,
    priority_scores:        scores,
    route:                  domainToRoute(domain),
    is_duplicate:           false,
    correlated_request_ids: [],
    requires_human:         confidence < 0.6,
    triaged_at:             new Date().toISOString(),
  };
}
