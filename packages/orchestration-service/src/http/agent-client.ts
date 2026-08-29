/**
 * Agent HTTP Client — orchestration-service
 *
 * Thin fetch-based client calling the three downstream agent services.
 * Service URLs are read from environment variables at call-time so that
 * tests can override them without restarting the process.
 *
 * Endpoints (from multiagent-orchestration-plan.md § Agent Service Interface Contracts):
 *   GET  /answer   → Knowledge Service  (KNOWLEDGE_SERVICE_URL)
 *   POST /issues   → Issue Service      (ISSUE_SERVICE_URL)
 *   POST /tickets  → Ticket Service     (TICKET_SERVICE_URL)
 */

import type {
  NormalizedRequest,
  TriageResult,
  KnowledgeResult,
  IssueResult,
  TicketResult,
  CandidateRequest,
} from '@zovaodobob/shared-types';

// ─── URL helpers ──────────────────────────────────────────────────────────────

function knowledgeUrl(): string {
  return process.env['KNOWLEDGE_SERVICE_URL'] ?? 'http://localhost:3001';
}

function issueUrl(): string {
  return process.env['ISSUE_SERVICE_URL'] ?? 'http://localhost:3002';
}

function ticketUrl(): string {
  return process.env['TICKET_SERVICE_URL'] ?? 'http://localhost:3003';
}

// ─── Error helper ─────────────────────────────────────────────────────────────

async function assertOk(res: Response, label: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => '(unreadable body)');
    throw new Error(`[agent-client] ${label} failed: HTTP ${res.status} — ${text}`);
  }
}

// ─── callKnowledge ────────────────────────────────────────────────────────────

/**
 * GET /answer — Knowledge Service
 *
 * Despite the HTTP verb being GET, the knowledge service contract (plan §
 * "Knowledge Service") uses a body payload.  We send it as a POST-style GET
 * by using the body parameter (acceptable with fetch; server must allow it).
 */
export async function callKnowledge(
  request: NormalizedRequest,
  triage: TriageResult,
): Promise<KnowledgeResult> {
  const res = await fetch(`${knowledgeUrl()}/answer`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: request.request_id,
      normalized_request: request,
      triage_result: triage,
    }),
  });
  await assertOk(res, 'callKnowledge');
  return res.json() as Promise<KnowledgeResult>;
}

// ─── callIssue ────────────────────────────────────────────────────────────────

/**
 * POST /issues — Issue Service
 *
 * Handles both the Engineering Agent path (SOFTWARE domain) and the Incident
 * Agent path (SECURITY domain or CRITICAL priority).  The Issue Service
 * determines which internal path to use based on `triage_result.priority` and
 * `triage_result.domain`.
 */
export async function callIssue(
  request: NormalizedRequest,
  triage: TriageResult,
  candidates?: CandidateRequest[],
): Promise<IssueResult> {
  const res = await fetch(`${issueUrl()}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: request.request_id,
      normalized_request: request,
      triage_result: triage,
      ...(candidates !== undefined ? { candidate_requests: candidates } : {}),
    }),
  });
  await assertOk(res, 'callIssue');
  return res.json() as Promise<IssueResult>;
}

// ─── callTicket ───────────────────────────────────────────────────────────────

/**
 * POST /tickets — Ticket Service
 *
 * Creates an IT support ticket.  Email delivery is always gated behind human
 * approval (per knowledge/12_tool_contracts.md); the returned TicketResult
 * will have `status: 'QUEUED_FOR_APPROVAL'` and `requires_human: true`.
 */
export async function callTicket(
  request: NormalizedRequest,
  triage: TriageResult,
  knowledgeResult?: KnowledgeResult,
): Promise<TicketResult> {
  const res = await fetch(`${ticketUrl()}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: request.request_id,
      normalized_request: request,
      triage_result: triage,
      ...(knowledgeResult !== undefined ? { knowledge_result: knowledgeResult } : {}),
    }),
  });
  await assertOk(res, 'callTicket');
  return res.json() as Promise<TicketResult>;
}
