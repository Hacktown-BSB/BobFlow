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
 *
 * When requiresApproval is true, calls requestApproval() which posts Approve /
 * Reject buttons to the user's Slack channel/thread and awaits the click.
 * If approved (or no Slack client injected), proceeds to RESOLVED.
 * If rejected or timed-out, logs and stops.
 *
 * The §2 security boundary (17_intake_contract.md) is preserved: routing
 * metadata (channel_id, thread_ts) is NOT added to TriageInput. Instead,
 * an optional slackContextResolver callback receives the request_id and
 * returns the routing context exclusively for the approval gate path.
 */

import { randomUUID } from 'crypto';
import type { WebClient } from '@slack/web-api';
import type { TriagePort, TriageInput, SlackRoutingContext } from './port.js';
import type { TriageResult, KnowledgeResult, IssueResult, TicketResult } from '../db/schema.js';
import { runTriage } from '../agents/triage.js';
import { getRoute } from '../orchestrator/router.js';
import { queryKnowledge } from '../agents/knowledge.js';
import { createIssue } from '../agents/issue.js';
import { createTicket } from '../agents/ticket.js';
import { requestApproval } from '../slack/approval.js';

// ─── TriagePortImpl ───────────────────────────────────────────────────────────

export class TriagePortImpl implements TriagePort {
  /**
   * @param slackClient          Optional Slack WebClient used to post the approval prompt.
   *                             When omitted (e.g. in tests) the approval gate is bypassed
   *                             and the flow proceeds directly to RESOLVED.
   * @param slackContextResolver Optional callback that resolves channel_id / thread_ts for
   *                             a given request_id. Used only in the approval path.
   *                             When omitted, approval is posted to an empty channel (no-op).
   */
  constructor(
    private readonly slackClient?: WebClient,
    private readonly slackContextResolver?: (request_id: string) => SlackRoutingContext | null,
  ) {}

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

    if (requiresApproval && this.slackClient) {
      console.log(
        `[triage-port] ACTION_PENDING for request_id=${input.request_id}` +
        ` (${route} agent requires human approval)`,
      );
      const slackCtx = this.slackContextResolver?.(input.request_id) ?? null;
      const actionId = randomUUID();
      const description = buildApprovalDescription(agentResult, triageResult, route);
      const approved = await requestApproval(this.slackClient, {
        channel_id: slackCtx?.channel_id ?? '',
        thread_ts:  slackCtx?.thread_ts  ?? null,
        action_id:  actionId,
        description,
      });
      if (!approved) {
        console.log(`[triage-port] ACTION_REJECTED (or timed out) for request_id=${input.request_id}`);
        return;
      }
      console.log(`[triage-port] ACTION_APPROVED for request_id=${input.request_id}`);
      // Fall through to RESOLVED after approval.
    } else if (requiresApproval) {
      // No Slack client available (e.g. tests) — skip approval gate, proceed.
      console.log(
        `[triage-port] ACTION_PENDING skipped (no Slack client) for request_id=${input.request_id}`,
      );
    }

    // ── RESOLVED ──────────────────────────────────────────────────────────────
    console.log(`[triage-port] RESOLVED request_id=${input.request_id} via ${route} agent`);

    // ── User feedback on Slack ─────────────────────────────────────────────
    if (this.slackClient) {
      const slackCtx = this.slackContextResolver?.(input.request_id) ?? null;
      const feedbackText = buildResolutionFeedback(agentResult, triageResult, route);
      try {
        await this.slackClient.chat.postMessage({
          channel: slackCtx?.channel_id ?? '',
          ...(slackCtx?.thread_ts ? { thread_ts: slackCtx.thread_ts } : {}),
          text: feedbackText,
        });
      } catch (err) {
        console.error(`[triage-port] failed to post Slack feedback for request_id=${input.request_id}:`, err);
      }
    }
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

function buildApprovalDescription(
  agentResult: KnowledgeResult | IssueResult | TicketResult,
  triageResult: TriageResult,
  route: 'knowledge' | 'issue' | 'ticket',
): string {
  if (route === 'issue') {
    const r = agentResult as IssueResult;
    const title = r.github_issue?.title ?? triageResult.domain;
    return `Create GitHub issue: *${title}* — domain: ${triageResult.domain}, priority: ${triageResult.priority}`;
  }
  if (route === 'ticket') {
    const r = agentResult as TicketResult;
    return `Create support ticket: *${r.title}* — queue: ${r.queue}, priority: ${r.priority}`;
  }
  // knowledge — escalation
  return `Escalate to specialist team — domain: ${triageResult.domain}, priority: ${triageResult.priority}`;
}

function buildResolutionFeedback(
  agentResult: KnowledgeResult | IssueResult | TicketResult,
  triageResult: TriageResult,
  route: 'knowledge' | 'issue' | 'ticket',
): string {
  if (route === 'issue') {
    const r = agentResult as IssueResult;
    const title = r.github_issue?.title ?? triageResult.domain;
    return (
      `✅ *Context understood.* Your request has been processed and a GitHub issue has been created in the Samara repository.\n` +
      `*Issue:* ${title}\n` +
      `*Domain:* ${triageResult.domain} · *Priority:* ${triageResult.priority}`
    );
  }
  if (route === 'ticket') {
    const r = agentResult as TicketResult;
    return (
      `✅ *Context understood.* A support ticket has been created.\n` +
      `*Ticket:* ${r.title}\n` +
      `*Queue:* ${r.queue} · *Priority:* ${r.priority}`
    );
  }
  // knowledge
  return `✅ *Context understood.* Your request has been routed to the specialist team — domain: ${triageResult.domain}, priority: ${triageResult.priority}.`;
}

// ─── Factory function (used by bot.ts) ────────────────────────────────────────
export function createTriagePortImpl(
  slackClient: WebClient,
  slackContextResolver: (request_id: string) => SlackRoutingContext | null,
): TriagePort {
  return new TriagePortImpl(slackClient, slackContextResolver);
}
