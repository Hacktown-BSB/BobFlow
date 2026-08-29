# 09 — Incident Model

**Depends on:** `07_decision_architecture.md`, `08_priority_model.md`  
**Used by:** Incident Agent, Triage Agent, `06_workflow_architecture.md`

---

## Definitions

| Type | Definition |
|---|---|
| **Individual Request** | A single report from one employee, no correlation with others |
| **Duplicate** | Same issue, same system, same module, same user OR two different users within 15 minutes |
| **Related Request** | Same system/domain, different module or different users, within 2 hours |
| **Incident** | ≥3 related requests across ≥2 users affecting the same system within 2 hours |
| **Major Incident** | ≥5 reports OR customer-facing impact OR security domain OR CRITICAL priority |

---

## Correlation Pipeline

```
New Request Arrives
        ↓
[DETERMINISTIC — no LLM]
Query recent requests (last 2h):
  - Same domain
  - Same system (if identified)
  - Embedding cosine similarity > 0.75
        ↓
Candidates found?
        ↓ YES                    ↓ NO
[LLM VALIDATION]           Continue as individual request
Incident Agent evaluates:
  - Are these the same problem?
  - Classify: DUPLICATE / RELATED / INCIDENT / MAJOR_INCIDENT
        ↓
Classification result
        ↓
Route accordingly
```

---

## Incident Lifecycle

```
POTENTIAL (correlation detected)
        ↓
VALIDATING (Incident Agent evaluating)
        ↓
DECLARED (threshold met)
        ↓
IN_PROGRESS (team assigned)
        ↓
MITIGATED (service restored, root cause TBD)
        ↓
RESOLVED (root cause confirmed, post-mortem complete)
        │
        └─ or → CLOSED_DUPLICATE (was actually a duplicate)
```

---

## Incident Record Schema

```json
{
  "incident_id": "uuid",
  "status": "POTENTIAL | VALIDATING | DECLARED | IN_PROGRESS | MITIGATED | RESOLVED",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "classification": "DUPLICATE | RELATED | INCIDENT | MAJOR_INCIDENT",
  "affected_system": "string",
  "affected_module": "string | null",
  "correlated_request_ids": ["uuid"],
  "declared_at": "ISO8601",
  "declared_by": "incident_agent | human",
  "assigned_team": "string | null",
  "timeline": [
    {
      "timestamp": "ISO8601",
      "event": "string",
      "actor": "string"
    }
  ]
}
```

---

## AI vs Deterministic Responsibility

| Task | Responsible |
|---|---|
| Embedding similarity computation | Deterministic (vector similarity) |
| Temporal window filtering | Deterministic |
| Same-system matching | Deterministic |
| Classification of correlation type | LLM (Incident Agent) |
| Severity assignment | Deterministic (Priority Model) |
| Major incident declaration | LLM + Human approval (MAJOR always requires human) |
| Incident timeline updates | Deterministic |

---

## Incident Notification

When an Incident is declared:

1. All correlated request users notified via Notification Agent
2. Affected team lead notified
3. Decision Trace updated with incident_id cross-reference
4. For MAJOR: Security/Management notified, human takes ownership

---

## Duplicate Handling

When a request is classified as DUPLICATE:

1. Link to the existing request/incident
2. Notify employee: "We're already working on this — [reference]"
3. Update existing incident with the additional report (increases severity signal)
4. Do not create a new ticket
