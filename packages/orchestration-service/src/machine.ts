/**
 * Orchestrator State Machine — orchestration-service
 *
 * Implements the full XState v5 statechart for the request lifecycle defined
 * in knowledge/06_workflow_architecture.md and the implementation plan
 * (Sub-Task 3).
 *
 * States (13 total):
 *   RECEIVED → NORMALIZING → CLARIFICATION_PENDING → READY_FOR_TRIAGE
 *   → TRIAGING → TRIAGED → CONTEXT_RETRIEVAL → AGENT_EXECUTING
 *   → ACTION_PENDING → ACTION_EXECUTED → VERIFYING → RESOLVED
 *   Failure: ESCALATED, ABANDONED
 *
 * CRITICAL parallel compound state:
 *   When priority=CRITICAL in TRIAGED, the machine enters a parallel state
 *   with two concurrent regions:
 *     Region 1 (AGENT_EXECUTING path)
 *     Region 2 (HUMAN_APPROVAL_GATE notification)
 *
 * Timeouts (via XState after()):
 *   CLARIFICATION_PENDING  30 min  → READY_FOR_TRIAGE (partial data)
 *   AGENT_EXECUTING        60 s    → retry once → ESCALATED
 *   ACTION_PENDING          4 h    → ESCALATED
 */

import { setup, assign, fromPromise } from 'xstate';
import { v4 as uuid } from 'uuid';
import type {
  NormalizedRequest,
  TriageResult,
  KnowledgeResult,
  IssueResult,
  TicketResult,
} from '@zovaodobob/shared-types';
import type { DecisionTrace } from './trace.js';
import { appendTraceStep, makeEmptyTrace } from './trace.js';
import { refinementAgent } from './agents/refinement.js';
import { triageAgent } from './agents/triage.js';
import { getRoute } from './router.js';
import { callKnowledge, callIssue, callTicket } from './http/agent-client.js';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface OrchestratorContext {
  request: NormalizedRequest;
  triageResult: TriageResult | null;
  agentResult: KnowledgeResult | IssueResult | TicketResult | null;
  trace: DecisionTrace;
  retryCount: number;
  error: string | null;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type OrchestratorEvent =
  | { type: 'RECEIVED' }
  | { type: 'NORMALIZING_COMPLETE'; request: NormalizedRequest }
  | { type: 'CLARIFICATION_REPLY'; message: string }
  | { type: 'TRIAGE_COMPLETE'; triageResult: TriageResult }
  | { type: 'CONTEXT_LOADED' }
  | { type: 'AGENT_COMPLETE'; result: KnowledgeResult | IssueResult | TicketResult }
  | { type: 'ACTION_APPROVED' }
  | { type: 'ACTION_REJECTED' }
  | { type: 'HUMAN_ESCALATE' }
  | { type: 'AGENT_TIMEOUT' }
  | { type: 'RESOLVE' }
  | { type: 'ABANDON' };

// ─── Input ────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  request: NormalizedRequest;
}

// ─── Machine ──────────────────────────────────────────────────────────────────

