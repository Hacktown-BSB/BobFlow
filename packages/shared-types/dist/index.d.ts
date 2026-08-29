export type Domain = 'SOFTWARE' | 'DIGITAL' | 'HARDWARE' | 'ACCESS' | 'SECURITY' | 'BUSINESS_PROCESS' | 'QUESTION' | 'UNKNOWN';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type AgentRoute = 'knowledge' | 'engineering' | 'ticket' | 'incident' | 'human';
export type ContextSource = 'slack_message' | 'knowledge_base' | 'github' | 'incident_db' | 'ticket_system';
export type ActionType = 'SLACK_MESSAGE' | 'GITHUB_ISSUE_CREATE' | 'GITHUB_REPO_READ' | 'TICKET_CREATE' | 'EMAIL_SEND' | 'KB_QUERY' | 'INCIDENT_CREATE' | 'INCIDENT_UPDATE';
export interface NormalizedRequest {
    request_id: string;
    slack_user_id: string;
    slack_channel_id: string;
    thread_ts: string;
    original_message: string;
    normalized_message: string;
    intent: string;
    domain_hint: Domain | null;
    system_hint: string | null;
    module_hint: string | null;
    is_complete: boolean;
    clarification_round: 0 | 1 | 2;
    clarification_history: Array<{
        question: string;
        answer: string;
    }>;
    attachments: string[];
    notes: string | null;
    created_at: string;
    updated_at: string;
}
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
    confidence: number;
    evidence: string[];
    priority: Priority;
    priority_scores: PriorityScores;
    route: AgentRoute;
    is_duplicate: boolean;
    correlated_request_ids: string[];
    requires_human: boolean;
    triaged_at: string;
}
export interface Decision {
    decision: string;
    confidence: number;
    evidence: string[];
    next_step: string;
    requires_human: boolean;
    reasoning_summary: string;
}
export interface ActionAuthorization {
    requires_human: boolean;
    authorized_agents: string[];
    risk_level: 'READ' | 'WRITE' | 'DESTRUCTIVE';
}
export interface Action {
    action_id: string;
    action_type: ActionType;
    target: string;
    parameters: Record<string, unknown>;
    authorization: ActionAuthorization;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
    result: unknown | null;
    executed_at: string | null;
    executed_by: string;
}
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
    payload: TriageResult | KnowledgeResult | EngineeringResult | IncidentResult | TicketResult | IssueResult | ErrorPayload;
    trace_step_id: string;
}
export interface ModuleEntry {
    path: string;
    description: string;
    signals: string[];
}
export interface RepositoryEntry {
    id: string;
    name: string;
    full_name: string;
    description: string;
    primary_language: string;
    owner_team: string;
    on_call_engineer: string;
    signals: string[];
    main_modules: ModuleEntry[];
    last_commit_at: string;
}
export interface RepositoryMap {
    generated_at: string;
    repositories: RepositoryEntry[];
}
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
export interface IncidentResult {
    request_id: string;
    incident_id: string | null;
    classification: 'DUPLICATE' | 'RELATED' | 'INCIDENT' | 'MAJOR_INCIDENT' | 'NONE' | null;
    correlated_request_ids: string[];
    requires_human_approval: boolean;
    recommended_action: string;
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
    github_issue: {
        title: string;
        body: string;
        labels: string[];
        assignees: string[];
        milestone: string | null;
    } | null;
    incident_id: string | null;
    classification: 'DUPLICATE' | 'RELATED' | 'INCIDENT' | 'MAJOR_INCIDENT' | 'NONE' | null;
    correlated_request_ids: string[];
    requires_human_approval: boolean;
    recommended_action: string;
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
export interface CandidateRequest {
    request_id: string;
    normalized_request: NormalizedRequest;
    triage_result: TriageResult;
}
//# sourceMappingURL=index.d.ts.map