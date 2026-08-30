import type { RefinementOutput, ExtractedFields } from '../db/schema.js';

// Deterministic: first call → CLARIFICATION_PENDING; second call → READY_FOR_TRIAGE
const callCounts = new Map<string, number>();

export function resetMockState(): void {
  callCounts.clear();
}

export async function mockRefinementAgent(
  request_id: string,
  _original_message: string,
  _history: unknown,
  round: number,
): Promise<RefinementOutput> {
  const count = (callCounts.get(request_id) ?? 0) + 1;
  callCounts.set(request_id, count);

  const extracted: ExtractedFields = {
    system_name: 'ERP',
    error_description: count >= 2 ? 'HTTP 500 when generating invoice' : null,
  };

  if (count === 1) {
    return {
      normalized_message: 'User reports error when generating invoice in ERP.',
      intent: 'Report system error',
      domain_hint: 'SOFTWARE',
      system_hint: 'ERP',
      module_hint: 'invoice',
      is_complete: false,
      clarification_question: 'What error message appears when generating the invoice?',
      clarification_round: Math.min(round + 1, 2) as 0 | 1 | 2,
      extracted_fields: extracted,
      notes: null,
    };
  }

  // Second call: complete
  return {
    normalized_message: 'User reports HTTP 500 error when generating invoice in ERP.',
    intent: 'Report system error',
    domain_hint: 'SOFTWARE',
    system_hint: 'ERP',
    module_hint: 'invoice',
    is_complete: true,
    clarification_question: null,
    clarification_round: Math.min(round, 2) as 0 | 1 | 2,
    extracted_fields: extracted,
    notes: null,
  };
}
