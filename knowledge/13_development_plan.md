# 13 — Development Plan

**Depends on:** `10_technical_architecture.md`, `04_agent_architecture.md`, `11_data_contracts.md`, `12_tool_contracts.md`  
**Used by:** all developers, `14_testing_strategy.md`, `15_mvp_scope.md`

---

## Division Analysis

The proposed five-developer split is evaluated and adjusted for minimum coupling and maximum parallelism.

**Key constraint:** Orchestrator + Data Contracts must be available early — all other developers depend on them.

**Resolution:** Dev 5 delivers the shared skeleton (data contracts, DB, Orchestrator stub) on Day 1 so other developers can work against interfaces.

---

## Developer 1 — Slack Integration + Refinement Agent

### Mission
Build the system's front door: receive employee messages, send clarifications, and produce clean NormalizedRequests.

### Responsibilities
- Slack Bolt app setup (Socket Mode)
- Event handler for `app_mention` and DMs
- Slack Adapter: message → NormalizedRequest
- Refinement Agent implementation (LLM + clarification loop)
- Slack `send_message` and `read_message` tool implementations

### Files / Modules
```
src/slack/adapter.ts          # Slack event handler
src/slack/bot.ts              # Bolt app config
src/agents/refinement.ts      # Refinement Agent
src/tools/slack.ts            # Slack tool implementations
```

### API Contracts
- **Produces:** `NormalizedRequest` → passes to Orchestrator via `AgentMessage`
- **Consumes:** `AgentMessage` type=CLARIFY from Orchestrator → sends Slack message

### Dependencies
- `11_data_contracts.md` — NormalizedRequest, AgentMessage schemas
- Dev 5's Orchestrator interface (Day 1 stub)
- LLMClient interface

### Deliverables
1. Slack app receives messages and dispatches to Orchestrator
2. Refinement Agent produces valid NormalizedRequest
3. Clarification loop (max 2 rounds) works end-to-end
4. Slack messages sent correctly

### Definition of Done
- `POST /slack/events` receives message, Refinement Agent runs, NormalizedRequest produced
- Clarification sent to Slack when is_complete=false
- After clarification, NormalizedRequest updated
- Unit tests pass for Refinement Agent (see `14_testing_strategy.md`)

### Integration Points
- Orchestrator (Dev 5): receives NormalizedRequest
- Notification Agent (Dev 5): sends final results back to Slack

---

## Developer 2 — Triage Agent + Incident Agent + Decision Architecture

### Mission
Classify every request, compute priority deterministically, and detect correlated incidents.

### Responsibilities
- Triage Agent implementation
- Priority Scoring Function (deterministic code)
- Incident Agent implementation
- Embedding-based similarity search for duplicate/incident detection
- Decision tree loading and evaluation logic

### Files / Modules
```
src/agents/triage.ts                  # Triage Agent
src/agents/incident.ts                # Incident Agent
src/engine/priority-scoring.ts        # Deterministic priority function
src/engine/similarity.ts              # Embedding similarity + temporal correlation
src/decision-trees/loader.ts          # Load decision tree YAML/Markdown
```

### API Contracts
- **Consumes:** `NormalizedRequest` from Orchestrator
- **Produces:** `TriageResult`, `IncidentResult` → back to Orchestrator

### Dependencies
- `07_decision_architecture.md`, `08_priority_model.md`, `09_incident_model.md`
- Dev 5's DB layer (for querying recent requests for duplicate detection)
- LLMClient interface
- Dev 5's Orchestrator stub (Day 1)

### Deliverables
1. Triage Agent classifies domain with confidence > 0.6 on test cases
2. Priority Scoring Function computes deterministic priority from TriageResult
3. Incident Agent correlates requests correctly (see test cases in `14_testing_strategy.md`)
4. Decision trees loaded and evaluated correctly

### Definition of Done
- All 8 domain classifications tested with example requests
- Priority function produces correct output for all priority level boundary cases
- Duplicate and incident detection tested with correlated request sets
- No LLM used for priority computation

---

## Developer 3 — GitHub Integration + Repository Intelligence + Engineering Agent

### Mission
Implement progressive retrieval of repository context and generate high-quality GitHub Issues from software defect reports.

### Responsibilities
- GitHub Octokit client setup
- Repository map generation and loading
- Progressive retrieval: repository map → module list → file snippets → commits → diffs
- Engineering Agent implementation
- GitHub issue creation (with authorization check)

### Files / Modules
```
src/tools/github.ts                   # All GitHub tool implementations
src/context/repository-intelligence.ts # Progressive retrieval logic
src/agents/engineering.ts             # Engineering Agent
data/repository-map.json              # Repository map (seed data for demo)
```

### API Contracts
- **Consumes:** `TriageResult` (domain=SOFTWARE) from Orchestrator
- **Produces:** `EngineeringResult` → Orchestrator → Action Engine

### Dependencies
- `agents/engineering_agent.md`, `schemas/repository-map.schema.json`
- `12_tool_contracts.md` — github.* tool contracts
- Dev 5's Action Engine (for issue creation with approval gate)
- LLMClient interface

### Deliverables
1. Repository map seeded for demo scenario (ERP/invoice module)
2. Progressive retrieval loads targeted context (≤4,000 tokens total)
3. Engineering Agent produces valid `EngineeringResult` with evidence
4. GitHub issue created with correct title, body, labels, assignee

