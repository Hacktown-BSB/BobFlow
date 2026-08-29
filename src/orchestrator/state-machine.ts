import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type { NormalizedRequest } from '../db/schema.js';
import {
  getRequest, setStatus, appendClarificationAnswer,
  applyRefinementOutput, appendTrace, markTriageDispatched, resetTriageDispatched,
} from '../db/repository.js';
import type { RefinementOutput } from '../db/schema.js';
import { loggingTriagePort, toTriageInput } from '../triage/port.js';
import type { TriagePort } from '../triage/port.js';

export type RefinementAgent = (
  request_id: string,
  original_message: string,
  clarification_history: NormalizedRequest['clarification_history'],
  round: number,
) => Promise<RefinementOutput>;

export class StateMachine {
  constructor(
    private db: Database.Database,
    private refinement: RefinementAgent,
    /** Sends a Slack message; returns ts of posted message */
    private sendMessage: (params: { channel_id: string; thread_ts: string | null; text: string }) => Promise<{ ts: string; ok: boolean }>,
    private triagePort: TriagePort = loggingTriagePort,
  ) {}

  /**
   * Called by SlackAdapter after record creation (RECEIVED).
   * Drives: RECEIVED → NORMALIZING → CLARIFICATION_PENDING | READY_FOR_TRIAGE
   */
  async onRequestReceived(request_id: string): Promise<void> {
    const req = getRequest(this.db, request_id);
    if (!req) { console.error(`[sm] unknown request ${request_id}`); return; }

    this._trace(req, {
      agent: 'slack_adapter', from: 'AGGREGATING', to: 'RECEIVED',
      decision: 'New request created from Slack message', confidence: 1.0,
      evidence: [`slack_event_id:${req.slack_event_id}`, `channel:${req.slack_channel_id}`, 'trigger:app_mention'],
      next_action: 'dispatch_to_refinement', result: `request_id:${request_id}`,
    });

    await this._runRefinement(req);
  }

  /**
   * Called by SlackAdapter when a clarification reply arrives.
   * Drives: CLARIFICATION_PENDING → NORMALIZING → READY_FOR_TRIAGE
   */
  async onClarificationReply(params: { request_id: string; answer: string }): Promise<void> {
    const { request_id, answer } = params;
    let req = getRequest(this.db, request_id);
    if (!req || req.status !== 'CLARIFICATION_PENDING') {
      console.warn(`[sm] onClarificationReply: request ${request_id} not CLARIFICATION_PENDING`);
      return;
    }

    req = appendClarificationAnswer(this.db, request_id, answer);

    this._trace(req, {
      agent: 'slack_adapter', from: 'CLARIFICATION_PENDING', to: 'NORMALIZING',
      decision: 'Clarification answer received', confidence: 1.0,
      evidence: [
        `thread_ts:${req.thread_ts ?? 'null'}`,
        `round:${req.clarification_round}`,
        `answer_length:${answer.length}_chars`,
      ],
      next_action: 're_invoke_refinement_llm', result: null,
    });

    await this._runRefinement(req);
  }

