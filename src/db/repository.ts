import Database from 'better-sqlite3';
import type {
  NormalizedRequest, MinimalRequest, RefinementOutput,
  DecisionTraceEntry, ClarificationEntry,
} from './schema.js';

function row2req(r: Record<string, unknown>): NormalizedRequest {
  return {
    ...(r as unknown as NormalizedRequest),
    redaction_applied: Boolean(r['redaction_applied']),
    is_complete: Boolean(r['is_complete']),
    triage_dispatched: Boolean(r['triage_dispatched']),
    redacted_patterns: JSON.parse(r['redacted_patterns'] as string),
    attachments: JSON.parse(r['attachments'] as string),
    clarification_history: JSON.parse(r['clarification_history'] as string),
    extracted_fields: JSON.parse(r['extracted_fields'] as string),
  };
}

/** Creates the minimal request record. Enforces UNIQUE on slack_event_id. */
export function createRequest(db: Database.Database, minimal: MinimalRequest): NormalizedRequest {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO requests
      (request_id, slack_event_id, slack_user_id, slack_channel_id, thread_ts,
       original_message, redaction_applied, redacted_patterns, status, attachments,
       is_complete, clarification_round, clarification_history, extracted_fields,
       created_at, updated_at)
    VALUES
      (@request_id, @slack_event_id, @slack_user_id, @slack_channel_id, @thread_ts,
       @original_message, @redaction_applied, @redacted_patterns, @status, @attachments,
       @is_complete, @clarification_round, @clarification_history, @extracted_fields,
       @created_at, @updated_at)
  `).run({
    ...minimal,
    redaction_applied: minimal.redaction_applied ? 1 : 0,
    is_complete: 0,
    redacted_patterns: JSON.stringify(minimal.redacted_patterns),
    attachments: JSON.stringify(minimal.attachments),
    clarification_history: '[]',
    extracted_fields: '{}',
    created_at: now,
    updated_at: now,
  });
  const row = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(minimal.request_id);
  return row2req(row as Record<string, unknown>);
}

/**
 * Finds open request by thread_ts + user (channel path),
 * or by channel + user (DM fallback when thread_ts is null).
 * Returns null if not found or not CLARIFICATION_PENDING.
 */
export function findOpenRequestForReply(
  db: Database.Database,
  thread_ts: string | null,
  slack_channel_id: string,
  slack_user_id: string,
): NormalizedRequest | null {
  let row: unknown;
  if (thread_ts) {
    row = db.prepare(`
      SELECT * FROM requests
      WHERE thread_ts = ? AND slack_user_id = ? AND status = 'CLARIFICATION_PENDING'
    `).get(thread_ts, slack_user_id);
  } else {
    row = db.prepare(`
      SELECT * FROM requests
      WHERE slack_channel_id = ? AND slack_user_id = ? AND status = 'CLARIFICATION_PENDING'
      ORDER BY created_at DESC LIMIT 1
    `).get(slack_channel_id, slack_user_id);
  }
  return row ? row2req(row as Record<string, unknown>) : null;
}

/** Returns true if event_id was already recorded (dedup hit). */
export function isEventProcessed(db: Database.Database, slack_event_id: string): boolean {
  const row = db.prepare(
    "SELECT 1 FROM processed_events WHERE slack_event_id = ? AND expires_at > ?"
  ).get(slack_event_id, new Date().toISOString());
  return !!row;
}

/** Mark event as seen. Safe to call before ack(). */
export function recordEventSeen(db: Database.Database, slack_event_id: string): void {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO processed_events (slack_event_id, first_seen_at, expires_at)
    VALUES (?, ?, ?)
  `).run(slack_event_id, now.toISOString(), expires);
}

/** Links a processed_event record to a newly created request. */
export function linkEventToRequest(
  db: Database.Database,
  slack_event_id: string,
  request_id: string,
): void {
  db.prepare(
    'UPDATE processed_events SET request_id = ? WHERE slack_event_id = ?'
  ).run(request_id, slack_event_id);
}

/** Appends answer to the last unanswered clarification_history entry. */
export function appendClarificationAnswer(
  db: Database.Database,
  request_id: string,
  answer: string,
): NormalizedRequest {
  const row = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(request_id);
  if (!row) throw new Error(`Request not found: ${request_id}`);
  const req = row2req(row as Record<string, unknown>);
  const history: ClarificationEntry[] = req.clarification_history;
  const last = history[history.length - 1];
  if (last && last.answer === null) {
    last.answer = answer;
  } else {
    history.push({ question: '', answer });
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE requests SET clarification_history = ?, status = 'NORMALIZING', updated_at = ? WHERE request_id = ?"
  ).run(JSON.stringify(history), now, request_id);
  return row2req(
    db.prepare('SELECT * FROM requests WHERE request_id = ?').get(request_id) as Record<string, unknown>
  );
}

