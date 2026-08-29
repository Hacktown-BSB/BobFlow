// ─── Domain & Priority enums ────────────────────────────────────────────────

export type Domain =
  | 'SOFTWARE'
  | 'DIGITAL'
  | 'HARDWARE'
  | 'ACCESS'
  | 'SECURITY'
  | 'BUSINESS_PROCESS'
  | 'QUESTION'
  | 'UNKNOWN';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type AgentRoute = 'knowledge' | 'engineering' | 'ticket' | 'incident' | 'human';

export type ContextSource =
  | 'slack_message'
  | 'knowledge_base'
  | 'github'
  | 'incident_db'
  | 'ticket_system';

export type ActionType =
  | 'SLACK_MESSAGE'
  | 'GITHUB_ISSUE_CREATE'
  | 'GITHUB_REPO_READ'
  | 'TICKET_CREATE'
  | 'EMAIL_SEND'
  | 'KB_QUERY'
  | 'INCIDENT_CREATE'
  | 'INCIDENT_UPDATE';

// ─── NormalizedRequest ────────────────────────────────────────────────────────

export interface NormalizedRequest {
  request_id: string;           // UUID
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string;
  original_message: string;     // raw Slack message, immutable
  normalized_message: string;   // cleaned, structured
  intent: string;               // one-line extracted intent
  domain_hint: Domain | null;   // set by Refinement, confirmed by Triage
  system_hint: string | null;   // e.g., "ERP", "CRM"
  module_hint: string | null;   // e.g., "invoice", "payment"
  is_complete: boolean;
  clarification_round: 0 | 1 | 2;
  clarification_history: Array<{ question: string; answer: string }>;
  attachments: string[];        // URLs
  notes: string | null;         // agent observations
  created_at: string;           // ISO8601
  updated_at: string;
}

// ─── TriageResult ─────────────────────────────────────────────────────────────

export interface PriorityScores {
  urgency: number;
  users_affected: number;
  customer_impact: number;
  financial_impact: number;
  security_flag: number;
  workaround: number;
  criticality: number;
}

export interface TriageResult {
  request_id: string;
  domain: Domain;
  system: string | null;
  module: string | null;
  confidence: number;           // 0.0 – 1.0
  evidence: string[];
  priority: Priority;
  priority_scores: PriorityScores;
  route: AgentRoute;
  is_duplicate: boolean;
  correlated_request_ids: string[];
  requires_human: boolean;
  triaged_at: string;
}

// ─── Decision ────────────────────────────────────────────────────────────────

export interface Decision {
  decision: string;
  confidence: number;
  evidence: string[];
  next_step: string;
  requires_human: boolean;
  reasoning_summary: string;    // plain language, NOT chain-of-thought
}

// ─── Action ──────────────────────────────────────────────────────────────────

export interface ActionAuthorization {
  requires_human: boolean;
  authorized_agents: string[];  // agent IDs allowed to trigger this action
  risk_level: 'READ' | 'WRITE' | 'DESTRUCTIVE';
}

export interface Action {
  action_id: string;
  action_type: ActionType;
  target: string;               // e.g., "github/org/repo", "ticket-system"
  parameters: Record<string, unknown>;
  authorization: ActionAuthorization;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  result: unknown | null;
  executed_at: string | null;
  executed_by: string;          // agent_id or human user_id
}

// ─── DecisionTrace ───────────────────────────────────────────────────────────

export interface DecisionTraceStep {
  step_id: string;
  timestamp: string;
  agent: string;
  state_from: string;
  state_to: string;
  decision: string;
  confidence: number;
  evidence: string[];
  context_source: ContextSource[];
  next_action: string;
  result: string | null;
}

export interface DecisionTrace {
  trace_id: string;
  request_id: string;
  steps: DecisionTraceStep[];
  final_outcome: string;
  resolved_at: string | null;
}

