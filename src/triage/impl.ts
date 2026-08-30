/**
 * TriagePort implementation — connects the intake state machine to the
 * triage agent and downstream services (TRIAGING → TRIAGED → CONTEXT_RETRIEVAL
 * → AGENT_EXECUTING → ACTION_PENDING → RESOLVED states from
 * 06_workflow_architecture.md, ported from PR #2 machine.ts).
 *
 * Phase 2 (post-triage persistence + Slack notification):
 *   Previously every state at/after TRIAGING ran only in memory (console.log),
 *   persisted nothing and never replied to Slack — the requester saw the
 *   conversation die (defects P1 #4 and P1 #5). This implementation now:
 *     - advances `status` through the post-triage states,
 *     - persists the TriageResult and downstream agent result,
 *     - continues the Decision Trace past "Dispatching TriageInput",
 *     - notifies the requester in Slack at each milestone.
 *
 * The §2 handoff contract still holds: TriageInput deliberately excludes Slack
 * routing metadata so the classifier never sees it. Delivery is a SEPARATE
 * concern — we re-read the persisted record by request_id only to post the
 * reply, never feeding routing metadata back into classification.
 *
 * Connection point: constructed with (db, sendMessage) and passed as the 4th
 * arg to StateMachine in bot.ts.
 */

import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type { TriagePort, TriageInput } from './port.js';
import type { TriageResult, KnowledgeResult, IssueResult, TicketResult } from '../db/schema.js';
import { runTriage } from '../agents/triage.js';
import { getRoute } from '../orchestrator/router.js';
import { queryKnowledge } from '../agents/knowledge.js';
import { createIssue } from '../agents/issue.js';
import { createTicket } from '../agents/ticket.js';
import {
  appendTrace, setStatus, getRequest, saveTriageResult, saveAgentResult,
} from '../db/repository.js';

type AgentServiceRoute = 'knowledge' | 'issue' | 'ticket';
type AgentResult = KnowledgeResult | IssueResult | TicketResult;

/** Slack delivery function, injected to keep this module I/O-agnostic for tests. */
export type PortSendMessage = (
  params: { channel_id: string; thread_ts: string | null; text: string },
) => Promise<{ ts: string; ok: boolean }>;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── TriagePortImpl ───────────────────────────────────────────────────────────

export class TriagePortImpl implements TriagePort {
  /**
   * @param db           when provided, post-triage state/results/trace are persisted.
   * @param sendMessage  when provided, the requester is notified in Slack.
   *
   * Both are optional so tests can construct a bare port (see intake-loop (p)).
   */
  constructor(
    private db?: Database.Database,
    private sendMessage?: PortSendMessage,
  ) {}

