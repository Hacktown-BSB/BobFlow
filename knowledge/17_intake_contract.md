# 17 — Intake Dev1↔Dev5 Contract

**File:** `knowledge/17_intake_contract.md`  
**Scope:** Frozen interface between Developer 1 and Developer 5 for the entry path.  
**Supersedes (for the entry path):** `knowledge/schemas/request.schema.json`, the NormalizedRequest section of `knowledge/11_data_contracts.md`  
**Depends on:** `17_intake_audit.md`, `17_intake_ingestion.md`, `17_intake_refinement_policy.md`, `17_intake_security.md`, `11_data_contracts.md`, `13_development_plan.md`  
**Used by:** Dev 1, Dev 5, integration tests, Day-1 stub

---

## 1. FINAL NormalizedRequest SCHEMA

This schema supersedes `knowledge/schemas/request.schema.json`. Every field is annotated with its writer and lifecycle stage.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "request.schema.json",
  "title": "NormalizedRequest",
  "description": "Lifecycle: ADAPTER_CREATED → REFINEMENT_ENRICHED → TRIAGE_READY",
  "type": "object",
  "required": [
    "request_id",
    "slack_event_id",
    "slack_user_id",
    "slack_channel_id",
    "thread_ts",
    "original_message",
    "is_complete",
    "clarification_round",
    "clarification_history",
    "attachments",
    "redaction_applied",
    "status",
    "created_at",
    "updated_at"
  ],
  "properties": {

    "request_id": {
      "type": "string", "format": "uuid",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "UUID v4. Generated once at event receipt. Never reassigned."
    },

    "slack_event_id": {
      "type": "string",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "Slack event_ts (microsecond precision). Unique DB index. Deduplication key."
    },

    "slack_user_id": {
      "type": "string",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED"
    },

    "slack_channel_id": {
      "type": "string",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED"
    },

    "thread_ts": {
      "type": ["string", "null"],
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "null on first channel message. Slack Adapter uses message.ts as thread anchor for replies. NOT required."
    },

    "original_message": {
      "type": "string",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "Redacted, concatenated (debounce window), immutable. Max 4000 chars. Post-redaction value only."
    },

    "redaction_applied": {
      "type": "boolean",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "True if any redaction pattern fired on original_message."
    },

    "redacted_patterns": {
      "type": "array",
      "items": { "type": "string" },
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "Pattern type labels only (e.g. ['CREDENTIAL', 'EMAIL']). No values."
    },

    "status": {
      "type": "string",
      "enum": [
        "AGGREGATING", "RECEIVED", "NORMALIZING", "CLARIFICATION_PENDING",
        "READY_FOR_TRIAGE", "TRIAGING", "TRIAGED", "CONTEXT_RETRIEVAL",
        "AGENT_EXECUTING", "ACTION_PENDING", "ACTION_EXECUTED", "VERIFYING",
        "RESOLVED", "ESCALATED", "ABANDONED", "DUPLICATE_SUPPRESSED"
      ],
      "x-writer": "Orchestrator",
      "x-stage": "ALL",
      "description": "Owned exclusively by the Orchestrator state machine. Dev 1 writes RECEIVED on record creation; all subsequent transitions owned by Dev 5."
    },

    "attachments": {
      "type": "array",
      "items": { "type": "string" },
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED",
      "description": "Slack file URLs only. No content fetched in MVP."
    },

    "normalized_message": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "null until Refinement Agent completes. Required before READY_FOR_TRIAGE."
    },

    "intent": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "One-line intent. null until set by Refinement Agent."
    },

    "domain_hint": {
      "type": ["string", "null"],
      "enum": ["SOFTWARE", "DIGITAL", "HARDWARE", "ACCESS", "SECURITY", "BUSINESS_PROCESS", "QUESTION", "UNKNOWN", null],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "x-provenance": "INFERRED by LLM — not stated by user unless explicit"
    },

    "system_hint": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "x-provenance": "INFERRED"
    },

    "module_hint": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "x-provenance": "INFERRED"
    },

    "is_complete": {
      "type": "boolean",
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "false = request insufficient for triage but may still proceed. Default at creation: false."
    },

    "clarification_round": {
      "type": "integer", "minimum": 0, "maximum": 2,
      "x-writer": "Orchestrator (increments) / Refinement Agent (reads)",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "0 = no clarification sent. 1 = one question sent (may be unanswered). 2 = max reached."
    },

    "clarification_question": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent (via Orchestrator)",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "The pt-BR question currently pending. Set when is_complete=false and round < 2. Null otherwise."
    },

    "clarification_history": {
      "type": "array",
      "x-writer": "Orchestrator (appends Q); Slack Adapter (appends A on reply)",
      "x-stage": "REFINEMENT_ENRICHED",
      "items": {
        "type": "object",
        "required": ["question"],
        "properties": {
          "question": { "type": "string" },
          "answer":   { "type": ["string", "null"], "description": "null = question sent, not yet answered" }
        }
      }
    },

    "notes": {
      "type": ["string", "null"],
      "x-writer": "Refinement Agent",
      "x-stage": "REFINEMENT_ENRICHED",
      "description": "Agent observations: contradictions, evasive answers, security flags, missing fields at exit."
    },

    "created_at": {
      "type": "string", "format": "date-time",
      "x-writer": "Slack Adapter",
      "x-stage": "ADAPTER_CREATED"
    },

    "updated_at": {
      "type": "string", "format": "date-time",
      "x-writer": "Orchestrator",
      "x-stage": "ALL",
      "description": "Updated on every state transition."
    }
  }
}
```

### Fields the Orchestrator MUST validate before transitioning to READY_FOR_TRIAGE

```
normalized_message !== null
intent !== null
is_complete OR clarification_round >= 2
```

If validation fails, Orchestrator returns to NORMALIZING (re-invokes Refinement Agent once). If it fails again, set `notes` = "Validation failed twice", proceed to READY_FOR_TRIAGE with partial data.

---

## 2. HANDOFF PAYLOAD AT READY_FOR_TRIAGE

The Triage Agent receives only the following subset of `NormalizedRequest`. It does NOT receive the full record.

```typescript
interface TriageInput {
  request_id: string;
  normalized_message: string;     // never null at this point
  intent: string;                 // never null at this point
  domain_hint: Domain | null;
  system_hint: string | null;
  module_hint: string | null;
  is_complete: boolean;
  clarification_round: 0 | 1 | 2;
  notes: string | null;
  created_at: string;
}
```

**What Triage does NOT receive:**
- `original_message` — raw/redacted text not needed for classification
- `slack_user_id`, `slack_channel_id`, `thread_ts` — routing metadata, not classification signals
- `clarification_history` — conversation history, not needed for domain classification
- `slack_event_id` — dedup key, internal only
- `redaction_applied`, `redacted_patterns` — security metadata, not for Triage
- `attachments` — not processed in MVP

**Rationale (P12):** Triage's token budget is ~2,500. Sending the full record adds ~300 tokens of irrelevant fields. More importantly, `clarification_history` contains raw user replies that may contain prompt-injection attempts — Triage does not need them and should not see them.

---

## 3. DECISION TRACE ENTRIES — ENTRY PATH

The following trace steps are emitted by the entry path, in order, with example values.

### Step 1 — RECEIVED (emitted by Orchestrator immediately after record creation)

```json
{
  "step_id": "a1b2c3d4-...",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "agent": "slack_adapter",
  "state_from": "AGGREGATING",
  "state_to": "RECEIVED",
  "decision": "New request created from Slack message",
  "confidence": 1.0,
  "evidence": ["slack_event_id:1714000000.123456", "channel:C0123ABC", "trigger:app_mention"],
  "context_source": ["slack_message"],
  "next_action": "dispatch_to_refinement",
  "result": "request_id:req-00001234"
}
```

### Step 2 — NORMALIZING start (emitted when Refinement Agent is invoked)

```json
{
  "step_id": "b2c3d4e5-...",
  "timestamp": "2024-01-15T10:00:00.250Z",
  "agent": "refinement",
  "state_from": "RECEIVED",
  "state_to": "NORMALIZING",
  "decision": "Refinement Agent invoked",
  "confidence": 1.0,
  "evidence": ["clarification_round:0"],
  "context_source": ["slack_message"],
  "next_action": "run_refinement_llm",
  "result": null
}
```

### Step 3a — CLARIFICATION_PENDING (when is_complete=false after round 0 LLM call)

```json
{
  "step_id": "c3d4e5f6-...",
  "timestamp": "2024-01-15T10:00:02.100Z",
  "agent": "refinement",
  "state_from": "NORMALIZING",
  "state_to": "CLARIFICATION_PENDING",
  "decision": "Clarification required: missing error_description",
  "confidence": 0.72,
  "evidence": ["domain_hint:SOFTWARE", "missing_fields:[error_description]", "system_hint:ERP"],
  "context_source": ["slack_message"],
  "next_action": "send_clarification_question",
  "result": "question_sent:round_1"
}
```

### Step 3b — NORMALIZING resume (when clarification reply received)

```json
{
  "step_id": "d4e5f6g7-...",
  "timestamp": "2024-01-15T10:01:15.300Z",
  "agent": "slack_adapter",
  "state_from": "CLARIFICATION_PENDING",
  "state_to": "NORMALIZING",
  "decision": "Clarification answer received",
  "confidence": 1.0,
  "evidence": ["thread_ts:1714000000.123456", "round:1", "answer_length:42_chars"],
  "context_source": ["slack_message"],
  "next_action": "re_invoke_refinement_llm",
  "result": null
}
```

### Step 4 — READY_FOR_TRIAGE (emitted when Refinement exits cleanly)

```json
{
  "step_id": "e5f6g7h8-...",
  "timestamp": "2024-01-15T10:01:17.800Z",
  "agent": "refinement",
  "state_from": "NORMALIZING",
  "state_to": "READY_FOR_TRIAGE",
  "decision": "Normalization complete",
  "confidence": 0.91,
  "evidence": [
    "is_complete:true",
    "clarification_round:1",
    "domain_hint:SOFTWARE",
    "system_hint:ERP",
    "module_hint:invoice",
    "error_description:HTTP_500"
  ],
  "context_source": ["slack_message"],
  "next_action": "dispatch_to_triage",
  "result": "normalized_message_length:148_chars"
}
```

### Step 4-alt — READY_FOR_TRIAGE after round-2 exit (insufficient)

```json
{
  "step_id": "e5f6g7h8-...",
  "timestamp": "2024-01-15T10:03:00.000Z",
  "agent": "refinement",
  "state_from": "NORMALIZING",
  "state_to": "READY_FOR_TRIAGE",
  "decision": "Exited refinement after 2 clarification rounds with is_complete=false",
  "confidence": 0.3,
  "evidence": [
    "clarification_round:2",
    "missing_fields:[error_description]",
    "best_effort_domain_hint:UNKNOWN"
  ],
  "context_source": ["slack_message"],
  "next_action": "route_to_triage",
  "result": "partial_normalization"
}
```

---

## 4. FUNCTION SIGNATURES

### Dev 1 EXPOSES (consumed by Dev 5)

```typescript
// src/slack/adapter.ts

