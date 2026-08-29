# Multi-Agent Orchestration Implementation Plan

**Project:** IBM Dev Day Hackathon — AI-Powered Corporate Triage & Workflow Orchestration Platform  
**Branch:** testes-de-orquestracao  
**Scope:** Microservices-based multi-agent system with Slack ingestion, XState FSM orchestration, and 4 agent API services  
**Stack selected:** `@slack/bolt` (Socket Mode) + **XState v5** (FSM) + Node.js (TypeScript)

---

## Overview

This plan implements a **microservices architecture** where:

1. **Slack Ingestion Service** — receives raw Slack messages via `@slack/bolt`, injects them into the Triage+Orchestration service.
2. **Triage + Orchestration Service** — hosts the XState FSM and the Triage Agent. The FSM drives the lifecycle; the Triage Agent classifies and routes each request to the correct downstream agent service.
3. **Four Agent API Services** — independent HTTP services, each owning a specific resolution domain:
   - `GET /answer` — Knowledge Agent (Q&A: KB lookup + AI fallback)
   - `POST /issues` + `GET /issues` — Issue Agent (unified Engineering + Incident, with persistent result store and consumer-list polling)
   - `POST /tickets` — Ticket Agent (creates a ticket via email)

Each agent service exposes a well-defined REST interface. The Orchestration service calls them over HTTP. This satisfies the requirement for service-level separation while keeping the state machine as the single source of truth for request lifecycle.

The Issue Service additionally implements a **producer/consumer store**: every `POST /issues` result is persisted and made available for downstream consumers (dashboards, Jira integrations, PagerDuty, external incident tools) via `GET /issues`. Consumers register a `consumer_id` and track their own read cursor — they only receive issues they have not yet acknowledged.

---

## Tooling Decision: XState v5 vs LangGraph vs watsonx Orchestrate

### Comparative Analysis

| Criterion | XState v5 | LangGraph (Python) | watsonx Orchestrate (SaaS) |
|---|---|---|---|
| **FSM model** | First-class finite state machines, statecharts, parallel states | DAG-based graph — not a strict FSM | Workflow builder, BPM-style |
| **Language** | TypeScript/JavaScript — native to this stack | Python only — requires cross-process bridge with Bolt | No-code / REST API |
| **Slack bolt integration** | ✅ Native — same runtime, same process | ❌ Requires Python↔Node bridge or full Python rewrite | ❌ REST webhook adapter |
| **Parallel states** | ✅ Native `type: parallel` — maps to CRITICAL priority path | ⚠️ `Send` nodes — workaround | ✅ Supported but proprietary config |
| **Timeout management** | ✅ Native `after()` — maps directly to all timeouts in doc 06 | ⚠️ Custom `asyncio` timers | ✅ Platform-managed |
| **Human-in-the-loop** | ✅ `invoke` + external event | ✅ Interrupt nodes in v0.2+ | ✅ Native approval flows |
| **Decision Trace** | ✅ Side effects in `entry`/`exit` — clean and testable | ⚠️ State annotations — less structured | ❌ Proprietary audit log |
| **LLM vendor lock-in** | ✅ None — FSM is separate from LLM calls | ⚠️ LangChain-native, flexible but opinionated | ❌ IBM watsonx required |
| **Testing** | ✅ First-class — deterministic simulation, no LLM needed | ✅ Pytest integration | ❌ Limited local testing |
| **Microservices fit** | ✅ FSM calls HTTP services via `invoke` promise | ✅ Nodes can call HTTP | ✅ Native integrations |
| **Hackathon viability** | ✅ Zero infra setup, runs locally | ⚠️ Separate Python runtime | ❌ IBM Cloud provisioning required |
| **Open source** | ✅ MIT | ✅ MIT | ❌ Commercial SaaS |

### Verdict

**XState v5 is selected.** The orchestration logic in `knowledge/06_workflow_architecture.md` is already expressed as a Statechart — XState implements that model directly. The microservices requirement is fully compatible: XState `invoke` targets are promises, which naturally wrap `fetch()` calls to the downstream agent services. LangGraph requires Python (wrong runtime) and is better suited when the orchestrator itself needs LLM-driven routing — here routing is deterministic. watsonx Orchestrate requires cloud provisioning and is not viable for a local demo.

**LangGraph note (post-MVP):** If future routing logic requires LLM-driven decisions at the orchestrator level, LangGraph becomes a viable migration path. The agent service interfaces defined here remain valid in that scenario.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     SLACK WORKSPACE                          │
└──────────────────────────┬───────────────────────────────────┘
                           │ app_mention / DM / thread reply
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              SLACK INGESTION SERVICE                         │
│  @slack/bolt (Socket Mode)                                   │
│  • Receives raw Slack events                                 │
│  • Builds NormalizedRequest skeleton                         │
│  • Dispatches to Orchestration Service                       │
│  • Routes thread replies to correct in-flight FSM actor      │
│  • Sends outbound messages (clarification, result)           │
└──────────────────────────┬───────────────────────────────────┘
                           │ NormalizedRequest
                           ▼
┌──────────────────────────────────────────────────────────────┐
│           TRIAGE + ORCHESTRATION SERVICE                     │
│  XState v5 FSM (one actor per request)                       │
│  + Triage Agent (LLM classification)                         │
│  + Refinement Agent (clarification loop)                     │
│  + Decision Trace management                                 │
│  + Action Engine (authorization + approval gate)             │
└──────┬───────────┬──────────────┬──────────────┬────────────┘
       │           │              │              │
       │ HTTP      │ HTTP         │ HTTP         │ HTTP
       ▼           ▼              ▼              ▼
