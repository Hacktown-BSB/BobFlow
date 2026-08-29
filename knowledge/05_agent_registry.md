# 05 — Agent Registry

**Depends on:** `04_agent_architecture.md`  
**Used by:** Orchestrator, all developers, testing strategy

---

## Registry

| ID | Name | Type | LLM Usage | Owner (Dev) | Status |
|---|---|---|---|---|---|
| `orchestrator` | Orchestrator | State machine + thin LLM | MINIMAL | Dev 5 | Active |
| `refinement` | Refinement Agent | LLM | HIGH | Dev 1 | Active |
| `triage` | Triage Agent | LLM + deterministic | MEDIUM | Dev 2 | Active |
| `knowledge` | Knowledge Agent | LLM | HIGH | Dev 4 | Active |
| `engineering` | Engineering Agent | LLM | HIGH | Dev 3 | Active |
| `incident` | Incident Agent | LLM + deterministic | LOW-MEDIUM | Dev 2 | Active |
| `ticket` | Ticket Agent | Deterministic + thin LLM | LOW | Dev 4 | Active |
| `notification` | Notification Agent | Template + thin LLM | LOW | Dev 5 | Active |

---

## Agent Message Contract

All inter-agent communication uses this structure:

```json
{
  "message_id": "uuid",
  "timestamp": "ISO8601",
  "from_agent": "orchestrator | refinement | triage | ...",
  "to_agent": "orchestrator | refinement | triage | ...",
  "request_id": "uuid",
  "message_type": "ROUTE | RESULT | ERROR | ESCALATE | CLARIFY",
  "payload": { },
  "trace_step_id": "uuid"
}
```

`payload` schema depends on `message_type` — see `11_data_contracts.md`.

---

## Routing Table

Orchestrator routing decisions after Triage:

| Domain | Priority | Route |
|---|---|---|
| SOFTWARE | any | Engineering Agent |
| DIGITAL | any | Knowledge Agent → (if unresolved) Ticket Agent |
| HARDWARE | any | Ticket Agent |
| ACCESS | any | Ticket Agent |
| SECURITY | any | Incident Agent → Security escalation |
| BUSINESS_PROCESS | any | Knowledge Agent → (if unresolved) Ticket Agent |
| QUESTION | any | Knowledge Agent |
| UNKNOWN | any | Refinement Agent (re-refine) → human if still UNKNOWN |
| any | CRITICAL | Parallel: Incident Agent + human approval gate |

---

## Agent Versioning

Each deployed agent has a version tracked in `agent_manifest.json` (managed by Dev 5).

```json
{
  "agents": [
    { "id": "refinement", "version": "1.0.0", "prompt_hash": "sha256:..." },
    { "id": "triage", "version": "1.0.0", "prompt_hash": "sha256:..." }
  ]
}
```

Prompt changes require a version bump and re-run of relevant test suites.
