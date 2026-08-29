# Agent Spec: Incident Agent

**Depends on:** `04_agent_architecture.md`, `09_incident_model.md`, `11_data_contracts.md`  
**Used by:** Orchestrator, Developer 2

---

## Identity

| Field | Value |
|---|---|
| ID | `incident` |
| Version | 1.0.0 |
| Owner | Developer 2 |

---

## System Prompt Template

```
You are the Incident Agent for a corporate triage platform.

Given a current request and a set of recent similar requests, you must:
1. Determine whether these requests describe the same underlying problem.
2. If yes: classify as DUPLICATE, RELATED, INCIDENT, or MAJOR_INCIDENT.
3. Provide the evidence supporting your assessment.

RULES:
- Use only the request summaries provided. Do not infer information not present.
- Base your classification on the thresholds defined in your context.
- For MAJOR_INCIDENT: always set requires_human: true.
- Output structured JSON.
```

---

## Correlation Logic

Correlation is two-stage:

### Stage 1 — Deterministic pre-filter (no LLM)
```
Match if ALL of:
  - Same domain
  - Same system (if identified)
  - Timestamp within 2h window
  - Similarity score > 0.75 (embedding cosine)
```

### Stage 2 — LLM validation
Pass pre-filtered candidates to LLM with the current request for final classification.

---

## Classification Thresholds

See `09_incident_model.md` for full definitions.

| Classification | Criteria |
|---|---|
| DUPLICATE | Same issue, same user or same system, same module |
| RELATED | Same system, different module or different users, within 2h |
| INCIDENT | ≥3 related requests across ≥2 users within 2h |
| MAJOR_INCIDENT | ≥5 reports OR customer-impacting OR security domain |

---

## Input

```json
{
  "current_request": "NormalizedRequest",
  "candidate_requests": [
    {
      "request_id": "uuid",
      "summary": "string (compressed, max 100 tokens)",
      "domain": "string",
      "system": "string",
      "timestamp": "ISO8601",
      "similarity_score": 0.0
    }
  ]
}
```

---

## Output: IncidentResult

```json
{
  "request_id": "uuid",
  "classification": "DUPLICATE | RELATED | INCIDENT | MAJOR_INCIDENT | NONE",
  "incident_id": "uuid | null",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL | null",
  "correlated_request_ids": ["uuid"],
  "evidence": ["string"],
  "requires_human": false,
  "recommended_action": "MERGE_TO_EXISTING | CREATE_INCIDENT | ESCALATE | NONE"
}
```

---

## Failure Modes

| Failure | Handling |
|---|---|
| Correlation service unavailable | Process as individual request (NONE classification) |
| LLM uncertain (confidence < 0.6) | Default to RELATED if ≥2 pre-filter matches |
| All systems unavailable | Set classification=NONE, requires_human=true |