/**
 * Called by Bolt after ack(). Creates or updates request record.
 * Pure async — no return value needed by Orchestrator immediately.
 * Side effect: DB write, then calls orchestrator.onRequestReceived()
 */
function processSlackEvent(event: SlackEvent): Promise<void>;

/**
 * Sends a Slack message in the given thread.
 * Used by Orchestrator to deliver clarification questions and notifications.
 * Returns the Slack message ts for thread continuity.
 */
function sendSlackMessage(params: {
  channel_id: string;
  thread_ts: string | null;
  text: string;
}): Promise<{ ts: string; ok: boolean }>;

/**
 * Appends a clarification answer to an existing request.
 * Called when a thread reply routes to CLARIFICATION_PENDING request.
 * Returns updated request record.
 */
function appendClarificationAnswer(params: {
  request_id: string;
  answer: string;
}): Promise<NormalizedRequest>;
```

### Dev 1 CONSUMES FROM Dev 5 (provided in Day-1 stub)

```typescript
// src/orchestrator/interface.ts  (Dev 5 must deliver Day 1)

/**
 * Called by Slack Adapter after creating the minimal DB record.
 * Triggers RECEIVED → NORMALIZING state transition.
 */
orchestrator.onRequestReceived(request_id: string): Promise<void>;

/**
 * Called by Slack Adapter when a clarification reply arrives.
 * Triggers CLARIFICATION_PENDING → NORMALIZING state transition.
 */
