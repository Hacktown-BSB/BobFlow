# 04 — Agent Architecture

**Depends on:** `00_project_context.md`, `01_product_constitution.md`, `03_solution_model.md`  
**Used by:** `05_agent_registry.md`, `agents/*`, `06_workflow_architecture.md`, `12_tool_contracts.md`

---

## Architectural Analysis: Which Agents Are Required?

Before listing agents, evaluate necessity:

| Proposed Agent | Decision |
|---|---|
| Orchestrator | **REQUIRED** — routes between agents, manages state machine |
| Refinement | **REQUIRED** — ambiguity detection and clarification is distinct from classification |
| Triage | **REQUIRED** — classification + priority + duplicate detection (all pre-routing) |
| Knowledge | **REQUIRED** — knowledge-base lookup is a distinct execution path |
| Engineering | **REQUIRED** — GitHub context retrieval + issue generation is specialized |
| Incident | **REQUIRED** — correlation logic and incident lifecycle management is distinct |
| Ticket | **REQUIRED** — IT ticketing system integration (stubbed for MVP) |
| Notification | **KEEP but SIMPLIFY** — thin adapter; nearly deterministic; no dedicated LLM call needed |

**Decision:** Keep all 8. Notification is a thin function, not a full LLM agent. All others require distinct context and reasoning.

---

## Agent Interaction Model

Agents communicate exclusively through **structured `AgentMessage` objects** passed via the Orchestrator. Agents never call other agents directly. Agents never share raw conversation history.

```
Employee
    ↓ (Slack message)
Slack Adapter
    ↓ (NormalizedRequest)
Orchestrator
    ├─→ Refinement Agent  ←→ Employee (Slack clarification loop)
    ├─→ Triage Agent
    ├─→ Knowledge Agent
    ├─→ Engineering Agent
    ├─→ Incident Agent
    ├─→ Ticket Agent
    └─→ Notification Agent (thin, no LLM)
```

---

## Progressive Context Retrieval Policy

For every agent invocation, context is loaded in this order. Stop loading when sufficient:

```
1. GLOBAL    → Product Constitution summary (15 rules, ~500 tokens)
2. TASK      → Current request + conversation history
3. AGENT     → Agent-specific system prompt + tool list
4. WORKFLOW  → Current state machine state + route taken so far
5. DATA      → Domain-specific data retrieved on demand
6. TOOL      → Tool schemas for tools about to be invoked
```

**Never pre-load:** full repositories, full knowledge bases, org charts, other requests, unrelated domain context.

---

## Agent Context Matrix

| Agent | Global | Request | Decision Tree | Knowledge | GitHub | Incident | Ticket | State |
|---|---|---|---|---|---|---|---|---|
| Orchestrator | ✓ | ✓ | ✓ | | | | | ✓ |
| Refinement | ✓ | ✓ | | | | | | |
| Triage | ✓ | ✓ | ✓ | | | | | |
| Knowledge | ✓ | ✓ | | ✓ | | | | |
| Engineering | ✓ | ✓ | | | ✓ | optional | | |
| Incident | ✓ | ✓ | | | optional | ✓ | | |
| Ticket | ✓ | ✓ | | optional | | | ✓ | |
| Notification | ✓ | ✓ | | | | | optional | |

---

## Tool Governance Matrix

| Agent | Slack Read | Slack Write | GitHub Read | GitHub Write | KB Read | Ticket Write | Email | Action Engine |
|---|---|---|---|---|---|---|---|---|
| Orchestrator | | | | | | | | ✓ |
| Refinement | ✓ | ✓ | | | | | | |
| Triage | | | | | | | | |
| Knowledge | | | | | ✓ | | | |
| Engineering | | | ✓ | ✓ (issue create) | | | | |
| Incident | | | optional | | | | | |
| Ticket | | | | | | ✓ | | |
| Notification | | ✓ | | | | | ✓ (approval only) | |

---

## Agent Definitions

### Orchestrator

| Field | Value |
|---|---|
| Purpose | State machine controller for request lifecycle |
| Responsibilities | Route between agents; maintain request state; enforce authorization gates; append to Decision Trace |
| Non-responsibilities | Does not classify, does not retrieve content, does not execute external actions directly |
| Input | `NormalizedRequest` or `AgentMessage` |
| Output | `AgentMessage` routing instruction |
| Required context | GLOBAL + current request + current state + decision tree root |
| LLM usage | Minimal — routing is mostly deterministic based on Triage output |
| Decision authority | Routing decisions; escalation decisions |
| Human escalation | When `requires_human: true` or CRITICAL priority |
| Failure modes | Agent timeout → retry → escalate to human |
| Token budget | ~1,500 tokens per orchestration step |

---

### Refinement Agent

| Field | Value |
|---|---|
| Purpose | Convert ambiguous natural-language request into a structured, complete `NormalizedRequest` |
| Responsibilities | Detect missing required fields; generate ≤2 targeted clarification questions; normalize language; extract intent, domain hint, system hint |
| Non-responsibilities | Does not classify domain; does not score priority; does not route |
| Input | Raw Slack message + optional clarification replies |
| Output | `NormalizedRequest` with `is_complete: true/false` |
| Required context | GLOBAL + request + clarification history |
| LLM usage | HIGH — interprets natural language |
| Decision authority | Determines whether enough information exists to proceed |
| Human escalation | Never — incomplete requests return clarification, not escalation |
| Failure modes | After 2 clarification rounds, proceed with `is_complete: false, needs_human: false` |
| Token budget | ~2,000 tokens |

**Context budget:**
```
ALWAYS LOAD:   Product Constitution summary, clarification template
LOAD IF NEEDED: Domain-specific required fields (e.g., hardware fields vs. software fields)
NEVER LOAD:    Knowledge base, GitHub content, incident history
```

