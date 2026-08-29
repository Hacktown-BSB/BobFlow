import type { AppMentionEvent } from '@slack/bolt';
import type { GenericMessageEvent } from '@slack/types';
import { toNormalizedRequest, type IngestibleEvent } from './adapter.js';

// ---------------------------------------------------------------------------
// Stub interface for the orchestration-service actor factory.
// The real `createRequestActor` will be provided by Sub-Task 3.
// ---------------------------------------------------------------------------

export interface RequestActor {
  /** Send an FSM event to this actor. */
  send(event: { type: string; [key: string]: unknown }): void;
}

export type RequestActorFactory = (/* context provided by orchestration service */) => RequestActor;

// ---------------------------------------------------------------------------
// Stub factory — replaced when orchestration-service is wired in (Sub-Task 3).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _createRequestActor: RequestActorFactory = () => {
  throw new Error('createRequestActor not registered — wire up orchestration-service first');
};

/**
 * Register the real actor factory once the orchestration service is available.
 * Called from bot.ts (or an integration bootstrap) before any messages arrive.
 */
export function registerActorFactory(factory: RequestActorFactory): void {
  _createRequestActor = factory;
}

// ---------------------------------------------------------------------------
// In-flight actor map  —  keyed on thread_ts
// ---------------------------------------------------------------------------

const inFlight = new Map<string, RequestActor>();

// ---------------------------------------------------------------------------
// Public handlers (called from bot.ts listeners)
// ---------------------------------------------------------------------------

/**
 * Handle a brand-new top-level message (`app_mention` or direct message that
 * does NOT belong to an existing thread).
 *
 * Creates a fresh FSM actor and dispatches RECEIVED with the request payload.
 */
export function handleNewMessage(event: IngestibleEvent): void {
  const req = toNormalizedRequest(event);

  const actor = _createRequestActor();
  inFlight.set(req.thread_ts, actor);

  actor.send({ type: 'RECEIVED', request: req });
}

/**
 * Routes an inbound Slack `message` event:
 *
 * - If the message's `thread_ts` is already tracked → send CLARIFICATION_REPLY
 *   to the in-flight actor so the FSM can continue the clarification loop.
 * - Otherwise → treat as a new standalone request.
 */
export function handleMessage(event: GenericMessageEvent): void {
  const threadTs = event.thread_ts ?? event.ts;

  const existing = inFlight.get(threadTs);
  if (existing) {
    existing.send({
      type: 'CLARIFICATION_REPLY',
      reply: event.text ?? '',
      thread_ts: threadTs,
    });
  } else {
    // No in-flight actor → brand-new request
    handleNewMessage(event as unknown as IngestibleEvent);
  }
}

/**
 * Called by the action handler in bot.ts after a human approves or rejects
 * an action via the Slack buttons.
 */
export function handleActionResponse(
  thread_ts: string,
  approved: boolean,
): void {
  const actor = inFlight.get(thread_ts);
  if (!actor) return;

  actor.send({ type: approved ? 'ACTION_APPROVED' : 'ACTION_REJECTED', thread_ts });
}
