import type { WebClient } from '@slack/web-api';

/**
 * Real sendSlackMessage — satisfies the signature StateMachine expects.
 * In a channel: replies in-thread using the request's thread_ts.
 * In a DM (thread_ts null): posts top-level.
 * Returns the ts of the posted message.
 */
export function makeSendMessage(client: WebClient) {
  return async function sendSlackMessage(params: {
    channel_id: string;
    thread_ts: string | null;
    text: string;
  }): Promise<{ ts: string; ok: boolean }> {
    const result = await client.chat.postMessage({
      channel: params.channel_id,
      text: params.text,
      ...(params.thread_ts ? { thread_ts: params.thread_ts } : {}),
    });
    return { ts: result.ts ?? '', ok: result.ok === true };
  };
}
