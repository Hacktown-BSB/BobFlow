/**
 * Routing Guard — orchestration-service
 *
 * Deterministic routing table derived from knowledge/05_agent_registry.md.
 *
 * Maps a TriageResult to exactly one of the three downstream HTTP services:
 *   - 'knowledge'  → GET  /answer           (Knowledge Service)
 *   - 'issue'      → POST /issues           (Issue Service)
 *   - 'ticket'     → POST /tickets          (Ticket Service)
 *
 * Routing table:
 *   SOFTWARE         → issue   (Engineering Agent path inside Issue Service)
 *   SECURITY         → issue   (Incident Agent path inside Issue Service)
 *   DIGITAL          → knowledge  (then ticket if unresolved — handled by machine)
 *   BUSINESS_PROCESS → knowledge  (then ticket if unresolved — handled by machine)
 *   QUESTION         → knowledge
 *   HARDWARE         → ticket
 *   ACCESS           → ticket
 *   UNKNOWN          → knowledge  (best-effort; machine escalates to human on empty result)
 *
 * CRITICAL override:
 *   Any CRITICAL priority request is sent to the Issue Service so the Incident
 *   Agent path can run.  The parallel HUMAN_APPROVAL_GATE region is activated
 *   separately inside the machine.
 */

import type { TriageResult } from '@zovaodobob/shared-types';

export type AgentServiceRoute = 'knowledge' | 'issue' | 'ticket';

/**
 * Returns the downstream service route for a given TriageResult.
 *
 * @param triageResult  Output of the Triage Agent.
 * @returns             One of 'knowledge' | 'issue' | 'ticket'.
 */
export function getRoute(triageResult: TriageResult): AgentServiceRoute {
  // CRITICAL priority always goes through the Issue Service (Incident path).
  if (triageResult.priority === 'CRITICAL') {
    return 'issue';
  }

  switch (triageResult.domain) {
    case 'SOFTWARE':
      return 'issue';

    case 'SECURITY':
      return 'issue';

    case 'DIGITAL':
      return 'knowledge';

    case 'BUSINESS_PROCESS':
      return 'knowledge';

    case 'QUESTION':
      return 'knowledge';

    case 'HARDWARE':
      return 'ticket';

    case 'ACCESS':
      return 'ticket';

    case 'UNKNOWN':
    default:
      // Best-effort knowledge lookup; machine will escalate to human if
      // knowledge returns escalation_recommended=true or requires_human.
      return 'knowledge';
  }
}
