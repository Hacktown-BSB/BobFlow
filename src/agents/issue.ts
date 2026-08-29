/**
 * Issue Agent — in-process stub
 * (ported from PR #2 packages/issue-service — scaffold only, full impl: Sub-Task 5)
 *
 * Handles SOFTWARE and SECURITY domains (Engineering + Incident paths).
 * Public signature is stable for future extraction to a dedicated service.
 */

import { randomUUID } from 'crypto';
import type { TriageResult, IssueResult } from '../db/schema.js';
import type { TriageInput } from '../triage/port.js';

/**
 * Create or correlate an issue/incident for the given triage context.
 * Stub: returns a minimal IssueResult with requires_human_approval=true.
 */
export async function createIssue(
  input: TriageInput,
  triageResult: TriageResult,
): Promise<IssueResult> {
  void triageResult;
  return {
    issue_id:               randomUUID(),
    request_id:             input.request_id,
    issue_type:             'BUG',
    created_at:             new Date().toISOString(),
    analysis:               null,
    root_cause_hypothesis:  null,
    confidence:             0.0,
    evidence:               [],
    github_issue:           null,
    incident_id:            null,
    classification:         null,
    correlated_request_ids: [],
    requires_human_approval: true,
    recommended_action:     'Issue Agent not yet implemented (stub) — manual review required',
  };
}
