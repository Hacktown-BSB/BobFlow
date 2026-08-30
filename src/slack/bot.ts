import { App } from '@slack/bolt';
import Database from 'better-sqlite3';
import { SlackAdapter } from './adapter.js';
import { StateMachine } from '../orchestrator/state-machine.js';
import { mockRefinementAgent } from '../agents/refinement.mock.js';
import { refinementAgent } from '../agents/refinement.js';
import { makeSendMessage } from './send.js';
import { resolveApproval } from './approval.js';
import type { RefinementAgent } from '../orchestrator/state-machine.js';
// ─── TRIAGE INTEGRATION POINT (Dev 2 — implemented) ─────────────────────────
import type { TriagePort } from '../triage/port.js';
import { TriagePortImpl } from '../triage/impl.js';
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 concurrency message (17_intake_ingestion.md §4):
 * "Você já tem uma solicitação aberta: [REQ-ID]. Responda naquela conversa
 *  ou aguarde a resolução antes de abrir uma nova."
 */
function openRequestMessage(request_id: string): string {
  const short = request_id.slice(0, 8);
  return `Você já tem uma solicitação aberta: *${short}*. Responda naquela conversa ou aguarde a resolução antes de abrir uma nova.`;
}

export function createBot(db: Database.Database, env: {
  botToken: string;
  appToken: string;
  botUserId: string;
}): App {
  const app = new App({
    token: env.botToken,
    appToken: env.appToken,
    socketMode: true,
  });

  const sendMessage = makeSendMessage(app.client);

  // Item 3: REFINEMENT_MODE=mock|llm, default mock (demo insurance).
  const mode = (process.env['REFINEMENT_MODE'] ?? 'mock').toLowerCase();
  const agent: RefinementAgent = mode === 'llm' ? refinementAgent : mockRefinementAgent;
  console.log(`[bot] refinement mode: ${mode === 'llm' ? 'LLM (real)' : 'MOCK (demo fallback)'}`);

  // ─── TRIAGE INTEGRATION POINT (Dev 2 — implemented) ─────────────────────────
  // Wired with db + sendMessage so the post-triage pipeline persists state and
  // replies to the requester in Slack (Phase 2).
  const triagePort: TriagePort = new TriagePortImpl(db, sendMessage);
  // ─────────────────────────────────────────────────────────────────────────────
  const stateMachine = new StateMachine(db, agent, sendMessage, triagePort);

  const adapter = new SlackAdapter(db, stateMachine, env.botUserId);

  // ── app_mention handler ──────────────────────────────────────────────────
  // In Socket Mode Bolt auto-acks before invoking the handler (§5). ack() is
  // not part of the event handler signature for non-function_executed events.
  app.event('app_mention', async ({ event, body }) => {
    // FIX 5b: pass event_ts so C1 audit log no longer prints event_ts=n/a
    const envelope = { event_id: body.event_id, event_ts: body.event_time?.toString() };
    let result;
    try {
      result = await adapter.processEvent(
        event as unknown as Record<string, unknown>,
        envelope,
      );
    } catch (err) {
      console.error('[bot] app_mention processEvent error', err);
      return;
    }

    if (result.outcome === 'OPEN_REQUEST_EXISTS') {
      try {
        await sendMessage({
          channel_id: (event as unknown as Record<string, unknown>)['channel'] as string,
          thread_ts: (event as unknown as Record<string, unknown>)['thread_ts'] as string | null ?? null,
          text: openRequestMessage(result.request_id),
        });
      } catch (err) {
        console.error('[bot] failed to post OPEN_REQUEST_EXISTS reply', err);
      }
    }
  });

  // ── message handler ──────────────────────────────────────────────────────
  app.event('message', async ({ event, body }) => {
    // FIX 5b: pass event_ts so C1 audit log no longer prints event_ts=n/a
    const envelope = { event_id: body.event_id, event_ts: body.event_time?.toString() };
    let result;
    try {
      result = await adapter.processEvent(
        event as unknown as Record<string, unknown>,
        envelope,
      );
    } catch (err) {
      console.error('[bot] message processEvent error', err);
      return;
    }

    if (result.outcome === 'OPEN_REQUEST_EXISTS') {
      try {
        await sendMessage({
          channel_id: (event as unknown as Record<string, unknown>)['channel'] as string,
          thread_ts: (event as unknown as Record<string, unknown>)['thread_ts'] as string | null ?? null,
          text: openRequestMessage(result.request_id),
        });
      } catch (err) {
        console.error('[bot] failed to post OPEN_REQUEST_EXISTS reply', err);
      }
    }
  });

  // ── Human approval buttons (P5) ──────────────────────────────────────────
  // Restored from PR #2 packages/slack-service/src/bot.ts.
  app.action('action_approve', async ({ body, ack }) => {
    await ack();
    const actionId = (body as { actions?: Array<{ value?: string }> }).actions?.[0]?.value;
    if (actionId) resolveApproval(actionId, true);
  });

  app.action('action_reject', async ({ body, ack }) => {
    await ack();
    const actionId = (body as { actions?: Array<{ value?: string }> }).actions?.[0]?.value;
    if (actionId) resolveApproval(actionId, false);
  });

  return app;
}
