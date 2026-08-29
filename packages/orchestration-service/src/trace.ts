/**
 * Decision Trace utilities — orchestration-service
 *
 * Provides `appendTraceStep` which pushes a new DecisionTraceStep into
 * OrchestratorContext.trace.steps.  Called from every state `entry` action
 * in the XState machine so that the full state-transition history is captured.
 */

import { v4 as uuid } from 'uuid';
import type { DecisionTrace, DecisionTraceStep } from '@zovaodobob/shared-types';

// ─── Types re-exported for convenience ───────────────────────────────────────

export type { DecisionTrace, DecisionTraceStep };

// ─── appendTraceStep ──────────────────────────────────────────────────────────

/**
 * Appends an immutable audit step to the Decision Trace.
 *
 * @param trace    The mutable trace object living in OrchestratorContext.
 * @param from     The FSM state being left (empty string on first entry).
 * @param to       The FSM state being entered.
 * @param agent    Agent name performing the transition (e.g. `'orchestrator'`).
 * @param decision Human-readable description of the decision made at this step.
 *
 * The function mutates `trace.steps` in place — this is intentional:
 * XState `assign` actions receive a draft context snapshot and the mutation
 * is applied to a copy before being committed.
 */
export function appendTraceStep(
  trace: DecisionTrace,
  from: string,
  to: string,
  agent: string,
  decision: string,
): void {
  const step: DecisionTraceStep = {
    step_id: uuid(),
    timestamp: new Date().toISOString(),
    agent,
    state_from: from,
    state_to: to,
    decision,
    confidence: 1.0,
    evidence: [],
    context_source: ['slack_message'],
    next_action: to,
    result: null,
  };
  trace.steps.push(step);
}

// ─── makeEmptyTrace ───────────────────────────────────────────────────────────

/**
 * Constructs an empty DecisionTrace for a new request.
 */
export function makeEmptyTrace(requestId: string): DecisionTrace {
  return {
    trace_id: uuid(),
    request_id: requestId,
    steps: [],
    final_outcome: '',
    resolved_at: null,
  };
}