### Definition of Done
- Progressive retrieval tested: verify token count stays ≤4,000 for demo scenario
- Engineering Agent tested with seed repository context
- GitHub issue created in test repository
- Issue content references actual retrieved code evidence

---

## Developer 4 — Knowledge Base + Ticket Agent + Knowledge Agent

### Mission
Implement the knowledge-base resolution path and IT ticket creation for non-software requests.

### Responsibilities
- Knowledge base data structure and loading (Markdown/JSON + vector index)
- Knowledge Agent implementation (semantic search + answer composition)
- Ticket Agent implementation
- IT ticketing system stub (mock REST API for MVP)
- Email integration (send_email tool, always requires human approval)

### Files / Modules
```
src/agents/knowledge.ts          # Knowledge Agent
src/agents/ticket.ts             # Ticket Agent
src/context/knowledge-retrieval.ts  # KB search (vector + keyword)
src/tools/ticket.ts              # Ticket system integration (mock)
src/tools/email.ts               # Email tool (human approval required)
data/knowledge-base/             # KB articles (Markdown files)
```

### API Contracts
- **Consumes:** `NormalizedRequest` + `TriageResult` from Orchestrator
- **Produces:** `KnowledgeResult`, `TicketResult` → Orchestrator

### Dependencies
- `11_data_contracts.md` — KnowledgeResult, TicketResult
- `12_tool_contracts.md` — kb.search, ticket.create, email.send
- Dev 5's Action Engine (for ticket creation and email approval gate)
- LLMClient interface + embedding for KB search

### Deliverables
1. Knowledge base seeded with 10–20 articles covering demo scenarios
2. KB semantic search returns relevant articles for demo queries
3. Knowledge Agent produces answers citing articles
4. Ticket Agent creates mock tickets with correct queue and priority
5. Email tool queues for human approval

### Definition of Done
- KB search returns relevant article for each demo scenario query
- Knowledge Agent answer confidence > 0.7 for seeded articles
- Ticket created in mock system with correct fields
- Email blocked until human approval in Action Engine

---

## Developer 5 — Orchestrator + Database + Action Engine + Dashboard + Notification

### Mission
Build the central nervous system: state machine, data persistence, action governance, and the demo dashboard.

### Responsibilities
- Request state machine (Orchestrator)
- Database schema and ORM (PostgreSQL / SQLite)
- Decision Trace storage (append-only)
- Action Engine with authorization and human approval gates
- Notification Agent (thin template layer)
- REST API for dashboard
- Dashboard (Next.js) — request list, Decision Trace viewer, incident view
- Agent manifest versioning
- Agent message bus (in-process for MVP)

### Files / Modules
```
src/orchestrator/state-machine.ts    # Request lifecycle
src/orchestrator/router.ts           # Agent routing table
src/engine/action-engine.ts          # Tool authorization + execution
src/engine/human-approval.ts         # Approval gate management
src/agents/notification.ts           # Notification Agent
src/db/schema.ts                     # Database schema
src/db/trace.ts                      # Decision Trace repository
src/api/routes.ts                    # REST API
dashboard/                           # Next.js app
```

### API Contracts
- **Exposes:** REST API at `/api/requests`, `/api/traces`, `/api/incidents`
- **Provides to all devs on Day 1:**
  - `OrchestratorInterface` stub
  - `LLMClient` interface with mock implementation
  - DB models for NormalizedRequest, DecisionTrace

### Dependencies
- All other developers depend on Day 1 delivery of Orchestrator stub and shared interfaces
- `11_data_contracts.md` — all schemas
- `06_workflow_architecture.md` — state machine

### Deliverables
1. Day 1: Orchestrator stub + shared interfaces + DB schema
2. State machine routes requests through all workflow paths
3. Action Engine enforces tool authorization
4. Human approval gate works (queues action, notifies, unblocks on approval)
5. Decision Trace stored and queryable
6. Dashboard displays request list + Decision Trace timeline
7. Notification Agent sends correct Slack messages

### Definition of Done
- All workflow paths tested end-to-end (see `14_testing_strategy.md`)
- Action Engine rejects unauthorized tool calls
- Human approval gate blocks and unblocks correctly
- Dashboard shows Decision Trace for demo request
- Decision Trace is append-only (write test to verify)

---

## Integration Timeline

```
Day 1:  Dev 5 delivers Orchestrator stub + DB schema + LLMClient mock interface
        Dev 1, 2, 3, 4 begin parallel development against stubs

Day 2:  Dev 1 delivers Slack → Refinement → NormalizedRequest
        Dev 2 delivers Triage Agent (classification + priority)
        Dev 3 delivers Repository Map + progressive retrieval

Day 3:  Dev 4 delivers Knowledge Agent + KB data
        Dev 2 delivers Incident Agent
        Dev 5 delivers Action Engine + Notification Agent

Day 4:  Integration: full primary workflow end-to-end (Dev 5 leads)
        Dev 3 delivers Engineering Agent + GitHub issue creation
        Dev 4 delivers Ticket Agent

Day 5:  End-to-end demo testing
        Dev 5 delivers Dashboard + Decision Trace viewer
        All: fix integration issues
        All: rehearse demo scenarios
```
