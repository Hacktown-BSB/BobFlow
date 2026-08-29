/**
 * TriagePort implementation — connects the intake state machine to the
 * triage agent and downstream services (TRIAGING → TRIAGED → CONTEXT_RETRIEVAL
 * → AGENT_EXECUTING → ACTION_PENDING → RESOLVED states from
 * 06_workflow_architecture.md, ported from PR #2 machine.ts).
 *
 * This is the ONLY wiring change to the intake layer (17_intake_contract.md §3).
 * All states at and after TRIAGING are owned here; intake states are untouched.
 *
 * Connection point: imported and passed as 4th arg to StateMachine in bot.ts.
 */

import type { TriagePort, TriageInput } from './port.js';
import type { TriageResult, KnowledgeResult, IssueResult, TicketResult } from '../db/schema.js';
import { runTriage } from '../agents/triage.js';
import { getRoute } from '../orchestrator/router.js';
import { queryKnowledge } from '../agents/knowledge.js';
import { createIssue } from '../agents/issue.js';
import { createTicket } from '../agents/ticket.js';

// ─── TriagePortImpl ───────────────────────────────────────────────────────────

export class TriagePortImpl implements TriagePort {
  /**
   * Called by StateMachine exactly once per request, after READY_FOR_TRIAGE.
   * Drives: TRIAGING → TRIAGED → CONTEXT_RETRIEVAL → AGENT_EXECUTING
   *         → ACTION_PENDING | RESOLVED
   *
   * Errors inside any step are logged and swallowed — the intake contract
   * (§2b) guarantees that TriagePort failures never break the intake record.
   */
  async onReadyForTriage(input: TriageInput): Promise<void> {
    // ── TRIAGING ──────────────────────────────────────────────────────────────
    let triageResult: TriageResult;
    try {
      triageResult = await runTriage(input);
    } catch (err) {
      console.error('[triage-port] TRIAGING failed; skipping downstream:', err);
      return;
    }
    console.log(
      `[triage-port] TRIAGED request_id=${input.request_id} domain=${triageResult.domain}` +
      ` priority=${triageResult.priority} route=${triageResult.route}` +
      ` confidence=${triageResult.confidence}`,
    );

    // Early exit: triage itself says human required (low confidence / escalation)
    if (triageResult.requires_human) {
      console.log(`[triage-port] requires_human=true → escalating request_id=${input.request_id}`);
      return;
    }

    // ── TRIAGED → CONTEXT_RETRIEVAL → AGENT_EXECUTING ─────────────────────────
    const route = getRoute(triageResult);
    let agentResult: KnowledgeResult | IssueResult | TicketResult;
    try {
      agentResult = await dispatchToAgent(input, triageResult, route);
    } catch (err) {
      console.error(`[triage-port] AGENT_EXECUTING (${route}) failed:`, err);
      return;
    }

    // ── ACTION_PENDING check ───────────────────────────────────────────────────
    const requiresApproval =
      ('requires_human_approval' in agentResult && agentResult.requires_human_approval) ||
      ('requires_human' in agentResult && (agentResult as TicketResult).requires_human);

    if (requiresApproval) {
      console.log(
        `[triage-port] ACTION_PENDING for request_id=${input.request_id}` +
        ` (${route} agent requires human approval)`,
      );
      // Human approval gate — stays ACTION_PENDING until operator acts.
      // The orchestrator (post-hackathon) will wire ACTION_APPROVED / ACTION_REJECTED here.
      return;
    }

    // ── RESOLVED ──────────────────────────────────────────────────────────────
    console.log(`[triage-port] RESOLVED request_id=${input.request_id} via ${route} agent`);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function dispatchToAgent(
  input: TriageInput,
  triageResult: TriageResult,
  route: 'knowledge' | 'issue' | 'ticket',
): Promise<KnowledgeResult | IssueResult | TicketResult> {
  switch (route) {
    case 'knowledge': return queryKnowledge(input, triageResult);
    case 'issue':     return createIssue(input, triageResult);
    case 'ticket':    return createTicket(input, triageResult);
  }
}

// ─── Singleton export (used by bot.ts) ────────────────────────────────────────
export const triagePortImpl: TriagePort = new TriagePortImpl();
