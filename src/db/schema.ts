import Database from 'better-sqlite3';

// ── Priority & AgentRoute (mirrored from PR #2 shared-types) ─────────────────
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type AgentRoute = 'knowledge' | 'engineering' | 'ticket' | 'incident' | 'human';

export interface PriorityScores {
  urgency: number;
  users_affected: number;
  customer_impact: number;
  financial_impact: number;
  security_flag: number;
  workaround: number;
  criticality: number;
}

// ── TriageResult ──────────────────────────────────────────────────────────────
export interface TriageResult {
  request_id: string;
  domain: Domain;
  system: string | null;
  module: string | null;
  confidence: number;          // 0.0–1.0
  evidence: string[];
  priority: Priority;
  priority_scores: PriorityScores;
  route: AgentRoute;
  is_duplicate: boolean;
  correlated_request_ids: string[];
  requires_human: boolean;
  triaged_at: string;
}

// ── Downstream agent result stubs ─────────────────────────────────────────────
export interface KnowledgeResult {
  request_id: string;
  resolved: boolean;
  confidence: number;
  answer: string;
  sources: string[];
  data_source: 'knowledge_base' | 'data_warehouse' | 'ai_general' | 'unresolved';
  escalation_recommended: boolean;
  escalation_reason: string | null;
}

export interface IssueResult {
  issue_id: string;
  request_id: string;
  issue_type: 'BUG' | 'INCIDENT' | 'MAJOR_INCIDENT';
  created_at: string;
  analysis: string | null;
  root_cause_hypothesis: string | null;
  confidence: number;
  evidence: string[];
  github_issue: { title: string; body: string; labels: string[]; assignees: string[]; milestone: string | null } | null;
  incident_id: string | null;
  classification: 'DUPLICATE' | 'RELATED' | 'INCIDENT' | 'MAJOR_INCIDENT' | 'NONE' | null;
  correlated_request_ids: string[];
  requires_human_approval: boolean;
  recommended_action: string;
}

export interface TicketResult {
  request_id: string;
  ticket_id: string;
  queue: string;
  priority: Priority;
  title: string;
  description: string;
  status: 'QUEUED_FOR_APPROVAL' | 'SENT' | 'FAILED';
  email_to: string[];
  requires_human: boolean;
}


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

/**
 * Additive, idempotent column migrations for pre-existing databases.
 *
 * `CREATE TABLE IF NOT EXISTS` never alters a table that already exists, so a
 * `triage.db` created before these columns were introduced is missing them —
 * which crashes markTriageDispatched / appendTrace at runtime with
 * `SqliteError: no such column`. We reconcile by introspecting the live table
 * and adding any absent column. Each entry uses a constant DEFAULT so SQLite can
 * backfill existing rows. Append future additive columns here.
 */
const ADDITIVE_REQUEST_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'decision_trace',    ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'triage_dispatched', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  // Phase 2: post-triage persistence (TriageResult / downstream agent result as JSON).
  { name: 'triage_result',     ddl: 'TEXT' },
  { name: 'agent_result',      ddl: 'TEXT' },
];

function migrateSchema(db: Database.Database): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(requests)').all() as Array<{ name: string }>)
      .map(c => c.name),
  );
  for (const { name, ddl } of ADDITIVE_REQUEST_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE requests ADD COLUMN ${name} ${ddl};`);
      console.log(`[migrate] added missing column requests.${name}`);
    }
  }
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
      triage_result       TEXT,
      agent_result        TEXT,
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

  // Reconcile pre-existing on-disk databases that predate additive columns.
  migrateSchema(db);
}
