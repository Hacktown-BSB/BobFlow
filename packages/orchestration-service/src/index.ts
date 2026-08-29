/**
 * Orchestration Service — public entry point
 *
 * Exports `createRequestActor` which is the single factory for spinning up
 * a new XState orchestrator actor per incoming request.  Callers (e.g. the
 * Slack dispatcher in packages/slack-service) call this function and then
 * hold onto the returned `ActorRef` to send events (CLARIFICATION_REPLY,
 * ACTION_APPROVED, ACTION_REJECTED, ABANDON, HUMAN_ESCALATE) to the
 * in-flight actor.
 */

import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { NormalizedRequest } from '@zovaodobob/shared-types';
import { orchestratorMachine } from './machine.js';
import type { OrchestratorContext, OrchestratorEvent, OrchestratorMachine } from './machine.js';

export type { OrchestratorContext, OrchestratorEvent, OrchestratorMachine };
export { orchestratorMachine } from './machine.js';

export type OrchestratorActorRef = Actor<OrchestratorMachine>;

/**
 * Creates and starts a new orchestrator actor for the given request.
 *
 * @param request  A fully formed NormalizedRequest (typically built by the
 *                 Slack adapter or a unit test fixture).
 * @returns        A running XState actor.  The caller must hold a reference
 *                 to this actor to send events and read snapshots.
 *
 * @example
 * ```ts
 * const actor = createRequestActor(normalizedRequest);
 * // Send a thread reply from Slack:
 * actor.send({ type: 'CLARIFICATION_REPLY', message: replyText });
 * // Approve a pending action:
 * actor.send({ type: 'ACTION_APPROVED' });
 * // Subscribe to state changes:
 * actor.subscribe(snapshot => console.log(snapshot.value));
 * ```
 */
export function createRequestActor(request: NormalizedRequest): OrchestratorActorRef {
  const actor = createActor(orchestratorMachine, { input: { request } });
  actor.start();
  return actor;
}
