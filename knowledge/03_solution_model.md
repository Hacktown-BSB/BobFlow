# 03 — Solution Model

**Depends on:** `00_project_context.md`, `02_problem_model.md`, `01_product_constitution.md`  
**Used by:** `04_agent_architecture.md`, `06_workflow_architecture.md`, `16_demo_strategy.md`

---

## Target Workflow

```
Slack Message (Employee)
         ↓
   [Slack Adapter]
         ↓
   [Refinement Agent]
    - Normalize input
    - Detect ambiguity
    - Ask ≤2 clarification rounds
         ↓
   [Triage Agent]
    - Classify domain
    - Score priority
    - Detect duplicates/incidents
         ↓
   [Decision Tree]
    - Hierarchical routing
    - Domain → System → Module
         ↓
   [Context Retrieval]
    - Load only required context
         ↓
   [Specialized Agent]
    (Knowledge / Engineering / Ticket / Incident)
         ↓
   [Action Engine]
    - Validate authorization
    - Execute governed action
         ↓
   [Verification]
    - Confirm action result
         ↓
   [Notification Agent]
    - Send plain-language update to employee
         ↓
   [Decision Trace]
    - Append final step
    - Available in dashboard
```

---

## Input

What enters the system:

| Field | Description |
|---|---|
| `slack_user_id` | Authenticated employee identifier |
| `channel_id` | Source Slack channel |
| `message_text` | Raw natural-language message |
| `thread_ts` | Slack thread reference for follow-up |
| `timestamp` | Message time |
| `attachments` | Optional: screenshots, files, logs |

---

## Processing Transformations

| Stage | Transformation |
|---|---|
| Normalization | Remove noise, extract intent, preserve facts |
| Ambiguity detection | Identify missing required fields per domain |
| Clarification | Targeted questions to fill gaps |
| Classification | Assign domain, system, module with confidence score |
| Priority scoring | Deterministic score from structured criteria |
| Duplicate detection | Cosine/embedding similarity + temporal + system correlation |
| Context retrieval | Load domain-specific knowledge progressively |
| Agent execution | Specialized agent acts on enriched request |
| Validation | Deterministic check of action parameters before execution |
| Decision Trace | Append each step with agent, decision, evidence, confidence |

---

## Output

Possible outcomes for a processed request:

| Output | Trigger | Actor Notified |
|---|---|---|
| **Direct Answer** | Known solution in knowledge base | Employee (Slack) |
| **IT Ticket** | Hardware, access, digital tool issue | Employee + IT team |
| **GitHub Issue** | Software defect, engineering investigation | Employee + assigned engineer |
| **Incident** | Multiple correlated reports | Employee + Engineering/IT |
| **Email** | Physical request or external escalation (human approval required) | Employee + relevant team |
| **Escalation** | CRITICAL priority or unresolvable by agents | Employee + Manager + Security |
| **Clarification Request** | Ambiguity blocking classification | Employee |
| **Unable to Resolve** | No route found, no matching context | Employee with honest message |

---

## Value Proposition

| Problem (from RC) | Solution |
|---|---|
| RC1 — No unified entry point | Slack as single universal interface |
| RC2 — No normalization | Refinement Agent standardizes all inputs |
| RC3 — No classification | Triage Agent with structured Decision Tree |
| RC4 — No context enrichment | Progressive Context Retrieval per domain |
| RC5 — No correlation | Incident Agent with similarity + temporal detection |
| RC6 — All or nothing context | Context classified as GLOBAL/TASK/AGENT/WORKFLOW/TOOL/DATA |
| RC7 — Subjective priority | Deterministic Priority Scoring function |
| RC8 — No knowledge capture | Resolved requests can feed knowledge base (post-MVP) |
| RC9 — No traceability | Immutable Decision Trace on every request |
| RC10 — Human-only workflows | Specialized agents execute governed actions autonomously |

---

## Differentiators

### 1. Progressive Context Retrieval
Unlike systems that dump entire codebases or knowledge bases into a prompt, this system traverses: REQUEST → DOMAIN → SYSTEM → MODULE → RESOURCE → TARGETED CONTENT. Token cost scales with request complexity, not repository size.

### 2. Agentic Routing
The system does not use a single monolithic LLM call. Each stage (refinement, classification, decision, action) is handled by a specialized agent with bounded context and bounded tools. This reduces hallucination risk and enables independent testing.

### 3. Incident Correlation
Multiple employees reporting similar problems within a time window are automatically correlated into a potential incident before any single ticket is created. This converts reactive support into proactive incident detection.

### 4. Decision Trace
Every request produces a structured, human-readable trace of every decision made. Support agents, managers, and engineers can understand exactly what happened and why — without access to raw LLM chain-of-thought.

### 5. Universal Slack Entry Point
Employees report everything through the interface they already use. No form to fill, no portal to navigate, no team email to find. The system handles routing, enrichment, and escalation invisibly.