┌────────────┐ ┌─────────────────────┐ ┌──────────────┐ ┌──────────────┐
│ KNOWLEDGE  │ │    ISSUE SERVICE     │ │   TICKET     │ │ NOTIFICATION │
│  SERVICE   │ │                      │ │   SERVICE    │ │  (inline)    │
│            │ │ POST /issues         │ │              │ │              │
│GET /answer │ │   ↓ persists result  │ │POST /tickets │ │• Slack send  │
│            │ │ GET /issues?consumer │ │              │ │• Templates   │
│• KB lookup │ │   ↓ consumer polling │ │• Email send  │ │              │
│• DW query  │ │                      │ │  (approval   │ │              │
│• AI fallbk │ │• Engineering Agent   │ │   required)  │ │              │
│            │ │• Incident Agent      │ │              │ │              │
│            │ │  (by severity)       │ │              │ │              │
└────────────┘ └──────────┬───────────┘ └──────────────┘ └──────────────┘
                          │ GET /issues
              ┌───────────┼───────────────┐
              ▼           ▼               ▼
       [Dashboard]  [Jira/PagerDuty]  [Any consumer]
```

---

## Agent Service Interface Contracts

### Knowledge Service — `GET /answer`

**Owns:** `knowledge_agent.md` behavior  
**Responsibility:** Answer any question — first attempts KB/DW lookup; falls back to AI general knowledge + governance constraints.

```typescript
// Request
GET /answer
Body: {
  request_id: string;
  normalized_request: NormalizedRequest;
  triage_result: TriageResult;
}

// Response: KnowledgeResult
{
  request_id: string;
  resolved: boolean;
  confidence: number;           // 0.0–1.0
  answer: string;
  sources: string[];            // article_id or "ai_general_knowledge"
  data_source: "knowledge_base" | "data_warehouse" | "ai_general" | "unresolved";
  escalation_recommended: boolean;
  escalation_reason: string | null;
}
```

**Internal resolution logic:**
1. Embed request intent → query KB vector store → top-5 articles
2. If `max relevance_score >= 0.6`: compose answer from KB snippets
3. Else if request involves org data (`domain_hint` in `BUSINESS_PROCESS`, `DIGITAL`, `QUESTION` + org keywords): query DW/spreadsheet
4. Else: answer from LLM general knowledge under governance rules
5. If `confidence < 0.7` in all paths: `resolved=false`, recommend Ticket

---

### Issue Service — `POST /issues` + `GET /issues`

**Owns:** both `engineering_agent.md` AND `incident_agent.md` behavior, unified by severity
**Responsibility:** Handle bugs (Engineering path) and critical incidents (Incident path) through a single interface. Every result is **persisted** so external consumers can retrieve it asynchronously via a consumer-list polling model.

#### Producer endpoint — `POST /issues`

Called exclusively by the Orchestration Service.

```typescript
// Request
POST /issues
Body: {
  request_id: string;
  normalized_request: NormalizedRequest;
  triage_result: TriageResult;             // severity derived from triage_result.priority
  candidate_requests?: CandidateRequest[]; // for incident correlation, optional
}