  /**
   * Called by StateMachine exactly once per request, after READY_FOR_TRIAGE.
   * Drives: TRIAGING → TRIAGED → AGENT_EXECUTING → ACTION_PENDING | RESOLVED | ESCALATED
   *
   * Errors inside any step are logged and swallowed — the intake contract
   * (§2b) guarantees that TriagePort failures never break the intake record.
   */
  async onReadyForTriage(input: TriageInput): Promise<void> {
    const rid = input.request_id;

    // ── TRIAGING ──────────────────────────────────────────────────────────────
    this._status(rid, 'TRIAGING');
    let triageResult: TriageResult;
    try {
      triageResult = await runTriage(input);
    } catch (err) {
      console.error('[triage-port] TRIAGING failed; skipping downstream:', err);
      this._trace(rid, {
        agent: 'triage', from: 'TRIAGING', to: 'TRIAGING',
        decision: 'Triage agent threw', confidence: 0,
        evidence: [`error:${errMessage(err)}`],
        next_action: 'none', result: `triage_error:${errMessage(err)}`,
      });
      return;
    }

    // ── TRIAGED (persist + trace + notify) ─────────────────────────────────────
    this._saveTriage(rid, triageResult);
    this._status(rid, 'TRIAGED');
    this._trace(rid, {
      agent: 'triage', from: 'TRIAGING', to: 'TRIAGED',
      decision: `domain=${triageResult.domain} priority=${triageResult.priority} route=${triageResult.route}`,
      confidence: triageResult.confidence,
      evidence: triageResult.evidence.slice(0, 5),
      next_action: 'dispatch_to_agent', result: `triaged:${triageResult.domain}`,
    });
    console.log(
      `[triage-port] TRIAGED request_id=${rid} domain=${triageResult.domain}` +
      ` priority=${triageResult.priority} route=${triageResult.route}` +
      ` confidence=${triageResult.confidence}`,
    );
    await this._notify(rid, this._ackMessage(triageResult));

    // Early exit: triage itself says human required (low confidence / escalation)
    if (triageResult.requires_human) {
      this._status(rid, 'ESCALATED');
      this._trace(rid, {
        agent: 'triage', from: 'TRIAGED', to: 'ESCALATED',
        decision: 'requires_human=true', confidence: triageResult.confidence,
        evidence: [`confidence:${triageResult.confidence}`],
        next_action: 'human_review', result: 'escalated',
      });
      console.log(`[triage-port] requires_human=true → escalating request_id=${rid}`);
      await this._notify(
        rid,
        `🔺 Seu chamado foi classificado como *${triageResult.domain}* (prioridade *${triageResult.priority}*), ` +
        `mas precisa de análise humana. Um atendente vai assumir a partir daqui.`,
      );
      return;
    }

    // ── AGENT_EXECUTING ────────────────────────────────────────────────────────
    this._status(rid, 'AGENT_EXECUTING');
    const route = getRoute(triageResult);
    let agentResult: AgentResult;
    try {
      agentResult = await dispatchToAgent(input, triageResult, route);
    } catch (err) {
      console.error(`[triage-port] AGENT_EXECUTING (${route}) failed:`, err);
      this._status(rid, 'ESCALATED');
      this._trace(rid, {
        agent: route, from: 'AGENT_EXECUTING', to: 'ESCALATED',
        decision: `agent ${route} threw`, confidence: 0,
        evidence: [`error:${errMessage(err)}`],
        next_action: 'human_review', result: `agent_error:${errMessage(err)}`,
      });
      await this._notify(
        rid,
        `⚠️ Encontrei um problema ao processar seu chamado (*${triageResult.domain}*). ` +
        `Escalei para um atendente humano.`,
      );
      return;
    }

    this._saveAgent(rid, agentResult);
    this._trace(rid, {
      agent: route, from: 'AGENT_EXECUTING', to: 'AGENT_EXECUTING',
      decision: `agent ${route} executed`, confidence: 1,
      evidence: [`route:${route}`], next_action: 'evaluate_action', result: 'agent_done',
    });

    // ── ACTION_PENDING check ───────────────────────────────────────────────────
    const requiresApproval =
      ('requires_human_approval' in agentResult && agentResult.requires_human_approval) ||
      ('requires_human' in agentResult && (agentResult as TicketResult).requires_human);

    if (requiresApproval) {
      this._status(rid, 'ACTION_PENDING');
      this._trace(rid, {
        agent: route, from: 'AGENT_EXECUTING', to: 'ACTION_PENDING',
        decision: `${route} agent requires human approval`, confidence: 1,
        evidence: [`route:${route}`], next_action: 'await_approval', result: 'action_pending',
      });
      console.log(
        `[triage-port] ACTION_PENDING for request_id=${rid}` +
        ` (${route} agent requires human approval)`,
      );
      await this._notify(rid, this._actionPendingMessage(route, agentResult));
      return;
    }

    // ── RESOLVED ──────────────────────────────────────────────────────────────
    this._status(rid, 'RESOLVED');
    this._trace(rid, {
      agent: route, from: 'AGENT_EXECUTING', to: 'RESOLVED',
      decision: `resolved via ${route} agent`, confidence: 1,
      evidence: [`route:${route}`], next_action: 'none', result: 'resolved',
    });
    console.log(`[triage-port] RESOLVED request_id=${rid} via ${route} agent`);
    await this._notify(rid, this._resolvedMessage(route, triageResult, agentResult));
  }