// ─── AgentMessage ─────────────────────────────────────────────────────────────

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface AgentMessage {
  message_id: string;
  timestamp: string;
  from_agent: string;
  to_agent: string;
  request_id: string;
  message_type: 'ROUTE' | 'RESULT' | 'ERROR' | 'ESCALATE' | 'CLARIFY';
  payload:
    | TriageResult
    | KnowledgeResult
    | EngineeringResult
    | IncidentResult
    | TicketResult
    | IssueResult
    | ErrorPayload;
  trace_step_id: string;
}

// ─── RepositoryMap ────────────────────────────────────────────────────────────

export interface ModuleEntry {
  path: string;         // e.g., "src/invoices"
  description: string;
  signals: string[];
}

export interface RepositoryEntry {
  id: string;
  name: string;
  full_name: string;    // org/repo
  description: string;
  primary_language: string;
  owner_team: string;
  on_call_engineer: string; // GitHub username
  signals: string[];        // e.g., ["invoice", "billing", "ERP"]
  main_modules: ModuleEntry[];
  last_commit_at: string;
}

export interface RepositoryMap {
  generated_at: string;
  repositories: RepositoryEntry[];
}

// ─── KnowledgeResult ─────────────────────────────────────────────────────────

export interface KnowledgeResult {
  request_id: string;
  resolved: boolean;
  confidence: number;             // 0.0–1.0
  answer: string;
  sources: string[];              // article_id or "ai_general_knowledge"
  data_source: 'knowledge_base' | 'data_warehouse' | 'ai_general' | 'unresolved';
  escalation_recommended: boolean;
  escalation_reason: string | null;
}

// ─── EngineeringResult (internal to issue-service) ───────────────────────────

export interface EngineeringResult {
  request_id: string;
  analysis: string;
  root_cause_hypothesis: string | null;
  confidence: number;
  evidence: string[];
  github_issue: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    milestone: string | null;
  } | null;
  requires_human_approval: boolean;
  recommended_action: string;
}

// ─── IncidentResult (internal to issue-service) ──────────────────────────────

export interface IncidentResult {
  request_id: string;
  incident_id: string | null;
  classification: 'DUPLICATE' | 'RELATED' | 'INCIDENT' | 'MAJOR_INCIDENT' | 'NONE' | null;
  correlated_request_ids: string[];
  requires_human_approval: boolean;
  recommended_action: string;
}

// ─── IssueResult (unified EngineeringResult + IncidentResult) ─────────────────

export interface IssueResult {
  // Stable identifiers
  issue_id: string;               // UUID generated by Issue Service
  request_id: string;
  issue_type: 'BUG' | 'INCIDENT' | 'MAJOR_INCIDENT';
  created_at: string;             // ISO8601

  // Engineering fields (present for SOFTWARE domain)
  analysis: string | null;
  root_cause_hypothesis: string | null;
  confidence: number;
  evidence: string[];
  github_issue: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    milestone: string | null;
  } | null;

  // Incident fields (present when issue_type = INCIDENT or MAJOR_INCIDENT)
  incident_id: string | null;
  classification: 'DUPLICATE' | 'RELATED' | 'INCIDENT' | 'MAJOR_INCIDENT' | 'NONE' | null;
  correlated_request_ids: string[];

  // Shared
  requires_human_approval: boolean;
  recommended_action: string;

  // External payload: full context snapshot for forwarding
  external_payload: {
    summary: string;
    domain: string;
    priority: string;
    system: string | null;
    evidence: string[];
    raw_request: string;
    trace_url: string | null;
  };
}

// ─── TicketResult ─────────────────────────────────────────────────────────────

export interface TicketResult {
  request_id: string;
  ticket_id: string;              // generated UUID
  queue: string;                  // IT-Hardware | IT-Security-Access | IT-Digital-Tools | etc.
  priority: Priority;
  title: string;
  description: string;            // LLM-composed natural language
  status: 'QUEUED_FOR_APPROVAL' | 'SENT' | 'FAILED';
  email_to: string[];             // queue owner email(s)
  requires_human: boolean;        // always true (email.send is always gated)
}

// ─── CandidateRequest ────────────────────────────────────────────────────────

export interface CandidateRequest {
  request_id: string;
  normalized_request: NormalizedRequest;
  triage_result: TriageResult;
}
