import 'dotenv/config';
import { App } from '@slack/bolt';
import type { GenericMessageEvent } from '@slack/types';
import { initSender } from './sender.js';
import { handleNewMessage, handleMessage, handleActionResponse } from './dispatcher.js';

// ---------------------------------------------------------------------------
// App initialisation — Socket Mode
// ---------------------------------------------------------------------------

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Give the sender module access to the Bolt web client.
initSender(app.client);

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

/**
 * `app_mention` — someone @-mentions the bot in a channel or thread.
 * Always treated as a new request; the dispatcher will route thread
 * replies via the `message` listener below.
 */
app.event('app_mention', async ({ event }) => {
  handleNewMessage(event);
});

/**
 * `message` — covers DMs and all channel/thread messages.
 *
 * Bot messages are filtered out to avoid infinite loops; subtypes other than
 * `undefined` (plain messages) are ignored.
 */
app.message(async ({ event }) => {
  const msg = event as GenericMessageEvent;

  // Ignore bot messages.
  if (msg.bot_id !== undefined) return;

  // Subtype check: only plain messages have `subtype: undefined`.
  if (msg.subtype !== undefined) return;

  handleMessage(msg);
});

// ---------------------------------------------------------------------------
// Action handlers — Approve / Reject buttons
// ---------------------------------------------------------------------------

/**
 * Human clicks "Approve".
 * The button's `value` holds the thread_ts that keys into the in-flight map.
 */
app.action('action_approve', async ({ body, ack }) => {
  await ack();

  // Retrieve the thread_ts encoded as the button value.
  const actions = (body as { actions?: Array<{ value?: string }> }).actions;
  const threadTs = actions?.[0]?.value;
  if (!threadTs) return;

  handleActionResponse(threadTs, true);
});

/**
 * Human clicks "Reject".
 */
app.action('action_reject', async ({ body, ack }) => {
  await ack();

  const actions = (body as { actions?: Array<{ value?: string }> }).actions;
  const threadTs = actions?.[0]?.value;
  if (!threadTs) return;

  handleActionResponse(threadTs, false);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

(async () => {
  await app.start();
  console.log('⚡ Slack ingestion service is running in Socket Mode');
})();
