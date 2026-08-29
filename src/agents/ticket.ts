/**
 * Ticket Agent — in-process stub
 * (ported from PR #2 packages/ticket-service — scaffold only, full impl: Sub-Task 6)
 *
 * Handles HARDWARE and ACCESS domains (IT support ticket path).
 * Public signature is stable for future extraction to a dedicated service.
 */

import { randomUUID } from 'crypto';
import type { TriageResult, TicketResult } from '../db/schema.js';
import type { TriageInput } from '../triage/port.js';

/**
 * Create an IT support ticket for the given triage context.
 * Stub: returns QUEUED_FOR_APPROVAL with requires_human=true (always gated — email.send).
 */
export async function createTicket(
  input: TriageInput,
  triageResult: TriageResult,
): Promise<TicketResult> {
  return {
    request_id:    input.request_id,
    ticket_id:     randomUUID(),
    queue:         domainToQueue(triageResult.domain),
    priority:      triageResult.priority,
    title:         input.intent,
    description:   input.normalized_message,
    status:        'QUEUED_FOR_APPROVAL',
    email_to:      [],
    requires_human: true,
  };
}

function domainToQueue(domain: TriageResult['domain']): string {
  switch (domain) {
    case 'HARDWARE': return 'IT-Hardware';
    case 'ACCESS':   return 'IT-Security-Access';
    default:         return 'IT-General';
  }
}
