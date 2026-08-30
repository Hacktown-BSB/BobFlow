/**
 * Issue Agent
 *
 * Handles SOFTWARE and SECURITY domains (Engineering + Incident paths).
 * Public signature is stable for future extraction to a dedicated service.
 *
 * Replaces the previous stub by calling CodeIntelligenceService to retrieve
 * structural code context before composing the IssueResult.
 *
 * CodeContext is kept internal — the result is mapped to IssueResult fields
 * without modifying the shared contract in src/db/schema.ts.
 */

import { randomUUID } from 'crypto';
import { resolve } from 'node:path';
import type { TriageResult, IssueResult } from '../db/schema.js';
import type { TriageInput } from '../triage/port.js';
import type { CodeContext } from '../context/types.js';
import { createCodeIntelligenceService } from '../context/service.js';

// Lazily-created singleton — avoids spawning the provider on every import.
let _service: ReturnType<typeof createCodeIntelligenceService> | null = null;
function getService() {
  if (!_service) _service = createCodeIntelligenceService();
  return _service;
}

/**
 * Maps a CodeContext into the evidence and analysis fields of IssueResult.
 * Never modifies IssueResult's schema.
 */
function buildAnalysis(ctx: CodeContext): {
  analysis:              string;
  root_cause_hypothesis: string | null;
  confidence:            number;
  evidence:              string[];
  requires_human:        boolean;
} {
  if (ctx.status === 'inaccessible' || ctx.status === 'error') {
    return {
      analysis:              ctx.summary,
      root_cause_hypothesis: null,
      confidence:            0.0,
      evidence:              ctx.evidence,
      requires_human:        true,
    };
  }

  if (ctx.status === 'no_match') {
    return {
      analysis:              'No relevant code components identified. Manual investigation required.',
      root_cause_hypothesis: null,
      confidence:            0.2,
      evidence:              ctx.evidence,
      requires_human:        true,
    };
  }

  // status === 'accessible'
  const evidenceLines: string[] = [
    ...ctx.evidence,
    ...(ctx.callPaths.length > 0 ? [`Call path: ${ctx.callPaths[0]}`] : []),
    ...(ctx.potentiallyImpacted.length > 0
      ? [`Potentially impacted: ${ctx.potentiallyImpacted.slice(0, 3).join(', ')}`]
      : []),
  ];

  const symbolList = ctx.relevantSymbols.slice(0, 5).join(', ');
  const fileList   = ctx.relevantFiles.slice(0, 3).join(', ');

  const analysis =
    `Code analysis via ${ctx.provider}. ` +
    `${ctx.summary} ` +
    (symbolList ? `Relevant symbols: ${symbolList}. ` : '') +
    (fileList   ? `Relevant files: ${fileList}.`       : '');

  const hypothesis =
    ctx.callPaths.length > 0
      ? `Likely execution path involved: ${ctx.callPaths[0]}`
      : null;

  // Confidence is proportional to how much we found
  const confidence = Math.min(
    0.3 +
    (ctx.relevantSymbols.length > 0 ? 0.2 : 0) +
    (ctx.callPaths.length        > 0 ? 0.2 : 0) +
    (ctx.relevantFiles.length    > 0 ? 0.1 : 0),
    0.8,  // cap at 0.8 — LLM-based analysis would push it higher post-MVP
  );

  return {
    analysis,
    root_cause_hypothesis: hypothesis,
    confidence,
    evidence:              evidenceLines,
    requires_human:        confidence < 0.5,
  };
}

/**
 * Create or correlate an issue/incident for the given triage context.
 * Uses CodeIntelligenceService to enrich the result with structural context.
 */
export async function createIssue(
  input: TriageInput,
  triageResult: TriageResult,
): Promise<IssueResult> {
  // Resolve repository path: prefer env var, fall back to process cwd
  const repositoryPath =
    process.env['GRAPHIFY_REPO_PATH'] ?? resolve(process.cwd());

  const codeCtx: CodeContext = await getService().enrich({
    input,
    triageResult,
    repositoryPath,
  });

  const {
    analysis,
    root_cause_hypothesis,
    confidence,
    evidence,
    requires_human,
  } = buildAnalysis(codeCtx);

  const isCritical = triageResult.priority === 'CRITICAL';

  return {
    issue_id:               randomUUID(),
    request_id:             input.request_id,
    issue_type:             triageResult.domain === 'SECURITY' ? 'INCIDENT' : 'BUG',
    created_at:             new Date().toISOString(),
    analysis,
    root_cause_hypothesis,
    confidence,
    evidence,
    github_issue: {
      title:     `[${triageResult.domain}] ${input.intent}`,
      body:      buildIssueBody(input, triageResult, codeCtx),
      labels:    buildLabels(triageResult, codeCtx),
      assignees: [],
      milestone: null,
    },
    incident_id:            null,
    classification:         triageResult.is_duplicate ? 'DUPLICATE' : 'NONE',
    correlated_request_ids: triageResult.correlated_request_ids,
    requires_human_approval: requires_human || isCritical,
    recommended_action:     isCritical
      ? 'CRITICAL priority — requires human approval before action'
      : confidence >= 0.5
        ? 'Review code context and create GitHub issue'
        : 'Insufficient evidence — manual investigation recommended',
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildIssueBody(
  input: TriageInput,
  triageResult: TriageResult,
  codeCtx: CodeContext,
): string {
  const lines: string[] = [
    `## Request`,
    `**Intent:** ${input.intent}`,
    `**Domain:** ${triageResult.domain}`,
    `**Priority:** ${triageResult.priority}`,
    triageResult.system ? `**System:** ${triageResult.system}` : '',
    triageResult.module ? `**Module:** ${triageResult.module}` : '',
    '',
    `## Code Context (via ${codeCtx.provider})`,
    codeCtx.summary,
  ];

  if (codeCtx.relevantSymbols.length > 0) {
    lines.push('', `**Relevant symbols:** ${codeCtx.relevantSymbols.join(', ')}`);
  }
  if (codeCtx.relevantFiles.length > 0) {
    lines.push('', `**Relevant files:**`);
    codeCtx.relevantFiles.forEach(f => lines.push(`- \`${f}\``));
  }
  if (codeCtx.callPaths.length > 0) {
    lines.push('', `**Call paths:**`);
    codeCtx.callPaths.forEach(p => lines.push(`- ${p}`));
  }
  if (codeCtx.potentiallyImpacted.length > 0) {
    lines.push('', `**Potentially impacted:** ${codeCtx.potentiallyImpacted.join(', ')}`);
  }
  if (triageResult.evidence.length > 0) {
    lines.push('', `## Triage Evidence`);
    triageResult.evidence.forEach(e => lines.push(`- ${e}`));
  }

  lines.push('', `---`, `*Generated by Code Intelligence — request \`${input.request_id}\`*`);

  return lines.filter(l => l !== null).join('\n');
}

function buildLabels(triageResult: TriageResult, codeCtx: CodeContext): string[] {
  const labels = [
    triageResult.domain.toLowerCase(),
    triageResult.priority.toLowerCase(),
  ];
  if (codeCtx.status !== 'accessible') labels.push('needs-investigation');
  if (triageResult.is_duplicate)       labels.push('duplicate');
  return labels;
}
