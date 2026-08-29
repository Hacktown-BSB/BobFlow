# Agent Spec: Ticket Agent

**Depends on:** `04_agent_architecture.md`, `11_data_contracts.md`, `12_tool_contracts.md`  
**Used by:** Orchestrator, Developer 4

---

## Identity

| Field | Value |
|---|---|
| ID | `ticket` |
| Version | 1.0.0 |
| Owner | Developer 4 |

---

## Purpose

Maps enriched requests to the IT ticketing system. Mostly deterministic — the LLM is used only for generating the `description` field in natural language.

---

## Queue Routing

| Domain | Queue |
|---|---|
| HARDWARE | IT-Hardware |
| ACCESS | IT-Security-Access |
| DIGITAL | IT-Digital-Tools |
| BUSINESS_PROCESS | IT-Operations |
| SOFTWARE (fallback) | Engineering-Triage |
| OTHER | IT-General |

---

## Input

```json
{
  "normalized_request": "NormalizedRequest",
  "triage_result": "TriageResult",
  "knowledge_result": "KnowledgeResult | null"
}
```

---

## Output: TicketResult

```json
{
  "request_id": "uuid",
  "ticket_id": "string",
  "ticket_url": "string",
  "queue": "string",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "title": "string",
  "description": "string",
  "status": "CREATED | QUEUED | FAILED",
  "requires_human": false
}
```

---

## Failure Modes

| Failure | Handling |
|---|---|
| Ticketing system unavailable | Queue locally; retry up to 3× with exponential backoff |
| CRITICAL priority | Set requires_human=true before creation |
| Missing required fields | Fill with "unknown — see original request"; do not block |