orchestrator.onClarificationReply(params: {
  request_id: string;
  answer: string;
}): Promise<void>;

/**
 * Called by Refinement Agent with its partial output.
 * Orchestrator merges partial fields onto the persisted record.
 * Returns updated NormalizedRequest.
 */
orchestrator.onRefinementComplete(params: {
  request_id: string;
  partial: RefinementOutput;
}): Promise<NormalizedRequest>;

// src/db/repository.ts  (Dev 5 must deliver Day 1)

/**
 * Creates the minimal request record. Returns the new record.
 * Must enforce unique constraint on slack_event_id.
 */
db.createRequest(minimal: MinimalRequest): Promise<NormalizedRequest>;

/**
 * Finds open request by thread_ts and user_id.
 * Returns null if no match or if matched request is not CLARIFICATION_PENDING.
 */
db.findOpenRequestByThread(params: {
  thread_ts: string;
  slack_user_id: string;
}): Promise<NormalizedRequest | null>;

/**
 * Checks processed_events table.
 * Returns true if event was already processed (dedup hit).
 */
db.isEventProcessed(slack_event_id: string): Promise<boolean>;

/**
 * Records event as seen. Used before ack() to prevent duplicate processing.
 */
db.recordEventSeen(slack_event_id: string): Promise<void>;
```

### Supporting types Dev 5 must define in Day-1 stub

```typescript
// Minimal record: what the Slack Adapter creates before Refinement runs
interface MinimalRequest {
  request_id: string;       // UUID v4 — generated by Slack Adapter
  slack_event_id: string;
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string | null;
  original_message: string; // post-redaction
  redaction_applied: boolean;
  redacted_patterns: string[];
  attachments: string[];
  status: 'RECEIVED';
  is_complete: false;
  clarification_round: 0;
  clarification_history: [];
  created_at: string;
  updated_at: string;
}

