import Database from 'better-sqlite3';

export type Status =
  | 'RECEIVED' | 'NORMALIZING' | 'CLARIFICATION_PENDING'
  | 'READY_FOR_TRIAGE' | 'TRIAGING' | 'TRIAGED' | 'CONTEXT_RETRIEVAL'
  | 'AGENT_EXECUTING' | 'ACTION_PENDING' | 'ACTION_EXECUTED' | 'VERIFYING'
  | 'RESOLVED' | 'ESCALATED' | 'ABANDONED' | 'DUPLICATE_SUPPRESSED';

export type Domain =
  | 'SOFTWARE' | 'HARDWARE' | 'ACCESS' | 'DIGITAL'
  | 'SECURITY' | 'BUSINESS_PROCESS' | 'QUESTION' | 'UNKNOWN';

export interface ClarificationEntry {
  question: string;
  answer: string | null;
}

export interface ExtractedFields {
  error_description?: string | null;
  system_name?: string | null;
  steps_to_reproduce?: string | null;
  device_type?: string | null;
  asset_tag?: string | null;
  problem_description?: string | null;
  access_type?: string | null;
  urgency_reason?: string | null;
  tool_name?: string | null;
  account_email?: string | null;
  what_was_observed?: string | null;
  when_it_happened?: string | null;
  which_system?: string | null;
  process_name?: string | null;
  stuck_step?: string | null;
  specific_question?: string | null;
  general_description?: string | null;
}

export interface NormalizedRequest {
  request_id: string;
  slack_event_id: string;
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string | null;
  original_message: string;
  redaction_applied: boolean;
  redacted_patterns: string[];
  status: Status;
  triage_dispatched: boolean;
  attachments: string[];
  normalized_message: string | null;
  intent: string | null;
  domain_hint: Domain | null;
  system_hint: string | null;
  module_hint: string | null;
  is_complete: boolean;
  clarification_round: 0 | 1 | 2;
  clarification_question: string | null;
  clarification_history: ClarificationEntry[];
  extracted_fields: ExtractedFields;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MinimalRequest {
  request_id: string;
  slack_event_id: string;
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string | null;
  original_message: string;
  redaction_applied: boolean;
  redacted_patterns: string[];
  attachments: string[];
  status: 'RECEIVED';
  is_complete: false;
  clarification_round: 0;
  clarification_history: [];
  created_at: string;
  updated_at: string;
}

export interface RefinementOutput {
  normalized_message: string;
  intent: string;
  domain_hint: Domain | null;
  system_hint: string | null;
  module_hint: string | null;
  is_complete: boolean;
  clarification_question: string | null;
  clarification_round: 0 | 1 | 2;
  extracted_fields: ExtractedFields;
  notes: string | null;
}

export interface DecisionTraceEntry {
  step_id: string;
  timestamp: string;
  agent: string;
  state_from: string;
  state_to: string;
  decision: string;
  confidence: number;
  evidence: string[];
  context_source: string[];
  next_action: string;
  result: string | null;
}

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      request_id          TEXT PRIMARY KEY,
      slack_event_id      TEXT NOT NULL UNIQUE,
      slack_user_id       TEXT NOT NULL,
      slack_channel_id    TEXT NOT NULL,
      thread_ts           TEXT,
      original_message    TEXT NOT NULL,
      redaction_applied   INTEGER NOT NULL DEFAULT 0,
      redacted_patterns   TEXT NOT NULL DEFAULT '[]',
      status              TEXT NOT NULL DEFAULT 'RECEIVED',
      attachments         TEXT NOT NULL DEFAULT '[]',
      normalized_message  TEXT,
      intent              TEXT,
      domain_hint         TEXT,
      system_hint         TEXT,
      module_hint         TEXT,
      is_complete         INTEGER NOT NULL DEFAULT 0,
      clarification_round INTEGER NOT NULL DEFAULT 0,
      clarification_question TEXT,
      clarification_history  TEXT NOT NULL DEFAULT '[]',
      extracted_fields    TEXT NOT NULL DEFAULT '{}',
      notes               TEXT,
      decision_trace      TEXT NOT NULL DEFAULT '[]',
      triage_dispatched   INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      slack_event_id TEXT PRIMARY KEY,
      first_seen_at  TEXT NOT NULL,
      request_id     TEXT,
      expires_at     TEXT NOT NULL
    );
  `);
}