/** Merges RefinementOutput into the request and advances status. */
export function applyRefinementOutput(
  db: Database.Database,
  request_id: string,
  output: RefinementOutput,
  nextStatus: 'CLARIFICATION_PENDING' | 'READY_FOR_TRIAGE',
): NormalizedRequest {
  const now = new Date().toISOString();
  const row = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(request_id);
  if (!row) throw new Error(`Request not found: ${request_id}`);
  const req = row2req(row as Record<string, unknown>);

  // Append question to clarification_history when pending
  const history: ClarificationEntry[] = req.clarification_history;
  if (nextStatus === 'CLARIFICATION_PENDING' && output.clarification_question) {
    history.push({ question: output.clarification_question, answer: null });
  }

  db.prepare(`
    UPDATE requests SET
      normalized_message = @normalized_message,
      intent = @intent,
      domain_hint = @domain_hint,
      system_hint = @system_hint,
      module_hint = @module_hint,
      is_complete = @is_complete,
      clarification_round = @clarification_round,
      clarification_question = @clarification_question,
      clarification_history = @clarification_history,
      extracted_fields = @extracted_fields,
      notes = @notes,
      status = @status,
      updated_at = @updated_at
    WHERE request_id = @request_id
  `).run({
    request_id,
    normalized_message: output.normalized_message,
    intent: output.intent,
    domain_hint: output.domain_hint,
    system_hint: output.system_hint,
    module_hint: output.module_hint,
    is_complete: output.is_complete ? 1 : 0,
    clarification_round: output.clarification_round,
    clarification_question: output.clarification_question,
    clarification_history: JSON.stringify(history),
    extracted_fields: JSON.stringify(output.extracted_fields),
    notes: output.notes,
    status: nextStatus,
    updated_at: now,
  });
  return row2req(
    db.prepare('SELECT * FROM requests WHERE request_id = ?').get(request_id) as Record<string, unknown>
  );
}

/** Finds the first CLARIFICATION_PENDING request for a user in a channel. */
export function findOpenRequestByUser(
  db: Database.Database,
  slack_user_id: string,
  slack_channel_id: string,
): NormalizedRequest | null {
  const row = db.prepare(`
    SELECT * FROM requests
    WHERE slack_user_id = ? AND slack_channel_id = ? AND status = 'CLARIFICATION_PENDING'
    ORDER BY created_at DESC LIMIT 1
  `).get(slack_user_id, slack_channel_id);
  return row ? row2req(row as Record<string, unknown>) : null;
}

/** Reads a request by id. */
export function getRequest(db: Database.Database, request_id: string): NormalizedRequest | null {
  const row = db.prepare('SELECT * FROM requests WHERE request_id = ?').get(request_id);
  return row ? row2req(row as Record<string, unknown>) : null;
}

/** Appends a decision trace entry. */
export function appendTrace(
  db: Database.Database,
  request_id: string,
  entry: DecisionTraceEntry,
): void {
  const row = db.prepare('SELECT decision_trace FROM requests WHERE request_id = ?').get(request_id) as { decision_trace: string } | undefined;
  if (!row) return;
  const trace: DecisionTraceEntry[] = JSON.parse(row.decision_trace);
  trace.push(entry);
  db.prepare('UPDATE requests SET decision_trace = ? WHERE request_id = ?')
    .run(JSON.stringify(trace), request_id);
}

/** Update status directly (used by state machine). */
export function setStatus(
  db: Database.Database,
  request_id: string,
  status: string,
): void {
  db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE request_id = ?')
    .run(status, new Date().toISOString(), request_id);
}

/** Set thread_ts on a request (C2 rule: written at record creation, not here, but exposed for tests). */
export function setThreadTs(
  db: Database.Database,
  request_id: string,
  thread_ts: string,
): void {
  db.prepare('UPDATE requests SET thread_ts = ?, updated_at = ? WHERE request_id = ?')
    .run(thread_ts, new Date().toISOString(), request_id);
}

/** Atomically marks triage as dispatched. Returns true if this call won the race (first setter). */
export function markTriageDispatched(db: Database.Database, request_id: string): boolean {
  const result = db.prepare(
    'UPDATE requests SET triage_dispatched = 1, updated_at = ? WHERE request_id = ? AND triage_dispatched = 0'
  ).run(new Date().toISOString(), request_id);
  return result.changes === 1;
}
