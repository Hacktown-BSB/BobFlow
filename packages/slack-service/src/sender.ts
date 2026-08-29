import type { WebClient } from '@slack/web-api';

let _client: WebClient | undefined;

/**
 * Initialise the sender with the Bolt web client.
 * Called once from bot.ts after the App is created.
 */
export function initSender(client: WebClient): void {
  _client = client;
}

function getClient(): WebClient {
  if (!_client) throw new Error('Sender not initialised — call initSender() first');
  return _client;
}

/** Posts a clarification question in the originating Slack thread. */
export async function sendClarification(
  channel: string,
  thread_ts: string,
  question: string,
): Promise<void> {
  await getClient().chat.postMessage({
    channel,
    thread_ts,
    text: question,
  });
}

/** Posts the final resolved result back in the originating Slack thread. */
export async function sendResult(
  channel: string,
  thread_ts: string,
  message: string,
): Promise<void> {
  await getClient().chat.postMessage({
    channel,
    thread_ts,
    text: message,
  });
}

/**
 * Posts an Approve/Reject button message for a gated action.
 *
 * The `action_id` is encoded in each button's value so the action handler in
 * bot.ts can retrieve the correct in-flight actor.
 */
export async function sendApprovalRequest(
  channel: string,
  action_id: string,
  description: string,
): Promise<void> {
  await getClient().chat.postMessage({
    channel,
    text: `Approval required: ${description}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Approval required*\n${description}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: 'action_approve',
            value: action_id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject' },
            style: 'danger',
            action_id: 'action_reject',
            value: action_id,
          },
        ],
      },
    ],
  });
}