// What the Refinement Agent outputs (partial — merged by Orchestrator)
interface RefinementOutput {
  normalized_message: string;
  intent: string;
  domain_hint: Domain | null;
  system_hint: string | null;
  module_hint: string | null;
  is_complete: boolean;
  clarification_question: string | null;
  clarification_round: 0 | 1 | 2;
  notes: string | null;
}
```

---

## 5. CHANGES REQUIRED TO EXISTING KNOWLEDGE FILES

Files that must be edited for consistency with this contract.

| File | Location | Current text | Required change |
|---|---|---|---|
| `knowledge/schemas/request.schema.json` | Entire file | Original schema with `normalized_message` and `intent` as required; `thread_ts` as non-null required; no `slack_event_id`, no `clarification_question`, no `status`, no `redaction_applied` | **Replace entirely** with the schema in §1 of this document |
| `knowledge/11_data_contracts.md` | Line 10 | `"Created by the Slack Adapter, enriched by Refinement Agent."` | Replace with: `"Created in two stages: (1) MinimalRequest by Slack Adapter at event receipt; (2) enriched with Refinement output by Orchestrator. See 17_intake_contract.md §1."` |
| `knowledge/11_data_contracts.md` | Lines 17–18 | `thread_ts: string;` (non-null) | Replace with `thread_ts: string \| null;  // null on first channel message` |
| `knowledge/11_data_contracts.md` | Lines 12–35 (NormalizedRequest interface) | Missing `slack_event_id`, `clarification_question`, `status`, `redaction_applied`, `redacted_patterns` | Add the five new fields per §1 schema. Add `normalized_message: string \| null` and `intent: string \| null` (relax from non-null). |
| `knowledge/agents/refinement_agent.md` | Lines 56–61 | Refinement input: flat string array `["Q1","A1"]` | Replace with structured format: `[{ "question": "Q1", "answer": "A1" }]` per §1 schema |
| `knowledge/agents/refinement_agent.md` | Lines 83–94 | Internal state machine (`RAW_RECEIVED`, `ANALYZING`, `CLARIFICATION_SENT`) | Remove the Refinement-internal state machine entirely. Replace with: "Refinement Agent is a stateless function. States are owned by the Orchestrator. See `06_workflow_architecture.md` and `17_intake_ingestion.md`." |
| `knowledge/agents/refinement_agent.md` | Line 32 | `"Output ONLY valid JSON matching the NormalizedRequest schema."` | Replace with: `"Output JSON containing ONLY these fields: normalized_message, intent, domain_hint, system_hint, module_hint, is_complete, clarification_question, clarification_round, notes. Other fields are populated by the Orchestrator."` |
| `knowledge/00_project_context.md` | Line 51 | Domain table: `OTHER` | Replace `OTHER` with `UNKNOWN` to match `11_data_contracts.md` type Domain enum |
| `knowledge/04_agent_architecture.md` | Lines 85–91 (Tool Governance Matrix) | Refinement Agent has `Slack Write = ✓`; Notification Agent also has `Slack Write = ✓` for CLARIFICATION_NEEDED | **Resolve CONFLICT-2:** Clarification messages are sent by the **Notification Agent** via `slack.send_message`. The Refinement Agent does NOT call Slack directly — it returns `clarification_question` to the Orchestrator, which dispatches to Notification Agent. Remove `Slack Write` from Refinement Agent row. |
| `knowledge/06_workflow_architecture.md` | Line 14 | `↓ (is_complete or round ≥ 2)` | Replace with: `↓ (is_complete OR clarification_round >= 2 OR timeout)` — the timeout path (30 min CLARIFICATION_PENDING) is a third exit condition |
| `knowledge/06_workflow_architecture.md` | State table and state machine diagram | No `AGGREGATING` or `DUPLICATE_SUPPRESSED` states | Add both states and their transitions per `17_intake_ingestion.md` §6 |

