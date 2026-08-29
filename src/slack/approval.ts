/**
 * Human approval gate — Slack surface.
 *
 * Restored from PR #2 packages/slack-service/src/sender.ts + bot.ts action handlers.
 * Implements the Slack half of P5 (01_product_constitution.md): actions that modify
 * production, expose sensitive data or are irreversible require explicit human
 * confirmation. 16_demo_strategy.md step 9 depends on this.
 *
 * This module owns only the Slack surface — posting the buttons and resolving the
 * click. Deciding WHICH actions need approval belongs to the Action Engine (I8).
 *
 * Keyed by action_id, not thread_ts. PR #2 keyed the in-flight map by thread_ts,
 * which is null for DM-originated requests (see 17_intake_patch.md §7b).
 */

import type { WebClient } from '@slack/web-api';

interface Pending {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

const inFlight = new Map<string, Pending>();

/** 06_workflow_architecture.md — ACTION_PENDING human-approval timeout. */
const APPROVAL_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/**
 * Posts an Approve/Reject message and resolves when a human clicks, or false on timeout.
 * The action_id is encoded in each button's value so the handler can find this promise.
 */
export function requestApproval(
  client: WebClient,
  params: { channel_id: string; thread_ts: string | null; action_id: string; description: string },
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      inFlight.delete(params.action_id);
      console.warn(`[approval] timed out after 4h: ${params.action_id}`);
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);

    inFlight.set(params.action_id, { resolve, timer });

    void client.chat.postMessage({
      channel: params.channel_id,
      ...(params.thread_ts ? { thread_ts: params.thread_ts } : {}),
      text: `Aprovação necessária: ${params.description}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Aprovação necessária*\n${params.description}` },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Aprovar' },
              style: 'primary',
              action_id: 'action_approve',
              value: params.action_id,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Rejeitar' },
              style: 'danger',
              action_id: 'action_reject',
              value: params.action_id,
            },
          ],
        },
      ],
    }).catch((err) => {
      console.error('[approval] failed to post approval request:', err);
      clearTimeout(timer);
      inFlight.delete(params.action_id);
      resolve(false);
    });
  });
}

/** Called by the bot's action handlers. No-op if the action_id is unknown or already settled. */
export function resolveApproval(action_id: string, approved: boolean): void {
  const pending = inFlight.get(action_id);
  if (!pending) return;
  clearTimeout(pending.timer);
  inFlight.delete(action_id);
  pending.resolve(approved);
}

/** Exposed for tests. */
export function pendingApprovalCount(): number {
  return inFlight.size;
}
