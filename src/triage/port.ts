import type { NormalizedRequest, Domain } from '../db/schema.js';

// ── §2 HANDOFF PAYLOAD (17_intake_contract.md §2) ────────────────────────────
//
// DELIBERATELY EXCLUDED (contract §2 rationale — "P12" token budget + security):
//   original_message        — raw/redacted text; not a classification signal
//   clarification_history   — contains raw user replies; may carry prompt-injection
//                             attempts that Triage must never see
//   slack_user_id           — routing metadata, not classification
//   slack_channel_id        — routing metadata, not classification
//   thread_ts               — routing metadata, not classification
//   slack_event_id          — internal dedup key only
//   redaction_applied       — security metadata, not for Triage
//   redacted_patterns       — security metadata, not for Triage
//   attachments             — not processed in MVP
//
// ─────────────────────────────────────────────────────────────────────────────

export interface TriageInput {
  request_id:          string;
  normalized_message:  string;       // never null at READY_FOR_TRIAGE
  intent:              string;       // never null at READY_FOR_TRIAGE
  domain_hint:         Domain | null;
  system_hint:         string | null;
  module_hint:         string | null;
  is_complete:         boolean;
  clarification_round: 0 | 1 | 2;
  notes:               string | null;
  created_at:          string;
}

/**
 * Routing context used exclusively by the approval gate.
 * Kept separate from TriageInput to preserve the §2 security boundary
 * (routing metadata never reaches LLM agents).
 */
export interface SlackRoutingContext {
  channel_id: string;
  thread_ts:  string | null;
}

/** Extracts the §2 payload from a NormalizedRequest. Pure, no I/O. */
export function toTriageInput(req: NormalizedRequest): TriageInput {
  return {
    request_id:          req.request_id,
    normalized_message:  req.normalized_message!,
    intent:              req.intent!,
    domain_hint:         req.domain_hint,
    system_hint:         req.system_hint,
    module_hint:         req.module_hint,
    is_complete:         req.is_complete,
    clarification_round: req.clarification_round,
    notes:               req.notes,
    created_at:          req.created_at,
  };
}

/** Integration port Developer 2 must implement. */
export interface TriagePort {
  onReadyForTriage(input: TriageInput): Promise<void>;
}

/**
 * Default port — logs the payload as JSON and returns.
 * Active until Developer 2's implementation lands.
 */
export const loggingTriagePort: TriagePort = {
  async onReadyForTriage(input: TriageInput): Promise<void> {
    console.log('[triage-port] READY_FOR_TRIAGE payload:', JSON.stringify(input));
  },
};