  private async _runRefinement(req: NormalizedRequest): Promise<void> {
    // FIX: capture the actual current status BEFORE we transition it, so the
    // Decision Trace reflects the real previous state (may be CLARIFICATION_PENDING
    // on re-invocation after a clarification reply, not always RECEIVED).
    const stateFrom = req.status;
    setStatus(this.db, req.request_id, 'NORMALIZING');

    this._trace(req, {
      agent: 'refinement', from: stateFrom, to: 'NORMALIZING',
      decision: 'Refinement Agent invoked', confidence: 1.0,
      evidence: [`clarification_round:${req.clarification_round}`],
      next_action: 'run_refinement_llm', result: null,
    });

    const output = await this.refinement(
      req.request_id,
      req.original_message,
      req.clarification_history,
      req.clarification_round,
    );

    // Guard: clarification_round never exceeds 2
    const round = Math.min(output.clarification_round, 2) as 0 | 1 | 2;
    output.clarification_round = round;

    const needsClarification = !output.is_complete && round < 2 && output.clarification_question;
    const nextStatus = needsClarification ? 'CLARIFICATION_PENDING' : 'READY_FOR_TRIAGE';

    const updated = applyRefinementOutput(this.db, req.request_id, output, nextStatus);

    if (nextStatus === 'CLARIFICATION_PENDING') {
      this._trace(updated, {
        agent: 'refinement', from: 'NORMALIZING', to: 'CLARIFICATION_PENDING',
        decision: `Clarification required`,
        confidence: 0.72,
        evidence: [
          `domain_hint:${output.domain_hint ?? 'null'}`,
          `clarification_round:${round}`,
        ],
        next_action: 'send_clarification_question', result: `question_sent:round_${round + 1}`,
      });

      await this.sendMessage({
        channel_id: updated.slack_channel_id,
        thread_ts: updated.thread_ts,
        text: output.clarification_question!,
      });
    } else {
      const confidence = output.is_complete ? 0.9 : 0.3;
      this._trace(updated, {
        agent: 'refinement', from: 'NORMALIZING', to: 'READY_FOR_TRIAGE',
        decision: output.is_complete
          ? 'Normalization complete'
          : `Exited refinement after ${round} clarification rounds with is_complete=false`,
        confidence,
        evidence: [
          `is_complete:${output.is_complete}`,
          `clarification_round:${round}`,
          `domain_hint:${output.domain_hint ?? 'null'}`,
        ],
        next_action: 'dispatch_to_triage',
        result: output.is_complete
          ? `normalized_message_length:${output.normalized_message.length}_chars`
          : 'partial_normalization',
      });

      // ── Triage handoff (2a: exactly once, persisted; 2b: never breaks intake) ──
      // D1 fix: set the flag AFTER the port resolves so a failing port leaves the
      // request retryable.  We still use markTriageDispatched as an optimistic CAS
      // lock to win the race, then reset it in the catch if the port throws.
      const won = markTriageDispatched(this.db, updated.request_id);
      if (won) {
        this._trace(updated, {
          agent: 'orchestrator', from: 'READY_FOR_TRIAGE', to: 'READY_FOR_TRIAGE',
          decision: 'Dispatching TriageInput to TriagePort',
          confidence: 1.0,
          evidence: [`request_id:${updated.request_id}`],
          next_action: 'triage_port_onReadyForTriage',
          result: null,
        });
        try {
          await this.triagePort.onReadyForTriage(toTriageInput(updated));
        } catch (err) {
          // 2b: port failure must not break intake — reset flag so retry can re-dispatch,
          // log, trace, leave at READY_FOR_TRIAGE.
          resetTriageDispatched(this.db, updated.request_id);
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[sm] TriagePort threw; request stays READY_FOR_TRIAGE:', msg);
          this._trace(updated, {
            agent: 'orchestrator', from: 'READY_FOR_TRIAGE', to: 'READY_FOR_TRIAGE',
            decision: 'TriagePort dispatch failed; request stays READY_FOR_TRIAGE for retry',
            confidence: 0.0,
            evidence: [`error:${msg}`],
            next_action: 'retry_triage_dispatch',
            result: `triage_port_error:${msg}`,
          });
        }
      }
    }
  }

  private _trace(
    req: NormalizedRequest,
    opts: {
      agent: string; from: string; to: string; decision: string;
      confidence: number; evidence: string[]; next_action: string; result: string | null;
    },
  ): void {
    appendTrace(this.db, req.request_id, {
      step_id: randomUUID(),
      timestamp: new Date().toISOString(),
      agent: opts.agent,
      state_from: opts.from,
      state_to: opts.to,
      decision: opts.decision,
      confidence: opts.confidence,
      evidence: opts.evidence,
      context_source: ['slack_message'],
      next_action: opts.next_action,
      result: opts.result,
    });
  }
}