// Response: IssueResult (unified EngineeringResult + IncidentResult)
{
  issue_id: string;                // UUID generated by Issue Service — stable identifier
  request_id: string;
  issue_type: "BUG" | "INCIDENT" | "MAJOR_INCIDENT";
  created_at: string;              // ISO8601
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
  classification: "DUPLICATE" | "RELATED" | "INCIDENT" | "MAJOR_INCIDENT" | "NONE" | null;
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
```

#### Consumer endpoint — `GET /issues`

Called by any external client (dashboard, Jira adapter, PagerDuty webhook relay, etc.).

```typescript
// Query parameters
GET /issues?consumer_id=string&limit=number&since_issue_id=string

// consumer_id  — identifies the consumer; required for cursor tracking
// limit        — max items to return (default 20, max 100)
// since_issue_id — return only issues created AFTER this issue_id (cursor-based pagination)
//                  if omitted, returns the oldest unacknowledged items for this consumer

// Response
{
  consumer_id: string;
  items: IssueResult[];          // ordered by created_at ascending
  next_cursor: string | null;    // issue_id of last item — pass as since_issue_id on next call
  has_more: boolean;
}
```

#### Consumer acknowledgement — `POST /issues/ack`

```typescript
POST /issues/ack
Body: {
  consumer_id: string;
  issue_ids: string[];   // issue_ids the consumer has successfully processed
}

// Response
{ acknowledged: number }
```

#### Consumer registration — `POST /consumers`

```typescript
POST /consumers
Body: {
  consumer_id: string;    // stable identifier chosen by the consumer
  description: string;    // e.g. "jira-adapter", "pagerduty-relay", "dashboard"
  filter?: {
    issue_type?: ("BUG" | "INCIDENT" | "MAJOR_INCIDENT")[];
    min_priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    domain?: string[];
  };
}

// Response
{ consumer_id: string; registered_at: string; cursor: string | null }
```

**Consumer-list model — how it works:**

1. Each consumer registers once with `POST /consumers` and declares optional filters.
2. The Issue Service maintains one **read cursor** per consumer: the `issue_id` of the last acknowledged item.
3. `GET /issues?consumer_id=X` returns all unacknowledged items for `X` that pass `X`'s filters, in insertion order.
4. After processing, consumer calls `POST /issues/ack` to advance its cursor. Items are not deleted — they remain queryable by `issue_id` indefinitely (or until TTL policy is applied).
5. Multiple consumers are fully independent — one slow consumer does not block others.

**Internal routing by severity:**

| `triage_result.priority` | Internal path |
|---|---|
| `LOW`, `MEDIUM` | Engineering Agent path — progressive GitHub context retrieval → issue draft |
| `HIGH` | Engineering Agent path — auto-create issue, notify engineer |
| `CRITICAL` | Incident Agent correlation check first → if MAJOR_INCIDENT: escalate; else Engineering path with human approval required |
| Any + `domain = SECURITY` | Always Incident Agent path → MAJOR_INCIDENT evaluation |

---

### Ticket Service — `POST /tickets`

**Owns:** `ticket_agent.md` behavior  
**Responsibility:** Create a support ticket and deliver it via **email**. The email always requires human approval before sending (per `knowledge/12_tool_contracts.md` — `email.send` is always approval-required).

```typescript
// Request
POST /tickets
Body: {
  request_id: string;
  normalized_request: NormalizedRequest;
  triage_result: TriageResult;
  knowledge_result?: KnowledgeResult;   // null if KB did not resolve
}

// Response: TicketResult
{
  request_id: string;
  ticket_id: string;              // generated UUID
  queue: string;                  // IT-Hardware | IT-Security-Access | IT-Digital-Tools | etc.
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;            // LLM-composed natural language
  status: "QUEUED_FOR_APPROVAL" | "SENT" | "FAILED";
  email_to: string[];             // queue owner email(s)
  requires_human: boolean;        // always true (email.send is always gated)
}
```

**Email delivery logic:**
1. Map `TriageResult.domain` → queue name + queue owner email address
2. LLM composes `description` field in plain language from `NormalizedRequest` + `TriageResult`
3. Email body = structured ticket (title, description, priority, request_id, Decision Trace URL)
4. Action Engine gates send behind human approval
5. On approval: `email.send` executes; status → `SENT`
6. On rejection or timeout: status → `FAILED`, logged

**Queue → Email mapping (to be seeded):**

| Domain | Queue | Email |
|---|---|---|
| HARDWARE | IT-Hardware | it-hardware@company.com |
| ACCESS | IT-Security-Access | it-access@company.com |
| DIGITAL | IT-Digital-Tools | it-digital@company.com |
| BUSINESS_PROCESS | IT-Operations | it-ops@company.com |
| SOFTWARE (fallback) | Engineering-Triage | engineering@company.com |
| OTHER | IT-General | it-general@company.com |

---

## FSM State Machine (XState v5)

The Orchestration Service runs one XState actor per request. The FSM maps directly to `knowledge/06_workflow_architecture.md`:

```
RECEIVED
  → NORMALIZING          (Refinement Agent: clarification loop, max 2 rounds)
    → CLARIFICATION_PENDING  (waits Slack reply, timeout 30min → READY_FOR_TRIAGE)
  → READY_FOR_TRIAGE
  → TRIAGING             (Triage Agent: classify + route)
  → TRIAGED
  → CONTEXT_RETRIEVAL
  → AGENT_EXECUTING      (calls Knowledge | Issue | Ticket service via HTTP)
  → ACTION_PENDING       (awaits human approval for email/CRITICAL actions)
  → ACTION_EXECUTED
  → VERIFYING
  → RESOLVED             (Notification: Slack message back to user)

FAILURE STATES:
  CLARIFICATION_PENDING  (waiting Slack reply)
  ESCALATED              (human took over)
  ABANDONED              (72h timeout)
```

**CRITICAL parallel path:**
```
TRIAGED (priority=CRITICAL)
  ├─→ Issue Service (Incident correlation check)
  └─→ Human Approval Gate notification
          ↓ human approves
      ACTION_PENDING → ACTION_EXECUTED
```

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding, Monorepo, and Shared Types

**Status:** `[ ] pending`

**Intent**  
Create the TypeScript monorepo structure with one package per service, install all dependencies, and define the shared data contracts from `knowledge/11_data_contracts.md` as a shared types package. This is the foundation all other sub-tasks depend on.

**Expected Outcomes**
- Monorepo root with `packages/` directory containing one folder per service
- `packages/shared-types/` exporting all TypeScript interfaces
- `packages/slack-service/` scaffold
- `packages/orchestration-service/` scaffold
- `packages/knowledge-service/` scaffold
- `packages/issue-service/` scaffold
- `packages/ticket-service/` scaffold
- `LLMClient` interface with `MockLLMClient` for testing
- Root `package.json` with workspaces config

**Todo List**
1. Initialize monorepo: `npm init -y` at root; add `"workspaces": ["packages/*"]`
2. Create `packages/shared-types/`:
   - `src/index.ts` exporting all interfaces from `knowledge/11_data_contracts.md`:
     - `NormalizedRequest`, `TriageResult`, `AgentMessage`
     - `KnowledgeResult`, `IssueResult` (unified), `TicketResult`
     - `EngineeringResult`, `IncidentResult` (kept as internal types within issue-service)
     - `DecisionTrace`, `DecisionTraceStep`
     - `Action`, `ActionAuthorization`
     - `Domain`, `Priority`, `AgentRoute`
   - Also define the new `IssueResult` unified type (Engineering + Incident merged)
3. Create `packages/llm-client/`:
   - `LLMClient` interface: `complete(prompt): Promise<LLMResponse>`, `embed(text): Promise<number[]>`
   - `MockLLMClient` returning configurable fixture JSON responses
4. Install dependencies per package:
   - `@slack/bolt` → slack-service
   - `xstate` (v5) → orchestration-service
   - `express` → knowledge-service, issue-service, ticket-service
   - `uuid`, `dotenv` → all services
   - `typescript`, `tsx`, `vitest` → all services (dev)
5. Create `packages/*/tsconfig.json` all extending a root `tsconfig.base.json`
6. Create `.env.example` at root with all required environment variables

**Relevant Context**
- `knowledge/11_data_contracts.md` — all TypeScript interfaces to export
- `knowledge/10_technical_architecture.md` — technology stack
- New `IssueResult` must merge fields from `EngineeringResult` and `IncidentResult`

---

### Sub-Task 2 — Slack Ingestion Service (`packages/slack-service`)

**Status:** `[ ] pending`

**Intent**  
Implement the Slack ingestion layer using `@slack/bolt` in Socket Mode. This service is the raw data entry point: it receives Slack events, builds the initial `NormalizedRequest` skeleton, and calls the Orchestration Service. It also routes thread replies to the correct in-flight FSM actor, and sends outbound messages (clarification questions, final results).

**Expected Outcomes**
- `src/bot.ts` — `@slack/bolt` App initialized in Socket Mode
- `src/adapter.ts` — converts Slack event payload → `NormalizedRequest` skeleton
- `src/dispatcher.ts` — in-flight actor map (`Map<thread_ts, ActorRef>`), routes replies
- `src/sender.ts` — outbound Slack messages (clarification, result)
- `app_mention` and DM events handled; thread replies dispatched to correct actor
- New Slack message → new FSM actor created in Orchestration Service

**Todo List**
1. Create `src/bot.ts`:
   - Initialize `App` with `socketMode: true`, `appToken`, `botToken`
   - Register `app_mention` listener → call `dispatcher.handleNewMessage(event)`
   - Register `message` listener (DMs + thread replies) → call `dispatcher.handleMessage(event)`
2. Create `src/adapter.ts`:
   - `toNormalizedRequest(event): NormalizedRequest`:
     - `request_id`: `uuid()`
     - `slack_user_id`: `event.user`
     - `slack_channel_id`: `event.channel`
     - `thread_ts`: `event.thread_ts ?? event.ts`
     - `original_message`: `event.text`
     - `normalized_message`: same as original at this stage
     - `is_complete`: `false`, `clarification_round`: `0`
     - `created_at`, `updated_at`: now ISO8601
3. Create `src/dispatcher.ts`:
   - `Map<thread_ts, ActorRef>` of in-flight actors
   - `handleNewMessage(event)`: build `NormalizedRequest` → create FSM actor → start → send `RECEIVED`
   - `handleMessage(event)`: if `thread_ts` in map → send `CLARIFICATION_REPLY` to existing actor
   - `handleMessage(event)`: if `thread_ts` NOT in map → treat as new request
4. Create `src/sender.ts`:
   - `sendClarification(channel, thread_ts, question)` — posts clarification in thread
   - `sendResult(channel, thread_ts, message)` — posts final result in thread
   - `sendApprovalRequest(channel, action_id, description)` — posts Approve/Reject buttons
5. Add Bolt `action` handler for Approve/Reject button callbacks → sends `ACTION_APPROVED`/`ACTION_REJECTED` to correct actor

**Relevant Context**
- `knowledge/13_development_plan.md` — Developer 1: Slack + Refinement
- `knowledge/agents/refinement_agent.md` — clarification loop (max 2 rounds, 30min timeout)
- `knowledge/06_workflow_architecture.md` — CLARIFICATION_PENDING state

---

### Sub-Task 3 — Triage + Orchestration Service: XState FSM (`packages/orchestration-service`)

**Status:** `[ ] pending`

**Intent**  
Implement the XState v5 statechart and the Triage Agent (inline, not a separate service — the Orchestrator and Triage are co-located as they are tightly coupled routing logic). The FSM drives the full request lifecycle; the Triage Agent classifies and produces a `TriageResult` that the routing guard uses to decide which downstream agent service to call.

**Expected Outcomes**
- `src/machine.ts` — XState v5 statechart with all 13 states
- `src/router.ts` — deterministic routing guard from `TriageResult.route` + `priority`
- `src/trace.ts` — Decision Trace append on every state transition `entry`
- `src/agents/refinement.ts` — Refinement Agent (inline, handles clarification loop)
- `src/agents/triage.ts` — Triage Agent (LLM classification, inline)
- All timeouts via XState `after()`: 30min CLARIFICATION_PENDING, 60s AGENT_EXECUTING, 4h ACTION_PENDING
- CRITICAL parallel path via `type: parallel`
- `src/http/agent-client.ts` — HTTP client calling Knowledge/Issue/Ticket services

**Todo List**
1. Define `OrchestratorContext` type:
   - `request: NormalizedRequest`
   - `triageResult: TriageResult | null`
   - `agentResult: KnowledgeResult | IssueResult | TicketResult | null`
   - `trace: DecisionTrace`
   - `retryCount: number`
   - `error: string | null`
2. Define FSM events:
   - `RECEIVED`, `NORMALIZING_COMPLETE`, `CLARIFICATION_REPLY`
   - `TRIAGE_COMPLETE`, `CONTEXT_LOADED`, `AGENT_COMPLETE`
   - `ACTION_APPROVED`, `ACTION_REJECTED`, `HUMAN_ESCALATE`
   - `AGENT_TIMEOUT`, `RESOLVE`, `ABANDON`
3. Implement `src/machine.ts` states:
   - `RECEIVED` → immediate transition to `NORMALIZING`
   - `NORMALIZING` — invoke `refinementAgent.run()`:
     - `is_complete: true` → `READY_FOR_TRIAGE`
     - `is_complete: false` → `CLARIFICATION_PENDING`
   - `CLARIFICATION_PENDING`:
     - on `CLARIFICATION_REPLY` → `NORMALIZING` (round 2)
     - `after(1_800_000)` → `READY_FOR_TRIAGE` with partial data
   - `READY_FOR_TRIAGE` → immediate → `TRIAGING`
   - `TRIAGING` — invoke `triageAgent.run()`:
     - on complete → `TRIAGED`; if `requires_human: true` → `ESCALATED`
     - `after(60_000)` → retry once → `ESCALATED`
   - `TRIAGED` → `CONTEXT_RETRIEVAL`
   - `CONTEXT_RETRIEVAL` → immediate → `AGENT_EXECUTING`
   - `AGENT_EXECUTING` — invoke `agentClient.callRoute(triageResult)`:
     - Calls `/answer` (knowledge), `/issues` (issue), `/tickets` (ticket) based on routing guard
     - on complete → `ACTION_PENDING` or `VERIFYING` (depending on `requires_human`)
     - `after(60_000)` → retry once → `ESCALATED`
   - `ACTION_PENDING`:
     - on `ACTION_APPROVED` → `ACTION_EXECUTED`
     - on `ACTION_REJECTED` → `ESCALATED`
     - `after(14_400_000)` (4h) → auto-escalate
   - `ACTION_EXECUTED` → `VERIFYING` → `RESOLVED`
   - `RESOLVED` — `entry`: invoke Notification, append final trace step
   - `ESCALATED` — `entry`: invoke Notification with ESCALATED template
   - `ABANDONED` — set when total lifetime > 72h
4. Implement CRITICAL parallel compound state:
   - Region 1: normal `AGENT_EXECUTING` → Issue service (Incident path)
   - Region 2: `HUMAN_APPROVAL_GATE` — sends approval request via Slack sender
5. Implement `src/router.ts`: `getRoute(triageResult): 'knowledge' | 'issue' | 'ticket'`
   - `SOFTWARE` → `issue`
   - `SECURITY` → `issue` (Incident path via severity=CRITICAL)
   - `DIGITAL`, `BUSINESS_PROCESS`, `QUESTION` → `knowledge` (then `ticket` if unresolved)
   - `HARDWARE`, `ACCESS` → `ticket`
   - `UNKNOWN` → re-refine → human if still UNKNOWN
6. Implement `src/http/agent-client.ts`:
   - `callKnowledge(req, triage): Promise<KnowledgeResult>` → `GET /answer`
   - `callIssue(req, triage, candidates?): Promise<IssueResult>` → `POST /issues`
   - `callTicket(req, triage, knowledgeResult?): Promise<TicketResult>` → `POST /tickets`
7. Implement `src/trace.ts`: `appendTraceStep(context, from, to, agent, decision)`

**Relevant Context**
- `knowledge/06_workflow_architecture.md` — full state machine, all timeouts
- `knowledge/05_agent_registry.md` — routing table
- `knowledge/04_agent_architecture.md` — Orchestrator + Triage Agent definitions
- `knowledge/11_data_contracts.md` — `DecisionTrace`, `DecisionTraceStep`

---

### Sub-Task 4 — Knowledge Service (`packages/knowledge-service`)

**Status:** `[ ] pending`

**Intent**  
Implement the Knowledge Agent as a standalone Express HTTP service. It handles general Q&A using a three-tier resolution strategy: KB vector lookup → Data Warehouse/spreadsheet query → AI general knowledge fallback. The response always cites the data source used.

**Expected Outcomes**
- `src/server.ts` — Express server exposing `GET /answer`
- `src/agent.ts` — Knowledge Agent LLM logic
- `src/retrieval/kb.ts` — vector search over KB Markdown/JSON articles
- `src/retrieval/datawarehouse.ts` — query adapter for DW or spreadsheet (CSV/JSON for MVP)
- Three-tier resolution path fully implemented
- `data/` directory seeded with 10–20 KB articles covering demo scenarios

**Todo List**
1. Create `src/server.ts`:
   - Express app with `GET /answer` route
   - Parses `{ request_id, normalized_request, triage_result }` body
   - Calls `agent.run()` → returns `KnowledgeResult`
   - Health check: `GET /health`
2. Create `src/retrieval/kb.ts`:
   - Load KB articles from `data/kb/` (Markdown files)
   - Embed articles at startup (or load pre-computed vectors)
   - `search(query, domain?, topK=5): KBArticle[]` — cosine similarity against query embedding
3. Create `src/retrieval/datawarehouse.ts`:
   - For MVP: reads a CSV or JSON file acting as a data warehouse / spreadsheet
   - `query(intent, domain): DWResult[]` — keyword + fuzzy match
   - Returns structured rows relevant to the query
   - Designed to be replaced with a real DW connector post-MVP
4. Create `src/agent.ts` — `KnowledgeAgentRunner`:
   - Step 1: `kb.search(intent)` → if `max_score >= 0.6` → compose answer from KB snippets
   - Step 2: if KB score < 0.6 AND domain is org-specific → `datawarehouse.query(intent)`
   - Step 3: if no org data match OR domain is QUESTION/general → LLM general knowledge answer
   - Step 4: if `confidence < 0.7` in all steps → `resolved: false`, `escalation_recommended: true`
   - Always set `data_source` to `"knowledge_base" | "data_warehouse" | "ai_general" | "unresolved"`
5. Seed `data/kb/` with articles for demo scenarios (VPN access, ERP invoice module, SaaS tool reset, etc.)
6. Seed `data/dw/org-data.json` with mock org data (team contacts, system owners, process docs)

**Relevant Context**
- `knowledge/agents/knowledge_agent.md` — system prompt, retrieval steps, input/output
- `knowledge/12_tool_contracts.md` — `kb.search` tool contract
- New requirement: DW/spreadsheet query path for org-specific questions
- New requirement: AI general knowledge fallback path

---

### Sub-Task 5 — Issue Service (`packages/issue-service`)

**Status:** `[ ] pending`

**Intent**
Implement the unified Engineering + Incident agent as a standalone Express HTTP service with a **persistent result store and consumer-list polling model**. `POST /issues` processes the request, persists the result, and returns it synchronously to the Orchestration Service. External clients (dashboards, integrations) retrieve results asynchronously via `GET /issues` using per-consumer cursors and acknowledgement.

**Expected Outcomes**
- `src/server.ts` — Express server exposing `POST /issues`, `GET /issues`, `POST /issues/ack`, `POST /consumers`, `GET /consumers`
- `src/agents/engineering.ts` — Engineering Agent (progressive GitHub context retrieval + issue draft)
- `src/agents/incident.ts` — Incident Agent (correlation check + classification)
- `src/router.ts` — internal severity-based routing: `LOW/MEDIUM/HIGH` → Engineering; `CRITICAL` or `SECURITY` → Incident first
- `src/github/client.ts` — GitHub Octokit wrapper for progressive retrieval
- `src/store/issue-store.ts` — in-memory + SQLite-backed persistence of `IssueResult` records
- `src/store/consumer-registry.ts` — per-consumer cursor and filter management
- Multiple independent consumers each maintain their own read position; one slow consumer does not block others

**Todo List**

**Step A — Storage layer**
1. Create `src/store/issue-store.ts`:
   - SQLite table `issues`: `issue_id` (PK), `request_id`, `issue_type`, `priority`, `domain`, `created_at`, `payload` (JSON blob of full `IssueResult`)
   - `save(result: IssueResult): void` — INSERT only, never update
   - `getById(issue_id: string): IssueResult | null`
   - `getSince(since_issue_id: string | null, limit: number): IssueResult[]` — returns rows where `rowid > rowid of since_issue_id`, ordered by `created_at` ASC
   - `getFiltered(filters: ConsumerFilter, since_issue_id: string | null, limit: number): IssueResult[]` — applies `issue_type`, `min_priority`, `domain` filters on top of `getSince`
2. Create `src/store/consumer-registry.ts`:
   - SQLite table `consumers`: `consumer_id` (PK), `description`, `filter` (JSON), `cursor_issue_id` (nullable), `registered_at`
   - `register(consumer_id, description, filter?): Consumer`
   - `getCursor(consumer_id): string | null` — returns last acknowledged `issue_id`
   - `advanceCursor(consumer_id, issue_ids: string[]): number` — sets `cursor_issue_id` to max of provided ids by insertion order; returns count acknowledged
   - `getAll(): Consumer[]`

**Step B — Agent logic**
3. Create `src/router.ts` — `IssueRouter.route(input): Promise<IssueResult>`:
   - `priority in [LOW, MEDIUM, HIGH]` AND `domain=SOFTWARE` → `EngineeringAgent.run()`
   - `priority=CRITICAL` OR `domain=SECURITY` → `IncidentAgent.run()` first; if classification ≠ NONE → build IssueResult with incident fields; if domain also SOFTWARE → also run `EngineeringAgent.run()` and merge
   - Produce `issue_id = uuid()`, `created_at = now()`
   - Build `external_payload`: domain, priority, system, evidence[], raw_request, analysis summary, trace_url
4. Create `src/agents/engineering.ts`:
   - Progressive GitHub retrieval: repo map → module file list → snippets → commits → diff
   - LLM analysis → maps into `IssueResult` engineering fields
5. Create `src/agents/incident.ts`:
   - Stage 1 deterministic pre-filter on `candidate_requests` (same domain + system + 2h window + cosine sim > 0.75)
   - Stage 2 LLM classification → maps into `IssueResult` incident fields
6. Create `src/github/client.ts` — Octokit wrapper for all progressive retrieval tools
7. Seed `data/repository-map.json` for demo scenario

**Step C — HTTP layer**
8. Create `src/server.ts` with all routes:
   - `POST /issues` → call `IssueRouter.route()` → `store.save(result)` → return `IssueResult` (synchronous)
   - `GET /issues?consumer_id&limit&since_issue_id` → `registry.getCursor(consumer_id)` → `store.getFiltered(...)` → return `{ consumer_id, items, next_cursor, has_more }`
   - `POST /issues/ack` → `registry.advanceCursor(consumer_id, issue_ids)` → return `{ acknowledged }`
   - `POST /consumers` → `registry.register(...)` → return registered consumer
   - `GET /consumers` → `registry.getAll()` → return list (admin/debug endpoint)
   - `GET /issues/:issue_id` → `store.getById(...)` → return single `IssueResult` (direct lookup)
   - Health check: `GET /health`

**Relevant Context**
- `knowledge/agents/engineering_agent.md` — progressive retrieval steps, output schema
- `knowledge/agents/incident_agent.md` — correlation logic, classification thresholds
- `knowledge/12_tool_contracts.md` — `github.*` tool contracts
- New: `issue_id` added to `IssueResult` in `shared-types` (Sub-Task 1)
- New: consumer-list model — independent cursors per consumer, ack-based advancement

---

### Sub-Task 6 — Ticket Service (`packages/ticket-service`)

**Status:** `[ ] pending`

**Intent**  
Implement the Ticket Agent as a standalone Express HTTP service. It maps the enriched request to a queue, composes a plain-language description via LLM, and delivers the ticket via **email**. Email sending always requires human approval (per `knowledge/12_tool_contracts.md`). The service signals `status: "QUEUED_FOR_APPROVAL"` and waits for the Orchestration Service to dispatch `ACTION_APPROVED` before executing the send.

**Expected Outcomes**
- `src/server.ts` — Express server exposing `POST /tickets`
- `src/agent.ts` — Ticket Agent: queue mapping + LLM description composition
- `src/email/sender.ts` — Nodemailer SMTP sender (always gated behind approval)
- `src/email/templates.ts` — structured email template per queue
- Ticket created and status returned as `QUEUED_FOR_APPROVAL`; actual email send happens after FSM receives `ACTION_APPROVED`

**Todo List**
1. Create `src/server.ts`:
   - Express app with `POST /tickets` route
   - Parses `{ request_id, normalized_request, triage_result, knowledge_result? }` body
   - Calls `agent.run()` → returns `TicketResult` with `status: "QUEUED_FOR_APPROVAL"`
   - Exposes `POST /tickets/:ticket_id/send` — triggered by Orchestration Service after human approval; executes actual email send
   - Health check: `GET /health`
2. Create `src/agent.ts`:
   - `mapQueue(domain): { queue, emailTo }` — domain → queue name + recipient email
   - LLM `composeDescription(request, triage)` → plain-language ticket description
   - Build `TicketResult` with `status: "QUEUED_FOR_APPROVAL"`, `requires_human: true`
3. Create `src/email/templates.ts`:
   - `buildEmailBody(ticket: TicketResult, traceUrl: string): EmailContent`
   - Subject: `[{priority}] {queue}: {title}`
   - Body: structured HTML/text with title, description, priority, request_id, Decision Trace URL
4. Create `src/email/sender.ts`:
   - Nodemailer SMTP transport configured from env
   - `send(content: EmailContent): Promise<SendResult>`
   - Called only from `POST /tickets/:ticket_id/send` (approval-gated path)
5. Seed `src/email/queue-map.ts` with domain → queue → email mapping

**Relevant Context**
- `knowledge/agents/ticket_agent.md` — queue routing, input/output schema
- `knowledge/12_tool_contracts.md` — `ticket.create` and `email.send` tool contracts (email always approval-required)
- `knowledge/10_technical_architecture.md` — Nodemailer for email
- New requirement: email as delivery mechanism (not REST ticketing stub)

---

### Sub-Task 7 — Action Engine and Human Approval Gate

**Status:** `[ ] pending`

**Intent**  
Implement the Action Engine inside the Orchestration Service. It validates tool authorization before any write action executes, and manages the human approval gate via Slack interactive components. This enforces the "never execute high-risk actions without human approval" constraint.

**Expected Outcomes**
- `src/engine/action-engine.ts` — validates agent authorization per `knowledge/12_tool_contracts.md`
- `src/engine/human-approval.ts` — queues pending actions, sends Slack Approve/Reject buttons, receives responses and dispatches FSM events
- CRITICAL GitHub issues and all email sends are blocked until approved

**Todo List**
1. Create `src/engine/action-engine.ts`:
   - `validate(action: Action, agentId: string): boolean` — check `authorized_agents`
   - `needsApproval(action: Action): boolean` — check `approval_required_when` conditions
   - `execute(action: Action): Promise<unknown>` — call correct downstream service endpoint
2. Create `src/engine/human-approval.ts`:
   - `Map<action_id, { actorRef, action }>` — pending approvals
   - `requestApproval(action, actorRef)`: store entry + call `sender.sendApprovalRequest()`
   - Bolt button handler: `ACTION_APPROVED`/`ACTION_REJECTED` → find actor by action_id → send FSM event → remove from map
3. Wire `needsApproval` check into FSM: after `AGENT_EXECUTING` completes, if `result.requires_human_approval: true` → transition to `ACTION_PENDING` and call `humanApproval.requestApproval()`

**Relevant Context**
- `knowledge/12_tool_contracts.md` — full tool authorization rules
- `knowledge/04_agent_architecture.md` — Tool Governance Matrix
- `knowledge/06_workflow_architecture.md` — ACTION_PENDING timeout (4h)

---

### Sub-Task 8 — Decision Trace Persistence

**Status:** `[ ] pending`

**Intent**  
Persist the `DecisionTrace` for every request to SQLite (MVP). The trace is append-only. It is written by the Orchestration Service at every FSM state transition entry point.

**Expected Outcomes**
- `src/db/schema.ts` — table definitions: `requests`, `decision_traces`, `trace_steps`
- `src/db/trace.ts` — `appendStep()` (INSERT only), `getTrace(requestId)`
- `src/db/request.ts` — `createRequest()`, `updateRequestStatus()`
- Trace is truly append-only — no UPDATE or DELETE on `trace_steps`

**Todo List**
1. Install `better-sqlite3` in orchestration-service
2. Create `src/db/schema.ts` with tables:
   - `requests`: `request_id`, `slack_user_id`, `original_message`, `status`, `created_at`, `updated_at`
   - `decision_traces`: `trace_id`, `request_id`, `final_outcome`, `resolved_at`
   - `trace_steps`: `step_id`, `trace_id`, `timestamp`, `agent`, `state_from`, `state_to`, `decision`, `confidence`, `next_action`
3. Create `src/db/migrate.ts` — run `CREATE TABLE IF NOT EXISTS` on startup
4. Create `src/db/trace.ts`:
   - `appendStep(step: DecisionTraceStep): void` — INSERT only
   - `getTrace(requestId: string): DecisionTrace`
5. Create `src/db/request.ts`:
   - `createRequest(req: NormalizedRequest): void`
   - `updateRequestStatus(requestId, status): void`
6. Wire `appendStep` into every FSM state `entry` action

**Relevant Context**
- `knowledge/11_data_contracts.md` — `DecisionTrace`, `DecisionTraceStep`
- `knowledge/10_technical_architecture.md` — SQLite for MVP

---

### Sub-Task 9 — End-to-End Integration Tests

**Status:** `[ ] pending`

**Intent**  
Validate the complete primary workflows end-to-end: from mock Slack event through FSM states through the agent service HTTP calls to the final Slack notification.

**Expected Outcomes**
- Primary workflow test: SOFTWARE domain → Issue Service → GitHub issue draft → Notification
- Knowledge workflow test: QUESTION domain → Knowledge Service (KB path + DW path + AI fallback)
- Ticket workflow test: HARDWARE domain → Ticket Service → email queued for approval
- CRITICAL parallel path test: priority=CRITICAL → parallel Incident + human approval gate
- Clarification loop test: vague message → CLARIFICATION_PENDING → reply → READY_FOR_TRIAGE
- Decision Trace completeness verified for all paths

**Todo List**
1. Create `tests/e2e/software-workflow.test.ts`:
   - Mock `app_mention` for a software bug
   - Start mock Issue Service returning fixture `IssueResult`
   - Verify FSM reaches `RESOLVED`, Decision Trace has all steps
2. Create `tests/e2e/knowledge-workflow.test.ts`:
   - QUESTION domain → Knowledge Service
   - Test KB path (high relevance), DW path (org-specific), AI fallback (general question)
3. Create `tests/e2e/ticket-workflow.test.ts`:
   - HARDWARE domain → Ticket Service
   - Verify `status: "QUEUED_FOR_APPROVAL"` returned
   - Dispatch `ACTION_APPROVED` → verify `POST /tickets/:id/send` called
4. Create `tests/e2e/critical-path.test.ts`:
   - CRITICAL priority → parallel state
   - Dispatch `ACTION_APPROVED` → verify FSM resolves
5. Create `tests/e2e/clarification-loop.test.ts`
6. Create `tests/unit/router.test.ts` — all 8 domain routing cases
7. Create `tests/unit/issue-store.test.ts` — consumer-list model:
   - Register two consumers with different filters
   - `POST /issues` × 3 with varying priority/domain
   - Verify `GET /issues?consumer_id=A` returns only items matching A's filter
   - Verify `GET /issues?consumer_id=B` returns its own independent set
   - `POST /issues/ack` for consumer A → verify cursor advances
   - Second `GET /issues?consumer_id=A` returns only new items after cursor
   - Verify consumer B cursor is unchanged

**Relevant Context**
- `knowledge/06_workflow_architecture.md` — all workflow paths
- `knowledge/14_testing_strategy.md`
- `knowledge/05_agent_registry.md` — routing table

---

## Final File Structure

```
/ (monorepo root)
├── package.json                    # workspaces: ["packages/*"]
├── tsconfig.base.json
├── .env.example
└── packages/
    ├── shared-types/               # Sub-Task 1
    │   └── src/index.ts
    ├── llm-client/                 # Sub-Task 1
    │   └── src/client.ts
    ├── slack-service/              # Sub-Task 2
    │   └── src/
    │       ├── bot.ts
    │       ├── adapter.ts
    │       ├── dispatcher.ts
    │       └── sender.ts
    ├── orchestration-service/      # Sub-Tasks 3, 7, 8
    │   └── src/
    │       ├── machine.ts
    │       ├── router.ts
    │       ├── trace.ts
    │       ├── agents/
    │       │   ├── refinement.ts
    │       │   └── triage.ts
    │       ├── http/
    │       │   └── agent-client.ts
    │       ├── engine/
    │       │   ├── action-engine.ts
    │       │   └── human-approval.ts
    │       └── db/
    │           ├── schema.ts
    │           ├── migrate.ts
    │           ├── trace.ts
    │           └── request.ts
    ├── knowledge-service/          # Sub-Task 4
    │   └── src/
    │       ├── server.ts
    │       ├── agent.ts
    │       └── retrieval/
    │           ├── kb.ts
    │           └── datawarehouse.ts
    ├── issue-service/              # Sub-Task 5
    │   └── src/
    │       ├── server.ts
    │       ├── router.ts
    │       ├── agents/
    │       │   ├── engineering.ts
    │       │   └── incident.ts
    │       ├── github/
    │       │   └── client.ts
    │       └── store/
    │           ├── issue-store.ts      # SQLite: issues table, save/getSince/getFiltered
    │           └── consumer-registry.ts # SQLite: consumers table, cursor management
    └── ticket-service/             # Sub-Task 6
        └── src/
            ├── server.ts
            ├── agent.ts
            └── email/
                ├── sender.ts
                └── templates.ts
```

---

## Environment Variables

```
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...

# LLM
LLM_PROVIDER=mock|watsonx|openai
WATSONX_API_KEY=...
OPENAI_API_KEY=...

# Services (orchestration service needs these to call agent services)
KNOWLEDGE_SERVICE_URL=http://localhost:3001
ISSUE_SERVICE_URL=http://localhost:3002
TICKET_SERVICE_URL=http://localhost:3003

# Database
DATABASE_PATH=./data/triage.db

# Email (ticket service)
SMTP_HOST=smtp.company.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=triage-bot@company.com

# GitHub (issue service)
GITHUB_TOKEN=ghp_...
```