---

## 6. SELF-REVIEW

### What was over-engineered here

1. **The `processed_events` table with 24-hour TTL** — for the demo, a simple in-memory Set keyed on `slack_event_id` survives the duration of a demo session. The DB table is correct for production but adds 20 minutes of implementation for a demo that runs for 3 minutes. If time is tight, use the in-memory Set with a note that the DB table replaces it post-MVP.

2. **The `AGGREGATING` state in the DB** — the debounce window runs in-process (a `setTimeout`). The DB record does not exist yet during aggregation; there is nothing to transition *in* the DB. The `AGGREGATING` state is useful for the state diagram and conceptual clarity, but it does not need a DB row. Remove it from the DB status enum; keep it in documentation only.

3. **The contradiction detection rule (§4 of refinement policy)** — detecting contradictions requires the LLM to reason about two statements. For the demo, no demo scenario exercises this path. It is correct and important for production but adds LLM prompt complexity. Mark it as SHOULD HAVE, not MUST HAVE.

4. **The full question bank in pt-BR for all 8 domains** — for the primary demo, only SOFTWARE domain clarification fires. Three questions cover all demo scenarios. The full bank is correct but can be filled in post-integration.

### What to cut if only 6 hours remain

In priority order (cut from bottom):

| Cut | Risk | Mitigation |
|---|---|---|
| Contradiction detection (refinement_policy §4) | Low — not exercised in any demo scenario | Add a note in `notes` field if answers differ; don't try to detect it automatically |
| `processed_events` DB table → in-memory Set | Medium — process restart loses dedup state | Pre-demo: restart cleanly before each run; demo duration < 10 min |
| Thread-reply routing lookup (§4 of ingestion) | **HIGH — do not cut** | Without this, the demo clarification loop breaks completely |
| Admin commands (`/triage-admin`) | Low — demo can be reset by restarting | Acceptable for demo day |
| Redaction (§4 of security) | Low — no demo scenario triggers redaction | Stub as a no-op that sets `redaction_applied: false` |

### The single biggest risk to the live demo

**Thread-reply routing not implemented** (CG-4 from audit). If the Slack Adapter does not match Ana's reply ("HTTP 500") to the existing open request by `thread_ts`, the reply creates a second parallel request. The Orchestrator invokes Refinement again on the reply alone ("HTTP 500" with no context), producing a second clarification question. The demo shows two bot messages instead of one. This is the highest-probability, highest-visibility failure mode. It must be implemented and tested before any other ingestion feature.

### What to build first (Day 1 order)

1. **Dev 5 (Day 1, first 2 hours):** `MinimalRequest` type, `db.createRequest()`, `db.isEventProcessed()`, `db.recordEventSeen()`, `db.findOpenRequestByThread()`, `orchestrator.onRequestReceived()` stub, `orchestrator.onClarificationReply()` stub. These are the interfaces that unblock Dev 1.

2. **Dev 1 (Day 1, after receiving Dev 5 stubs):** Bolt Socket Mode setup, signing secret middleware, bot-message guard (T0 of trigger policy), in-memory debounce timer (4s), `db.isEventProcessed()` call in sync path, `ack()` before any async work.

3. **Dev 1 (Day 2, first thing):** Thread-reply lookup (`db.findOpenRequestByThread()`), `appendClarificationAnswer()`, and the 30-minute CLARIFICATION_PENDING timeout. Test the primary demo scenario end-to-end with a mock Refinement Agent before writing the real Refinement Agent LLM prompt.
