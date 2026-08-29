# 06 — Workflow Architecture

**Depends on:** `04_agent_architecture.md`, `05_agent_registry.md`, `07_decision_architecture.md`  
**Used by:** Orchestrator implementation, `13_development_plan.md`, `14_testing_strategy.md`

---

## Request Lifecycle State Machine

```
RECEIVED
    ↓
NORMALIZING          ← Refinement Agent active
    ↓ (is_complete or round ≥ 2)
READY_FOR_TRIAGE
    ↓
TRIAGING             ← Triage Agent active
    ↓
TRIAGED
    ↓
CONTEXT_RETRIEVAL    ← Domain-specific context loading
    ↓
AGENT_EXECUTING      ← Specialized agent active
    ↓
ACTION_PENDING       ← Awaiting Action Engine / human approval
    ↓
ACTION_EXECUTED
    ↓
VERIFYING
    ↓
RESOLVED ────────────────────────────────────┐
                                             │
FAILURE states:                              │
    CLARIFICATION_PENDING  (waiting reply)   │
    ESCALATED              (human took over) │
    ABANDONED              (timeout)         ←┘
```

---

## State Definitions

| State | Description | Actor |
|---|---|---|
| `RECEIVED` | Slack message received by adapter | Slack Adapter |
| `NORMALIZING` | Refinement Agent processing | Refinement Agent |
| `CLARIFICATION_PENDING` | Waiting for employee reply | Employee |
| `READY_FOR_TRIAGE` | Normalized request complete | Orchestrator |
| `TRIAGING` | Triage Agent classifying | Triage Agent |
| `TRIAGED` | Domain, priority, route determined | Orchestrator |
| `CONTEXT_RETRIEVAL` | Loading domain-specific context | Orchestrator |
| `AGENT_EXECUTING` | Specialized agent running | Knowledge/Engineering/Ticket/Incident Agent |
| `ACTION_PENDING` | Action awaiting authorization or human approval | Action Engine |
| `ACTION_EXECUTED` | External action completed | Action Engine |
| `VERIFYING` | Checking action result | Orchestrator |
| `RESOLVED` | Request closed with result | Notification Agent |
| `ESCALATED` | Human has taken ownership | Human |
| `ABANDONED` | Timeout exceeded, no response | System |

---

## Timeouts

| State | Timeout | On Timeout |
|---|---|---|
| `CLARIFICATION_PENDING` | 30 minutes | Proceed with partial info |
| `ACTION_PENDING` (human approval) | 4 hours | Auto-escalate to manager |
| `AGENT_EXECUTING` | 60 seconds | Retry once; then ESCALATED |
| Total request lifetime | 72 hours | Mark ABANDONED |

---

## Parallel Execution

For CRITICAL priority requests, Orchestrator runs in parallel:

```
TRIAGED (CRITICAL)
    ├─→ Incident Agent (correlation check)
    └─→ Human approval gate notification
            ↓
        Human approves
            ↓
        ACTION_PENDING → ACTION_EXECUTED
```

---

## Workflow Paths by Domain

| Domain | Path |
|---|---|
| SOFTWARE | Refinement → Triage → Engineering Agent → GitHub Issue → Notification |
| DIGITAL | Refinement → Triage → Knowledge Agent → (resolved?) Notification : Ticket Agent → Notification |
| HARDWARE | Refinement → Triage → Ticket Agent → Notification |
| ACCESS | Refinement → Triage → Ticket Agent → Notification |
| SECURITY | Refinement → Triage → Incident Agent → Escalation → Notification |
| QUESTION | Refinement → Triage → Knowledge Agent → Notification |
| BUSINESS_PROCESS | Refinement → Triage → Knowledge Agent → (resolved?) Notification : Ticket Agent → Notification |
| UNKNOWN | Refinement → Triage → Refinement (re-attempt) → Human escalation |
| Any CRITICAL | Above + parallel human approval gate |

---

## Decision Trace Append Points

The Orchestrator appends a trace step at every state transition. See `07_decision_architecture.md` for trace schema.

Append points: RECEIVED, NORMALIZING (complete), TRIAGED, CONTEXT_RETRIEVAL (complete), AGENT_EXECUTING (start + complete), ACTION_PENDING, ACTION_EXECUTED, RESOLVED/ESCALATED/ABANDONED.
