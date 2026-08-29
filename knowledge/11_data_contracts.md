# 11 — Data Contracts

**Depends on:** `04_agent_architecture.md`, `05_agent_registry.md`, `07_decision_architecture.md`  
**Used by:** all developers, all agents, `schemas/*`

---

## NormalizedRequest

The primary data structure. Created by the Slack Adapter, enriched by Refinement Agent.

```typescript
interface NormalizedRequest {
  request_id: string;          // UUID
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string;
  original_message: string;    // raw Slack message, immutable
  normalized_message: string;  // cleaned, structured
  intent: string;              // one-line extracted intent
  domain_hint: Domain | null;  // set by Refinement, confirmed by Triage
  system_hint: string | null;  // e.g., "ERP", "CRM"
  module_hint: string | null;  // e.g., "invoice", "payment"
  is_complete: boolean;
  clarification_round: 0 | 1 | 2;
  clarification_history: Array<{ question: string; answer: string }>;
  attachments: string[];       // URLs
  notes: string | null;        // agent observations
  created_at: string;          // ISO8601
  updated_at: string;
}

type Domain = 'SOFTWARE' | 'DIGITAL' | 'HARDWARE' | 'ACCESS' |
              'SECURITY' | 'BUSINESS_PROCESS' | 'QUESTION' | 'UNKNOWN';
```

---

## TriageResult

Output of the Triage Agent.

```typescript
interface TriageResult {
  request_id: string;
  domain: Domain;
  system: string | null;
  module: string | null;
  confidence: number;           // 0.0 – 1.0
  evidence: string[];
  priority: Priority;           // set by Priority Scoring Function
  priority_scores: PriorityScores;  // inputs to scoring function
  route: AgentRoute;
  is_duplicate: boolean;
  correlated_request_ids: string[];
  requires_human: boolean;
  triaged_at: string;
}

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
type AgentRoute = 'knowledge' | 'engineering' | 'ticket' | 'incident' | 'human';

interface PriorityScores {
  urgency: number;
  users_affected: number;
  customer_impact: number;
  financial_impact: number;
  security_flag: number;
  workaround: number;
  criticality: number;
}
```

---

## Decision

The output of any agent decision step.

```typescript
interface Decision {
  decision: string;
  confidence: number;
  evidence: string[];
  next_step: string;
  requires_human: boolean;
  reasoning_summary: string;   // plain language, NOT chain-of-thought
}
```

---

## Action

Represents a governed tool execution.

```typescript
interface Action {
  action_id: string;
  action_type: ActionType;
  target: string;              // e.g., "github/org/repo", "ticket-system"
  parameters: Record<string, unknown>;
  authorization: ActionAuthorization;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  result: unknown | null;
  executed_at: string | null;
  executed_by: string;         // agent_id or human user_id
}

type ActionType =
  | 'SLACK_MESSAGE'
  | 'GITHUB_ISSUE_CREATE'
  | 'GITHUB_REPO_READ'
  | 'TICKET_CREATE'
  | 'EMAIL_SEND'
  | 'KB_QUERY'
  | 'INCIDENT_CREATE'
  | 'INCIDENT_UPDATE';

interface ActionAuthorization {
  requires_human: boolean;
  authorized_agents: string[];  // agent IDs allowed to trigger this action
  risk_level: 'READ' | 'WRITE' | 'DESTRUCTIVE';
}
```

---

## DecisionTrace

The immutable audit log for a request.

```typescript
interface DecisionTrace {
  trace_id: string;
  request_id: string;
  steps: DecisionTraceStep[];
  final_outcome: string;
  resolved_at: string | null;
}

interface DecisionTraceStep {
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

type ContextSource = 'slack_message' | 'knowledge_base' | 'github' | 'incident_db' | 'ticket_system';
```

---

## AgentMessage

Structured inter-agent communication via the Orchestrator.

```typescript
interface AgentMessage {
  message_id: string;
  timestamp: string;
  from_agent: string;
  to_agent: string;
  request_id: string;
  message_type: 'ROUTE' | 'RESULT' | 'ERROR' | 'ESCALATE' | 'CLARIFY';
  payload: TriageResult | KnowledgeResult | EngineeringResult | IncidentResult | TicketResult | ErrorPayload;
  trace_step_id: string;
}
```

---

## RepositoryMap

Compact index of repositories for progressive retrieval (no code loaded).

```typescript
interface RepositoryMap {
  generated_at: string;
  repositories: RepositoryEntry[];
}

interface RepositoryEntry {
  id: string;
  name: string;
  full_name: string;              // org/repo
  description: string;
  primary_language: string;
  owner_team: string;
  on_call_engineer: string;       // GitHub username
  signals: string[];              // e.g., ["invoice", "billing", "ERP"]
  main_modules: ModuleEntry[];
  last_commit_at: string;
}

interface ModuleEntry {
  path: string;                   // e.g., "src/invoices"
  description: string;
  signals: string[];
}
```
