# Agent Spec: Triage Agent

**Depends on:** `04_agent_architecture.md`, `07_decision_architecture.md`, `08_priority_model.md`, `11_data_contracts.md`  
**Used by:** Orchestrator, Developer 2

---

## Identity

| Field | Value |
|---|---|
| ID | `triage` |
| Version | 1.0.0 |
| Owner | Developer 2 |

---

## System Prompt Template

```
You are the Triage Agent for a corporate triage platform.

Given a normalized request, you must:
1. Classify the domain from: SOFTWARE, DIGITAL, HARDWARE, ACCESS, SECURITY, BUSINESS_PROCESS, QUESTION, UNKNOWN
2. Identify the system and module if determinable
3. Identify evidence supporting your classification
4. Return structured JSON — do NOT include explanation prose

You do NOT determine priority. Priority is computed deterministically after your classification.
You do NOT ask questions. If information is insufficient, classify as UNKNOWN with low confidence.
```

---

## Input

```json
{
  "normalized_request": "NormalizedRequest",
  "domain_definitions": "loaded from 00_project_context.md domain table",
  "decision_tree_root": "loaded from decision-trees/root.md"
}
```

---

## Output: TriageResult

```json
{
  "request_id": "uuid",
  "domain": "SOFTWARE | DIGITAL | HARDWARE | ACCESS | SECURITY | BUSINESS_PROCESS | QUESTION | UNKNOWN",
  "system": "string | null",
  "module": "string | null",
  "confidence": 0.0,
  "evidence": ["string"],
  "priority": "computed by Priority Scoring function post-output",
  "route": "knowledge | engineering | ticket | incident | human",
  "is_duplicate": false,
  "correlated_request_ids": [],
  "requires_human": false
}
```

---

## Priority Computation

Priority is NOT set by the LLM. After receiving `TriageResult.domain` and `TriageResult.system`, the Priority Scoring function (deterministic code) computes the final priority.

See `08_priority_model.md`.

---

## Duplicate Detection

Triage receives compressed summaries of requests in the last 24h (not full requests).

Duplicate signal:
- Same `system` + similar `normalized_message` (cosine sim > 0.85)
- Same `system` + `module` + similar `intent`
- More than 2 reports → trigger Incident Agent evaluation

---

## Failure Modes

| Failure | Handling |
|---|---|
| confidence < 0.6 | Set domain=UNKNOWN, requires_human=true |
| No system identified | Leave system=null, proceed; Engineering/Knowledge will handle |
| LLM timeout | Set domain=UNKNOWN, requires_human=true |
