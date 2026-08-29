/**
 * Triage Agent — orchestration-service
 *
 * Classifies an incoming NormalizedRequest into a domain, priority, route,
 * and duplicate signals, producing a TriageResult that the routing guard uses
 * to pick the correct downstream agent service.
 *
 * LLM INJECTION POINT:
 *   Replace the stub body of `run()` with an actual LLM call:
 *     const prompt = buildTriagePrompt(input);
 *     const response = await llmClient.complete(prompt);
 *     const raw = JSON.parse(response.content);
 *     return applyPriorityScoring(raw) as TriageResult;
 *
 *   The LLM outputs domain/system/module/confidence/evidence.
 *   Priority is computed deterministically from those fields (see 08_priority_model.md).
 *   Routing is fully deterministic — see src/router.ts.
 */

import type { NormalizedRequest, TriageResult } from '@zovaodobob/shared-types';
import type { AgentRunner } from './refinement.js';

// ─── TriageInput ──────────────────────────────────────────────────────────────

export interface TriageInput {
  normalized_request: NormalizedRequest;
}

// ─── TriageAgent stub ─────────────────────────────────────────────────────────

export class TriageAgent implements AgentRunner<TriageInput, TriageResult> {
  /**
   * Stub implementation — returns a deterministic TriageResult.
   *
   * Replace the body with an LLM call (see LLM INJECTION POINT above) to get
   * real classification behaviour.
   */
  async run(input: TriageInput): Promise<TriageResult> {
    return {
      request_id: input.normalized_request.request_id,
      domain: 'SOFTWARE',
      system: null,
      module: null,
      confidence: 0.9,
      evidence: ['stub: deterministic result'],
      priority: 'MEDIUM',
      priority_scores: {
        urgency: 2,
        users_affected: 1,
        customer_impact: 0,
        financial_impact: 0,
        security_flag: 0,
        workaround: 1,
        criticality: 0,
      },
      route: 'engineering',
      is_duplicate: false,
      correlated_request_ids: [],
      requires_human: false,
      triaged_at: new Date().toISOString(),
    };
  }
}

export const triageAgent = new TriageAgent();