  // ─── persistence / status / trace (all guarded on this.db) ──────────────────

  private _status(request_id: string, status: string): void {
    if (this.db) setStatus(this.db, request_id, status);
  }

  private _saveTriage(request_id: string, result: TriageResult): void {
    if (this.db) saveTriageResult(this.db, request_id, result);
  }

  private _saveAgent(request_id: string, result: AgentResult): void {
    if (this.db) saveAgentResult(this.db, request_id, result);
  }

  private _trace(
    request_id: string,
    opts: {
      agent: string; from: string; to: string; decision: string;
      confidence: number; evidence: string[]; next_action: string; result: string | null;
    },
  ): void {
    if (!this.db) return;
    appendTrace(this.db, request_id, {
      step_id: randomUUID(),
      timestamp: new Date().toISOString(),
      agent: opts.agent,
      state_from: opts.from,
      state_to: opts.to,
      decision: opts.decision,
      confidence: opts.confidence,
      evidence: opts.evidence,
      context_source: ['triage_port'],
      next_action: opts.next_action,
      result: opts.result,
    });
  }

  // ─── Slack notification (guarded on this.db + this.sendMessage) ──────────────

  /**
   * Re-reads the persisted record for its Slack routing metadata and posts a
   * reply. Delivery-only: routing metadata never re-enters classification.
   */
  private async _notify(request_id: string, text: string): Promise<void> {
    if (!this.db || !this.sendMessage) return;
    const req = getRequest(this.db, request_id);
    if (!req) return;
    try {
      await this.sendMessage({
        channel_id: req.slack_channel_id,
        thread_ts: req.thread_ts,
        text,
      });
    } catch (err) {
      console.error('[triage-port] notify failed:', errMessage(err));
    }
  }

  // ─── Message builders (Portuguese — user-facing) ────────────────────────────

  private _ackMessage(t: TriageResult): string {
    return `✅ Recebi seu chamado e classifiquei como *${t.domain}* · prioridade *${t.priority}*. ` +
           `Encaminhando para o time responsável…`;
  }

  private _actionPendingMessage(route: AgentServiceRoute, r: AgentResult): string {
    if (route === 'issue') {
      const title = (r as IssueResult).github_issue?.title;
      return `🛠️ Preparei um registro de engenharia${title ? `: *${title}*` : ''}. ` +
             `A ação precisa da aprovação de um responsável antes de seguir — você será avisado quando concluir.`;
    }
    if (route === 'ticket') {
      const t = r as TicketResult;
      return `🎫 Preparei um ticket na fila *${t.queue}* (ref *${t.ticket_id.slice(0, 8)}*). ` +
             `Aguardando aprovação para envio.`;
    }
    return `⏳ Seu chamado gerou uma ação que precisa de aprovação humana. Você será avisado quando for concluída.`;
  }

  private _resolvedMessage(route: AgentServiceRoute, t: TriageResult, r: AgentResult): string {
    if (route === 'knowledge') {
      const k = r as KnowledgeResult;
      if (k.resolved && k.answer) return `💡 ${k.answer}`;
      return `🔎 Não encontrei uma resposta automática para o seu chamado (*${t.domain}*). ` +
             `Vou escalar para um atendente.`;
    }
    if (route === 'ticket') {
      const tk = r as TicketResult;
      return `🎫 Seu chamado virou o ticket *${tk.ticket_id.slice(0, 8)}* na fila *${tk.queue}*.`;
    }
    // issue
    return `🛠️ Registrei seu chamado de *${t.domain}* para o time de engenharia. ` +
           `Acompanhe as atualizações por aqui.`;
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function dispatchToAgent(
  input: TriageInput,
  triageResult: TriageResult,
  route: AgentServiceRoute,
): Promise<AgentResult> {
  switch (route) {
    case 'knowledge': return queryKnowledge(input, triageResult);
    case 'issue':     return createIssue(input, triageResult);
    case 'ticket':    return createTicket(input, triageResult);
  }
}
