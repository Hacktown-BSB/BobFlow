import { v4 as uuid } from 'uuid';
import type { AppMentionEvent } from '@slack/bolt';
import type { GenericMessageEvent } from '@slack/types';
import type { NormalizedRequest } from '@zovaodobob/shared-types';

export type IngestibleEvent = AppMentionEvent | GenericMessageEvent;

/**
 * Converts a raw Slack event payload into the NormalizedRequest skeleton.
 * The Refinement Agent (Sub-Task 3) is responsible for filling intent,
 * domain_hint, and clarification_history later in the FSM.
 */
export function toNormalizedRequest(event: IngestibleEvent): NormalizedRequest {
  const now = new Date().toISOString();
  const ts = (event as { ts: string }).ts;
  const threadTs = (event as { thread_ts?: string }).thread_ts ?? ts;

  return {
    request_id: uuid(),
    slack_user_id: (event as { user?: string }).user ?? '',
    slack_channel_id: (event as { channel: string }).channel,
    thread_ts: threadTs,
    original_message: event.text ?? '',
    normalized_message: event.text ?? '',
    intent: '',
    domain_hint: null,
    system_hint: null,
    module_hint: null,
    is_complete: false,
    clarification_round: 0,
    clarification_history: [],
    attachments: [],
    notes: null,
    created_at: now,
    updated_at: now,
  };
}
