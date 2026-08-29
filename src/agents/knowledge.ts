/**
 * Knowledge Agent — in-process stub
 * (ported from PR #2 packages/knowledge-service — scaffold only, full impl: Sub-Task 4)
 *
 * Answering domain: DIGITAL, BUSINESS_PROCESS, QUESTION, UNKNOWN.
 * Public signature is stable for future extraction to a dedicated service.
 */

import type { TriageResult, KnowledgeResult } from '../db/schema.js';
import type { TriageInput } from '../triage/port.js';

/**
 * Query the knowledge base for an answer to the given triage context.
 * Stub: always returns an unresolved result with escalation_recommended=true.
 */
export async function queryKnowledge(
  input: TriageInput,
  triageResult: TriageResult,
): Promise<KnowledgeResult> {
  void triageResult; // reserved for future routing/context filtering
  return {
    request_id:              input.request_id,
    resolved:                false,
    confidence:              0.0,
    answer:                  '',
    sources:                 [],
    data_source:             'unresolved',
    escalation_recommended:  true,
    escalation_reason:       'Knowledge Agent not yet implemented (stub)',
  };
}
