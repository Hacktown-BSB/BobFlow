# 08 — Priority Model

**Depends on:** `07_decision_architecture.md`  
**Used by:** Triage Agent, Orchestrator, `06_workflow_architecture.md`, SLA definitions

---

## Design Principle

Priority is computed **deterministically** from structured criteria. The LLM provides domain, system, and signals — the Priority Scoring Function computes the final priority value in code. The LLM cannot override this result.

---

## Priority Levels

| Level | Name | Response SLA | Auto-Action | Description |
|---|---|---|---|---|
| P0 | CRITICAL | 15 minutes | No (human required) | Service down, data breach, complete user blockage |
| P1 | HIGH | 2 hours | Yes | Major feature broken, multiple users blocked |
| P2 | MEDIUM | 8 hours | Yes | Important but workaround available |
| P3 | LOW | 48 hours | Yes | Minor issue, one user, minimal impact |
| P4 | INFORMATIONAL | No SLA | Yes | Questions, FYI, no action required |

---

## Priority Scoring Inputs

Each input is scored 0–5. Final priority = composite score mapped to level.

| Input | Score 0 | Score 1–2 | Score 3–4 | Score 5 |
|---|---|---|---|---|
| **Urgency** | No urgency stated | "Blocking me" | "Can't work" | "Business stopped" |
| **Users affected** | 1 user | 2–5 users | 6–20 users | >20 users or all |
| **Customer impact** | None | Internal only | Single customer | Multiple customers |
| **Financial impact** | None | Negligible | Measurable | Significant |
| **Security flag** | None | Potential | Probable | Confirmed |
| **Workaround** | Yes, easy | Yes, complex | Partial | None |
| **Operational criticality** | Non-critical | Important | Critical system | Core infrastructure |

---

## Priority Scoring Function

```
score = (
  urgency_score * 2 +         # weight 2
  users_affected_score * 2 +  # weight 2
  customer_impact_score * 3 + # weight 3
  financial_impact_score * 1 + # weight 1
  security_flag_score * 4 +   # weight 4 — security always elevated
  (5 - workaround_score) * 1 + # weight 1 — no workaround raises score
  criticality_score * 2        # weight 2
)

max_possible = (5*2 + 5*2 + 5*3 + 5*1 + 5*4 + 5*1 + 5*2) = 75
```

Priority mapping:

| Score Range | Priority |
|---|---|
| 60–75 | CRITICAL (P0) |
| 40–59 | HIGH (P1) |
| 20–39 | MEDIUM (P2) |
| 5–19 | LOW (P3) |
| 0–4 | INFORMATIONAL (P4) |

---

## Domain-Based Overrides

Some domains trigger automatic priority floor regardless of score:

| Domain | Minimum Priority |
|---|---|
| SECURITY | HIGH (if score < HIGH, elevate to HIGH) |
| SOFTWARE (production system down) | CRITICAL |
| ACCESS (C-level user blocked) | HIGH |

---

## Priority Signals Extracted by Triage Agent

The Triage Agent extracts these signals from the normalized request and passes them as structured fields to the Priority Scoring Function. The LLM does NOT output a priority — it outputs signal values.

---

## SLA Breach Policy

If SLA is breached:
1. Automatic escalation notification to team lead
2. Priority elevated by one level
3. Decision Trace updated with escalation reason