export const orchestratorMachine = setup({
  types: {
    context: {} as OrchestratorContext,
    events: {} as OrchestratorEvent,
    input: {} as OrchestratorInput,
  },

  actors: {
    // Invokes the Refinement Agent — converts raw message into NormalizedRequest
    refinementActor: fromPromise<NormalizedRequest, { request: NormalizedRequest }>(
      async ({ input }) => {
        return refinementAgent.run({
          raw_message: input.request.original_message,
          clarification_history: input.request.clarification_history,
          slack_user_id: input.request.slack_user_id,
          timestamp: input.request.created_at,
        });
      },
    ),

    // Invokes the Triage Agent — classifies domain, priority, route
    triageActor: fromPromise<TriageResult, { request: NormalizedRequest }>(
      async ({ input }) => {
        return triageAgent.run({ normalized_request: input.request });
      },
    ),

    // Invokes the correct downstream agent service via the routing guard
    agentServiceActor: fromPromise<
      KnowledgeResult | IssueResult | TicketResult,
      { request: NormalizedRequest; triageResult: TriageResult }
    >(async ({ input }) => {
      const route = getRoute(input.triageResult);
      switch (route) {
        case 'knowledge':
          return callKnowledge(input.request, input.triageResult);
        case 'issue':
          return callIssue(input.request, input.triageResult);
        case 'ticket':
          return callTicket(input.request, input.triageResult);
      }
    }),

    // Stub for the HUMAN_APPROVAL_GATE parallel region notification
    humanApprovalGateActor: fromPromise<void, { request: NormalizedRequest }>(
      async ({ input: _input }) => {
        // TODO: send Slack approval request via sender.sendApprovalRequest()
        // This will remain pending until the human sends ACTION_APPROVED/REJECTED.
      },
    ),
  },

  guards: {
    // True when refinement declares the request is ready (no clarification needed)
    isComplete: ({ context }) =>
      context.request.is_complete || context.request.clarification_round >= 2,

    // True when triage requires a human (low confidence < 0.6)
    requiresHuman: ({ context }) => context.triageResult?.requires_human === true,

    // True when the triage result is CRITICAL priority
    isCritical: ({ context }) => context.triageResult?.priority === 'CRITICAL',

    // True when we still have a retry left
    canRetry: ({ context }) => context.retryCount < 1,

    // True when the agent result needs human approval before action
    requiresApproval: ({ context }) => {
      const r = context.agentResult;
      if (r === null) return false;
      if ('requires_human_approval' in r) return r.requires_human_approval;
      if ('requires_human' in r) return (r as TicketResult).requires_human;
      return false;
    },
  },

  actions: {
    // ── Context assignment actions ──────────────────────────────────────────

    incrementRetry: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),

    assignError: assign({
      error: ({ event }) => {
        const e = event as { type: string; error?: unknown };
        return e.error instanceof Error ? e.error.message : String(e.error ?? 'unknown error');
      },
    }),

    markResolved: assign({
      trace: ({ context }) => {
        const updated = { ...context.trace };
        updated.final_outcome = 'RESOLVED';
        updated.resolved_at = new Date().toISOString();
        return updated;
      },
    }),

    markEscalated: assign({
      trace: ({ context }) => {
        const updated = { ...context.trace };
        updated.final_outcome = 'ESCALATED';
        updated.resolved_at = new Date().toISOString();
        return updated;
      },
    }),

    markAbandoned: assign({
      trace: ({ context }) => {
        const updated = { ...context.trace };
        updated.final_outcome = 'ABANDONED';
        updated.resolved_at = new Date().toISOString();
        return updated;
      },
    }),

    // ── Decision Trace append actions (called on every state entry) ─────────

    traceReceived: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, '', 'RECEIVED', 'orchestrator', 'Request received from Slack');
        return t;
      },
    }),

    traceNormalizing: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'RECEIVED', 'NORMALIZING', 'refinement', 'Refinement Agent invoked');
        return t;
      },
    }),

    traceClarificationPending: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'NORMALIZING', 'CLARIFICATION_PENDING', 'refinement', 'Clarification required — awaiting Slack reply');
        return t;
      },
    }),

    traceReadyForTriage: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'CLARIFICATION_PENDING', 'READY_FOR_TRIAGE', 'orchestrator', 'Request normalized — ready for triage');
        return t;
      },
    }),

    traceTriaging: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'READY_FOR_TRIAGE', 'TRIAGING', 'triage', 'Triage Agent invoked');
        return t;
      },
    }),

    traceTriaged: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        const r = context.triageResult;
        appendTraceStep(
          t,
          'TRIAGING',
          'TRIAGED',
          'triage',
          r ? `Domain=${r.domain} Priority=${r.priority} Route=${r.route}` : 'Triage complete',
        );
        return t;
      },
    }),

    traceContextRetrieval: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'TRIAGED', 'CONTEXT_RETRIEVAL', 'orchestrator', 'Loading domain-specific context');
        return t;
      },
    }),

    traceAgentExecuting: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        const route = context.triageResult ? getRoute(context.triageResult) : 'knowledge';
        appendTraceStep(t, 'CONTEXT_RETRIEVAL', 'AGENT_EXECUTING', 'orchestrator', `Calling ${route} service`);
        return t;
      },
    }),

    traceActionPending: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'AGENT_EXECUTING', 'ACTION_PENDING', 'orchestrator', 'Awaiting human approval for action');
        return t;
      },
    }),

    traceActionExecuted: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'ACTION_PENDING', 'ACTION_EXECUTED', 'orchestrator', 'Action approved and executed');
        return t;
      },
    }),

    traceVerifying: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'ACTION_EXECUTED', 'VERIFYING', 'orchestrator', 'Verifying action result');
        return t;
      },
    }),

    traceResolved: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, 'VERIFYING', 'RESOLVED', 'orchestrator', 'Request resolved — notifying user');
        return t;
      },
    }),

    traceEscalated: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, '', 'ESCALATED', 'orchestrator', 'Request escalated to human');
        return t;
      },
    }),

    traceAbandoned: assign({
      trace: ({ context }) => {
        const t = { ...context.trace, steps: [...context.trace.steps] };
        appendTraceStep(t, '', 'ABANDONED', 'orchestrator', 'Request abandoned — total lifetime exceeded 72h');
        return t;
      },
    }),
  },
}).createMachine({
  id: 'orchestrator',

  context: ({ input }: { input: OrchestratorInput }): OrchestratorContext => ({
    request: input.request,
    triageResult: null,
    agentResult: null,
    trace: makeEmptyTrace(input.request.request_id),
    retryCount: 0,
    error: null,
  }),

  initial: 'RECEIVED',

  states: {
    // ── RECEIVED ─────────────────────────────────────────────────────────────
    RECEIVED: {
      entry: ['traceReceived'],
      always: { target: 'NORMALIZING' },
    },

    // ── NORMALIZING ───────────────────────────────────────────────────────────
    NORMALIZING: {
      entry: ['traceNormalizing'],
      invoke: {
        id: 'refinement',
        src: 'refinementActor',
        input: ({ context }) => ({ request: context.request }),
        onDone: [
          {
            // Refinement returned is_complete=true OR max rounds reached
            guard: ({ event }) =>
              (event as { output: NormalizedRequest }).output.is_complete ||
              (event as { output: NormalizedRequest }).output.clarification_round >= 2,
            actions: assign({
              request: ({ event }) =>
                (event as { type: string; output: NormalizedRequest }).output,
            }),
            target: 'READY_FOR_TRIAGE',
          },
          {
            // Refinement needs a clarification round
            actions: assign({
              request: ({ event }) =>
                (event as { type: string; output: NormalizedRequest }).output,
            }),
            target: 'CLARIFICATION_PENDING',
          },
        ],
        onError: {
          actions: ['assignError'],
          target: 'ESCALATED',
        },
      },
    },

    // ── CLARIFICATION_PENDING ─────────────────────────────────────────────────
    CLARIFICATION_PENDING: {
      entry: ['traceClarificationPending'],
      on: {
        // Employee replied in the Slack thread
        CLARIFICATION_REPLY: {
          actions: assign({
            request: ({ context, event }) => ({
              ...context.request,
              // Append the reply to history; refinement will merge it on next round
              clarification_history: [
                ...context.request.clarification_history,
                { question: '(pending)', answer: event.message },
              ],
              updated_at: new Date().toISOString(),
            }),
          }),
          target: 'NORMALIZING',
        },
      },
      // 30-minute timeout — proceed with partial info
      after: {
        1_800_000: {
          actions: ['traceReadyForTriage'],
          target: 'READY_FOR_TRIAGE',
        },
      },
    },

    // ── READY_FOR_TRIAGE ──────────────────────────────────────────────────────
    READY_FOR_TRIAGE: {
      entry: ['traceReadyForTriage'],
      always: { target: 'TRIAGING' },
    },

    // ── TRIAGING ──────────────────────────────────────────────────────────────
    TRIAGING: {
      entry: ['traceTriaging'],
      invoke: {
        id: 'triage',
        src: 'triageActor',
        input: ({ context }) => ({ request: context.request }),
        onDone: [
          {
            guard: ({ event }) =>
              (event as { output: TriageResult }).output.requires_human,
            actions: assign({
              triageResult: ({ event }) =>
                (event as { type: string; output: TriageResult }).output,
            }),
            target: 'ESCALATED',
          },
          {
            actions: assign({
              triageResult: ({ event }) =>
                (event as { type: string; output: TriageResult }).output,
            }),
            target: 'TRIAGED',
          },
        ],
        onError: {
          actions: ['assignError'],
          target: 'ESCALATED',
        },
      },
      // 60-second timeout — retry once then escalate
      after: {
        60_000: [
          {
            guard: 'canRetry',
            actions: ['incrementRetry'],
            target: 'TRIAGING',
          },
          {
            target: 'ESCALATED',
          },
        ],
      },
    },

    // ── TRIAGED ───────────────────────────────────────────────────────────────
    // For CRITICAL priority: enter a parallel compound state.
    // For all other priorities: proceed linearly.
    TRIAGED: {
      entry: ['traceTriaged'],
      always: [
        {
          guard: 'isCritical',
          target: 'TRIAGED_CRITICAL',
        },
        {
          target: 'CONTEXT_RETRIEVAL',
        },
      ],
    },

    // ── TRIAGED_CRITICAL (parallel) ───────────────────────────────────────────
    // Region 1: normal AGENT_EXECUTING path (Issue/Incident service)
    // Region 2: HUMAN_APPROVAL_GATE notification
    TRIAGED_CRITICAL: {
      type: 'parallel',
      states: {
        AGENT_REGION: {
          initial: 'CONTEXT_RETRIEVAL_CRITICAL',
          states: {
            CONTEXT_RETRIEVAL_CRITICAL: {
              always: { target: 'AGENT_EXECUTING_CRITICAL' },
            },
            AGENT_EXECUTING_CRITICAL: {
              invoke: {
                id: 'agentServiceCritical',
                src: 'agentServiceActor',
                input: ({ context }) => ({
                  request: context.request,
                  triageResult: context.triageResult!,
                }),
                onDone: {
                  actions: assign({
                    agentResult: ({ event }) =>
                      (event as {
                        type: string;
                        output: KnowledgeResult | IssueResult | TicketResult;
                      }).output,
                  }),
                  target: 'AGENT_DONE_CRITICAL',
                },
                onError: {
                  target: 'AGENT_DONE_CRITICAL',
                },
              },
              after: {
                60_000: { target: 'AGENT_DONE_CRITICAL' },
              },
            },
            AGENT_DONE_CRITICAL: {
              type: 'final',
            },
          },
        },
        HUMAN_APPROVAL_GATE: {
          initial: 'NOTIFYING',
          states: {
            NOTIFYING: {
              invoke: {
                id: 'humanApprovalGate',
                src: 'humanApprovalGateActor',
                input: ({ context }) => ({ request: context.request }),
                onDone: { target: 'AWAITING_APPROVAL' },
                onError: { target: 'AWAITING_APPROVAL' },
              },
            },
            AWAITING_APPROVAL: {
              on: {
                ACTION_APPROVED: { target: 'APPROVED' },
                ACTION_REJECTED: { target: 'REJECTED' },
              },
              after: {
                14_400_000: { target: 'REJECTED' },
              },
            },
            APPROVED: {
              type: 'final',
            },
            REJECTED: {
              type: 'final',
            },
          },
        },
      },
      onDone: [
        {
          target: 'ACTION_PENDING',
        },
      ],
    },

    // ── CONTEXT_RETRIEVAL ─────────────────────────────────────────────────────
    CONTEXT_RETRIEVAL: {
      entry: ['traceContextRetrieval'],
      always: { target: 'AGENT_EXECUTING' },
    },

    // ── AGENT_EXECUTING ───────────────────────────────────────────────────────
    AGENT_EXECUTING: {
      entry: ['traceAgentExecuting'],
      invoke: {
        id: 'agentService',
        src: 'agentServiceActor',
        input: ({ context }) => ({
          request: context.request,
          triageResult: context.triageResult!,
        }),
        onDone: [
          {
            // If the result requires human approval → ACTION_PENDING
            guard: ({ context, event }) => {
              const result = (event as { output: KnowledgeResult | IssueResult | TicketResult })
                .output;
              void context;
              if ('requires_human_approval' in result) return result.requires_human_approval;
              if ('requires_human' in result) return (result as TicketResult).requires_human;
              return false;
            },
            actions: assign({
              agentResult: ({ event }) =>
                (event as {
                  type: string;
                  output: KnowledgeResult | IssueResult | TicketResult;
                }).output,
            }),
            target: 'ACTION_PENDING',
          },
          {
            actions: assign({
              agentResult: ({ event }) =>
                (event as {
                  type: string;
                  output: KnowledgeResult | IssueResult | TicketResult;
                }).output,
            }),
            target: 'VERIFYING',
          },
        ],
        onError: [
          {
            guard: 'canRetry',
            actions: ['assignError', 'incrementRetry'],
            target: 'AGENT_EXECUTING',
          },
          {
            actions: ['assignError'],
            target: 'ESCALATED',
          },
        ],
      },
      // 60-second timeout — retry once then escalate
      after: {
        60_000: [
          {
            guard: 'canRetry',
            actions: ['incrementRetry'],
            target: 'AGENT_EXECUTING',
          },
          {
            target: 'ESCALATED',
          },
        ],
      },
    },

    // ── ACTION_PENDING ────────────────────────────────────────────────────────
    ACTION_PENDING: {
      entry: ['traceActionPending'],
      on: {
        ACTION_APPROVED: { target: 'ACTION_EXECUTED' },
        ACTION_REJECTED: { target: 'ESCALATED' },
        HUMAN_ESCALATE: { target: 'ESCALATED' },
      },
      // 4-hour timeout → auto-escalate
      after: {
        14_400_000: {
          target: 'ESCALATED',
        },
      },
    },

    // ── ACTION_EXECUTED ───────────────────────────────────────────────────────
    ACTION_EXECUTED: {
      entry: ['traceActionExecuted'],
      always: { target: 'VERIFYING' },
    },

    // ── VERIFYING ─────────────────────────────────────────────────────────────
    VERIFYING: {
      entry: ['traceVerifying'],
      always: { target: 'RESOLVED' },
    },

    // ── RESOLVED ──────────────────────────────────────────────────────────────
    RESOLVED: {
      type: 'final',
      entry: ['traceResolved', 'markResolved'],
    },

    // ── ESCALATED ─────────────────────────────────────────────────────────────
    ESCALATED: {
      type: 'final',
      entry: ['traceEscalated', 'markEscalated'],
    },

    // ── ABANDONED ─────────────────────────────────────────────────────────────
    // Total request lifetime > 72h — set externally by a scheduler that sends
    // the ABANDON event, or via a 72h timer from an outer state if needed.
    ABANDONED: {
      type: 'final',
      entry: ['traceAbandoned', 'markAbandoned'],
    },
  },

  on: {
    // Global ABANDON event — can arrive at any point
    ABANDON: {
      target: '.ABANDONED',
    },
    // Global human escalation — can arrive at any point
    HUMAN_ESCALATE: {
      target: '.ESCALATED',
    },
  },
});

export type OrchestratorMachine = typeof orchestratorMachine;