---

### Triage Agent

| Field | Value |
|---|---|
| Purpose | Classify domain, score priority, detect duplicates, select route |
| Responsibilities | Domain classification with confidence; priority score computation; similarity check against recent requests; select next agent |
| Non-responsibilities | Does not ask clarification; does not retrieve detailed context; does not execute actions |
| Input | `NormalizedRequest` |
| Output | `TriageResult` (domain, priority, route, confidence, duplicates) |
| Required context | GLOBAL + request + decision tree root + recent request summaries (last 24h) |
| LLM usage | MEDIUM — classification with structured output; priority is deterministic post-classification |
| Decision authority | Domain, priority, route |
| Human escalation | When confidence < 0.6 on domain classification |
| Failure modes | Low confidence → UNKNOWN route → human review |
| Token budget | ~2,500 tokens |

**Context budget:**
```
ALWAYS LOAD:   Decision tree root, priority scoring table, domain definitions
LOAD IF NEEDED: Recent request summaries for duplicate detection (last 24h, compressed)
NEVER LOAD:    Full knowledge base, GitHub repos, full incident history
```

---

### Knowledge Agent

| Field | Value |
|---|---|
| Purpose | Resolve requests using internal knowledge base |
| Responsibilities | Search KB with request intent; return most relevant articles; compose plain-language answer; indicate confidence |
| Non-responsibilities | Does not create tickets; does not access GitHub; does not interact with external systems |
| Input | `NormalizedRequest` + domain/system classification |
| Output | `KnowledgeResult` (answer, sources, confidence, resolved: bool) |
| Required context | GLOBAL + request + KB search results (retrieved, not preloaded) |
| LLM usage | HIGH — composing coherent answers from retrieved fragments |
| Decision authority | Whether the KB resolves the request |
| Human escalation | When confidence < 0.7 or no relevant articles found |
| Failure modes | No match → escalate to Ticket or Engineering |
| Token budget | ~3,000 tokens (includes retrieved KB snippets) |

---

### Engineering Agent

| Field | Value |
|---|---|
| Purpose | Analyze software defects using GitHub context and generate actionable GitHub Issues |
| Responsibilities | Identify relevant repository via repository map; retrieve targeted code context (not full files); analyze commits and PRs for related changes; generate structured GitHub Issue with reproduction steps and evidence |
| Non-responsibilities | Does not deploy; does not merge PRs; does not modify code; does not reassign tickets |
| Input | `NormalizedRequest` + `TriageResult` (domain=SOFTWARE, system, module) |
| Output | `EngineeringResult` (analysis, evidence, github_issue_draft, assigned_repo, assignee_suggestion) |
| Required context | GLOBAL + request + repository map + targeted code snippets + recent commit/PR summaries |
| LLM usage | HIGH — evidence analysis and issue composition |
| Decision authority | Repository selection; issue content; assignee suggestion |
| Human escalation | CRITICAL priority issues before creation; ambiguous repository assignment |
| Failure modes | Repository not found → escalate to Triage for re-classification |
| Token budget | ~4,000 tokens (targeted context is key constraint) |

**Context budget:**
```
ALWAYS LOAD:   Repository map (names, descriptions, owners — not code)
LOAD IF NEEDED: Module-level file list → specific file snippets → recent commits in module
NEVER LOAD:    Entire repository, unrelated repositories, HR data, ticket history
```

---

### Incident Agent

| Field | Value |
|---|---|
| Purpose | Detect, validate, and manage incidents from correlated requests |
| Responsibilities | Correlate similar requests (embedding similarity + temporal + system); validate whether threshold meets incident criteria; create or update incident record; escalate if major |
| Non-responsibilities | Does not resolve requests directly; does not create GitHub issues; does not notify users (delegates to Notification) |
| Input | `NormalizedRequest` + recent request summaries |
| Output | `IncidentResult` (is_incident: bool, incident_id, severity, correlated_requests, action) |
| Required context | GLOBAL + current request + recent similar requests (last 2h compressed summaries) |
| LLM usage | LOW-MEDIUM — correlation scoring is largely deterministic; summary reasoning is LLM |
| Decision authority | Incident declaration; severity assignment |
| Human escalation | MAJOR incidents always require human confirmation |
| Failure modes | Correlation service unavailable → process as individual request |
| Token budget | ~2,000 tokens |

---

### Ticket Agent

| Field | Value |
|---|---|
| Purpose | Create structured IT tickets in the ticketing system |
| Responsibilities | Map request fields to ticket schema; select correct ticket type and queue; set priority from `TriageResult`; create ticket; return ticket reference |
| Non-responsibilities | Does not classify; does not add technical analysis; does not notify |
| Input | `NormalizedRequest` + `TriageResult` |
| Output | `TicketResult` (ticket_id, url, queue, priority, status) |
| Required context | GLOBAL + request + ticket schema + queue definitions |
| LLM usage | LOW — mostly deterministic field mapping |
| Decision authority | Ticket queue selection |
| Human escalation | CRITICAL tickets |
| Failure modes | Ticketing system unavailable → queue locally; retry with backoff |
| Token budget | ~1,000 tokens |

---

### Notification Agent (thin function)

| Field | Value |
|---|---|
| Purpose | Send plain-language status updates to the employee via Slack |
| Responsibilities | Compose plain-language message from structured result; send Slack message; update thread |
| Non-responsibilities | Does not make decisions; does not call external APIs except Slack |
| Input | `NotificationRequest` (result type + content + user_id + thread_ts) |
| Output | Slack message confirmation |
| Required context | Request summary + result |
| LLM usage | LOW — template-based composition with light personalization |
| Decision authority | None |
| Human escalation | Never |
| Failure modes | Slack unavailable → log; retry |
| Token budget | ~500 tokens |
