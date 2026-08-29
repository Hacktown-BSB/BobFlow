/**
 * Refinement Agent — orchestration-service
 *
 * Converts an ambiguous raw Slack message into a structured, complete
 * NormalizedRequest. At most 2 clarification rounds; after round 2 it
 * proceeds regardless of completeness.
 *
 * LLM INJECTION POINT:
 *   Replace the stub body of `run()` with an actual LLM call:
 *     const prompt = buildRefinementPrompt(input);
 *     const response = await llmClient.complete(prompt);
 *     return JSON.parse(response.content) as NormalizedRequest;
 *
 *   The LLM should output a valid NormalizedRequest JSON that fills in:
 *     normalized_message, intent, domain_hint, system_hint,
 *     is_complete, clarification_round.
 */

import { v4 as uuid } from 'uuid';
import type { NormalizedRequest } from '@zovaodobob/shared-types';

// ─── AgentRunner interface ─────────────────────────────────────────────────────

export interface AgentRunner<TInput, TOutput> {
  run(input: TInput): Promise<TOutput>;
}

// ─── Refinement input ─────────────────────────────────────────────────────────

export interface RefinementInput {
  raw_message: string;
  clarification_history: Array<{ question: string; answer: string }>;
  slack_user_id: string;
  timestamp: string;
}

// ─── RefinementAgent stub ─────────────────────────────────────────────────────

export class RefinementAgent implements AgentRunner<RefinementInput, NormalizedRequest> {
  /**
   * Stub implementation — returns the raw message as a complete NormalizedRequest.
   *
   * Replace the body with an LLM call (see LLM INJECTION POINT above) to get
   * real clarification-loop behaviour.
   */
  async run(input: RefinementInput): Promise<NormalizedRequest> {
    const now = new Date().toISOString();
    return {
      request_id: uuid(),
      slack_user_id: input.slack_user_id,
      slack_channel_id: '',
      thread_ts: input.timestamp,
      original_message: input.raw_message,
      normalized_message: input.raw_message,
      intent: input.raw_message.slice(0, 120),
      domain_hint: null,
      system_hint: null,
      module_hint: null,
      is_complete: true,            // stub: always complete so FSM does not loop
      clarification_round: 0,
      clarification_history: input.clarification_history,
      attachments: [],
      notes: 'Stub: LLM refinement not yet implemented.',
      created_at: now,
      updated_at: now,
    };
  }
}

export const refinementAgent = new RefinementAgent();
