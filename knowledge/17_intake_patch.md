# 17 — Intake Specification Patch

**File:** `knowledge/17_intake_patch.md`
**Status:** Delta only. Apply to the four `17_intake_*.md` files and `agents/refinement_agent.md`. Do not modify those files directly until this patch is reviewed.

---

## 1. EXTRACTED_FIELDS STRUCTURE

**Choice:** flat JSON object (`extracted_fields`) on `NormalizedRequest`, not a discriminated map.  
**Reason:** the priority table in §2 of the refinement policy keys on individual field names directly; a flat object means field-presence checks are `extracted_fields.error_description != null` with no indirection, no domain-specific type switch, and no migration when a new domain is added.

### Fields (all nullable strings, all writer=Refinement Agent)

```
error_description     system_name           steps_to_reproduce
device_type           asset_tag             problem_description
access_type           urgency_reason        tool_name
account_email         what_was_observed     when_it_happened
which_system          process_name          stuck_step
specific_question     general_description
```

### Patch to `17_intake_contract.md` §1 — add to schema `properties` block (after `module_hint`, before `is_complete`)

```json
"extracted_fields": {
  "type": ["object", "null"],
  "x-writer": "Refinement Agent",
  "x-stage": "REFINEMENT_ENRICHED",
  "description": "Per-domain fields read by the question-selection algorithm. Null until Refinement Agent's first LLM call. Persisted to DB and reloaded on every clarification round. A field is considered PRESENT when its value is a non-null, non-empty string (including the sentinel 'unknown'). Set to {} (empty object) rather than null after round 0, so missing_fields[] can be derived by diffing against the domain's required set.",
  "properties": {
    "error_description":  { "type": ["string","null"] },
    "system_name":        { "type": ["string","null"] },
    "steps_to_reproduce": { "type": ["string","null"] },
    "device_type":        { "type": ["string","null"] },
    "asset_tag":          { "type": ["string","null"] },
    "problem_description":{ "type": ["string","null"] },
    "access_type":        { "type": ["string","null"] },
    "urgency_reason":     { "type": ["string","null"] },
    "tool_name":          { "type": ["string","null"] },
    "account_email":      { "type": ["string","null"] },
    "what_was_observed":  { "type": ["string","null"] },
    "when_it_happened":   { "type": ["string","null"] },
    "which_system":       { "type": ["string","null"] },
    "process_name":       { "type": ["string","null"] },
    "stuck_step":         { "type": ["string","null"] },
    "specific_question":  { "type": ["string","null"] },
    "general_description":{ "type": ["string","null"] }
  },
  "additionalProperties": false
}
```

Add `"extracted_fields"` to the `required` array in the schema (value is `{}` at creation; Refinement Agent populates it; Orchestrator reloads it from DB on each round).

### Patch to `RefinementOutput` in `17_intake_contract.md` §4 — add to `RefinementOutput` type

Add field to the `RefinementOutput` interface (in the Dev 5 stub section):

```typescript
extracted_fields: ExtractedFields;  // written by Refinement Agent; persisted to DB
```

Where `ExtractedFields` is typed as `Partial<Record<ExtractedFieldKey, string | null>>` and `ExtractedFieldKey` is the union of the 17 field names above.

---

## 2. SUFFICIENCY FUNCTION

```
FIELD_REQUIREMENTS = {
  SOFTWARE:         ["error_description", "system_name"],
  HARDWARE:         ["device_type", "problem_description"],
  ACCESS:           ["system_name", "access_type"],
  DIGITAL:          ["tool_name", "problem_description"],
  SECURITY:         ["what_was_observed", "when_it_happened", "which_system"],
  BUSINESS_PROCESS: ["process_name", "stuck_step"],
  QUESTION:         ["specific_question"],
  UNKNOWN:          ["general_description"],
  null:             ["general_description"],
}

function field_present(value):
  return value != null AND value.trim() != ""
  // "unknown" is a valid non-empty sentinel; it counts as present

function record_não_sei(field_name, extracted_fields):
  extracted_fields[field_name] = "unknown"
  // Refinement Agent sets this when user replies with "não sei" or equivalent
  // The field is then present; it no longer appears in missing_fields[]

function missing_fields(domain_hint, extracted_fields):
  required = FIELD_REQUIREMENTS[domain_hint ?? null]
  return [f for f in required if NOT field_present(extracted_fields[f])]

function is_complete(domain_hint, extracted_fields, clarification_round):
  if missing_fields(domain_hint, extracted_fields) == []:
    return true
  if clarification_round >= 2:
    return false  // exit forced; caller proceeds anyway
  return false
```

`is_complete` flips to `true` iff `missing_fields()` returns an empty list.  
No floating threshold. The only numeric boundary is `clarification_round >= 2` (forced exit).

---

## 3. TRACE CONFIDENCE

**Decision: fixed three-value scale.** Cheaper than a derivation rule over 17 fields and consistent with the three confidence values already used in the contract.

| Value | Meaning | When assigned |
|-------|---------|---------------|
| `0.9` | **HIGH** — all required fields present; `is_complete=true`; domain_hint is non-null and non-UNKNOWN | Steps 2, 3b (round 0 or round 1 sufficient), Step 4 normal exit |
| `0.72` | **MEDIUM** — `is_complete=true` via round 2, or domain_hint=UNKNOWN but fields populated, or one field answered as "unknown" | Step 4 after round 2 successful enough to exit cleanly |
| `0.3` | **LOW** — forced exit after round 2 with `is_complete=false`; or domain_hint=UNKNOWN and no fields populated | Step 4-alt (§3 Step 4-alt in the contract) |

Replace the unexplained literals `0.72`, `0.91`, and `0.3` in `17_intake_contract.md` §3 with references to this scale. Update Step 1 confidence to `0.9` (record creation is deterministic — no uncertainty), Step 2 to `0.9` (agent invoked successfully), Step 3a to `0.72` (incomplete, at least one round remaining), Step 3b to `0.9`, Step 4 to `0.9`, Step 4-alt to `0.3`.

---

## 4. REFINEMENT SYSTEM PROMPT

Replace `agents/refinement_agent.md` lines 28–34 with the literal text below (ready to paste as the `system` message string):

```
You are the Refinement Agent. Analyze the employee message and return ONLY valid JSON.

Required output fields:
  normalized_message (string), intent (string), domain_hint (one of: SOFTWARE HARDWARE
  ACCESS DIGITAL SECURITY BUSINESS_PROCESS QUESTION UNKNOWN), extracted_fields (object —
  populate every field you can infer; set absent fields to null), is_complete (boolean),
  clarification_question (string or null), clarification_round (0|1|2), notes (string or null).

Rules:
- Set domain_hint from message content. You MUST classify.
- Populate extracted_fields with all inferable values from the message and clarification history.
- Set is_complete=true only when all required fields for the domain are non-null and non-empty.
- If is_complete=false and round < 2, set clarification_question to the single most important
  missing field question in pt-BR. Ask only ONE question.
- After two rounds, set is_complete=false and proceed; do not ask another question.
- Never set a priority field.
```

Token count: ~160 tokens (well under 200).

---

## 5. FIVE DECIDED PATCHES

### 5a. Remove AGGREGATING from status enum

**File:** `17_intake_contract.md`  
**Section:** §1, `status` property `enum` array  
**Replace:**
```json
"enum": [
  "AGGREGATING", "RECEIVED", "NORMALIZING", "CLARIFICATION_PENDING",
  "READY_FOR_TRIAGE", "TRIAGING", "TRIAGED", "CONTEXT_RETRIEVAL",
  "AGENT_EXECUTING", "ACTION_PENDING", "ACTION_EXECUTED", "VERIFYING",
  "RESOLVED", "ESCALATED", "ABANDONED", "DUPLICATE_SUPPRESSED"
]
```
**With:**
```json
"enum": [
  "RECEIVED", "NORMALIZING", "CLARIFICATION_PENDING",
  "READY_FOR_TRIAGE", "TRIAGING", "TRIAGED", "CONTEXT_RETRIEVAL",
  "AGENT_EXECUTING", "ACTION_PENDING", "ACTION_EXECUTED", "VERIFYING",
  "RESOLVED", "ESCALATED", "ABANDONED", "DUPLICATE_SUPPRESSED"
]
```
Note: the `status` description already says "Dev 1 writes RECEIVED on record creation" — this is now the earliest valid DB value. The debounce buffer exists only in in-process memory; no DB row is written until `RECEIVED`.

---

### 5b. Remove email from redaction patterns

**File:** `17_intake_security.md`  
**Section:** §4 redaction table  
**Action:** Delete the email row entirely:

| Pattern | Regex | Replacement |
|---------|-------|-------------|
| ~~Email addresses~~ | ~~`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`~~ | ~~`[REDACTED-EMAIL]`~~ |

**Also delete** the Note below the table:  
> "Note: email redaction is intentional — employee email addresses are not needed..."

**Reason:** the ACCESS domain requires the reporter's account email to create the ticket; the Ticket Agent also needs it. `slack_user_id` is sufficient for Slack routing but not for service-desk account lookup.

**Also:** in `NormalizedRequest` schema, the `redacted_patterns` example `['CREDENTIAL', 'EMAIL']` — remove `'EMAIL'` from the example.

**Resolves OQ-S1** from `17_intake_security.md`.

---

### 5c. Apply debounce to thread replies

**File:** `17_intake_ingestion.md`  
**Section:** §2 debounce rules table  
**Replace** the thread-reply row:

| Context | Window | Resets on | Final trigger |
|---------|--------|-----------|---------------|
| **Thread reply** (clarification answer) | ~~**No debounce** — first reply is processed immediately~~ | N/A | ~~Immediate on receipt~~ |

**With:**

| Context | Window | Resets on | Final trigger |
|---------|--------|-----------|---------------|
| **Thread reply** (clarification answer) | **4 seconds** after first reply message from the same user in the same thread | Any new reply from the same user in the same thread within the window | Window expiry with no new reply |

**Effect on `appendClarificationAnswer()`:** The function must not be called immediately on receipt of a thread reply. Instead, the Slack Adapter starts a 4-second debounce timer (keyed on `thread_ts + slack_user_id`). On expiry, all reply messages collected in the window are concatenated (same `\n` join as channel messages) and passed as a single `answer` string to `appendClarificationAnswer()`. This ensures a user who types their clarification answer in two messages (e.g., "HTTP 500" then "on Chrome only") produces one answer entry in `clarification_history`, not two partial entries.

---

### 5d. /triage-admin reset-demo is MUST HAVE

**File:** `17_intake_security.md`  
**Section:** §3, commands table  
**Replace** the `reset-demo` row:

| Command | Action | Notes |
|---------|--------|-------|
| `/triage-admin reset-demo` | Set all non-RESOLVED requests to ABANDONED (dev only) | ~~Only enabled when `NODE_ENV=demo`~~ **MUST HAVE. Dependency of the one-open-request-per-channel rule (17_intake_ingestion.md §4). Without it, a rehearsal leaves a `CLARIFICATION_PENDING` request that blocks the next demo run. Not a cut candidate. Enabled when `NODE_ENV=demo` OR `NODE_ENV=development`.** |

**File:** `17_intake_contract.md`  
**Section:** §6 "What to cut if only 6 hours remain"  
If `reset-demo` appears in the cut list, remove it. It is not cuttable.

---

### 5e. Remove signing-secret verification row from pre-ack table

**File:** `17_intake_ingestion.md`  
**Section:** §5, pre-ack table  
**Delete** this row:

| Step | Component | Max time |
|------|-----------|---------|
| ~~Verify Slack signing secret (already decided)~~ | ~~Bolt middleware~~ | ~~< 5ms~~ |

**Revised table starts at:**

| Step | Component | Max time |
|------|-----------|---------|
| Check `processed_events` table for `slack_event_id` | Slack Adapter | < 20ms |
| Apply trigger policy (§1) | Slack Adapter | < 5ms |
| If UPDATE path: look up open request by `thread_ts` + `user` | Slack Adapter | < 20ms |
| Insert into `processed_events` (if new event) | Slack Adapter | < 20ms |
| Call `ack()` | Bolt | — |

**Revised budget:** < 65ms.

Add a note after the table:  
> Socket Mode uses a persistent WebSocket connection authenticated at setup time. Slack does not send a signing secret on Socket Mode events; HMAC verification does not apply. Deduplication via `processed_events` is unchanged — Slack still redelivers when `ack()` is late.

---

## 6. FILE PATCH LIST

| File | Section / Location | Change |
|------|--------------------|--------|
| `17_intake_contract.md` | §1 schema `properties`, after `module_hint` | Add `extracted_fields` property block (§1 above) |
| `17_intake_contract.md` | §1 schema `required` array | Add `"extracted_fields"` |
| `17_intake_contract.md` | §1 `status` enum | Remove `"AGGREGATING"` (§5a above) |
| `17_intake_contract.md` | §3 confidence values (0.72, 0.91, 0.3) | Replace with three-value scale from §3 above |
| `17_intake_contract.md` | §4 `RefinementOutput` type | Add `extracted_fields: ExtractedFields` field (§1 above) |
| `17_intake_contract.md` | §6 cut list | Remove `reset-demo` if listed (§5d) |
| `17_intake_security.md` | §4 redaction table | Delete email row and its Note (§5b) |
| `17_intake_security.md` | §3 commands table, `reset-demo` row | Replace Notes cell (§5d) |
| `17_intake_ingestion.md` | §2 debounce table, thread-reply row | Replace with 4-second window rule (§5c) |
| `17_intake_ingestion.md` | §5 pre-ack table | Delete signing-secret row; add Socket Mode note; update budget to < 65ms (§5e) |
| `agents/refinement_agent.md` | Lines 28–34 (system prompt RULES block) | Replace entirely with prompt from §4 above |

---

## 7. OQ-3 RESOLUTION — Thread anchor and DM fallback

### 7a. Channel path — where thread_ts is written

`thread_ts` is `null` on the `NormalizedRequest` record at creation (the Slack Adapter does not write it — the record is created from the debounce buffer, not from a single event's `thread_ts`). Without a fix, `findOpenRequestByThread()` queries on `null` and every clarification reply creates a new request.

**Fix:** The Orchestrator writes `thread_ts` when it transitions the record from `RECEIVED` → `NORMALIZING` and sends the first clarification question. At that point the Notification Agent has posted the bot reply, and Slack returns the bot message's `ts`. That value is the thread anchor.

**State transition:** `RECEIVED → NORMALIZING`
**Actor:** Orchestrator (immediately after Notification Agent posts the clarification question and receives the posted-message `ts` from Slack)
**Write:** `UPDATE requests SET thread_ts = <bot_message_ts>, updated_at = now() WHERE request_id = <id>`

This means `thread_ts` is the bot's first reply ts, not the user's original message ts. Both are valid Slack thread anchors. Using the bot reply ts is safer — the bot created it, so the ts is known and never ambiguous across retries.

Add to `17_intake_ingestion.md` §4 (thread-reply routing), after the existing pseudocode block:

> `thread_ts` on `NormalizedRequest` is null at record creation. The Orchestrator sets it to the bot clarification message ts at `RECEIVED → NORMALIZING`. `findOpenRequestByThread()` must only be called after this write has been committed.

---

### 7b. DM path — lookup fallback

In a DM, the user's reply carries `thread_ts = null` (DM conversations have no Slack threads). `findOpenRequestByThread({thread_ts, slack_user_id})` returns nothing and the trigger policy creates a new request instead of routing the answer.

**Final lookup signature:**

```typescript
function findOpenRequestForReply(
  thread_ts: string | null,
  slack_channel_id: string,
  slack_user_id: string,
): NormalizedRequest | null
```

**Resolution order (evaluated in sequence; first match wins):**

1. If `thread_ts != null`: `SELECT … WHERE thread_ts = ? AND slack_user_id = ? AND status = 'CLARIFICATION_PENDING'`
2. If `thread_ts == null`: `SELECT … WHERE slack_channel_id = ? AND slack_user_id = ? AND status = 'CLARIFICATION_PENDING' ORDER BY created_at DESC LIMIT 1`

Replace every call to `findOpenRequestByThread()` in the Slack Adapter with `findOpenRequestForReply()`. The trigger policy §1 and §4 routing logic are unchanged — only the lookup function changes.

**Reply routing rule (closes OQ-3):**

| Origin | Bot replies | Never |
|--------|-------------|-------|
| Channel `app_mention` | In-thread (`thread_ts` of the bot's own clarification message) | DM the user |
| DM to bot | Top-level DM reply (no `thread_ts` in the send call) | Create a new thread in the DM |

Add to `17_intake_ingestion.md` §1 trigger table note and §4 thread-reply routing:

> The bot never DMs a user who submitted via a channel mention. Replies to DM-originated requests are always top-level DM messages (no `thread_ts` in the `slack.send_message` call).

---

### 7c. File patch additions (append to §6 table)

| File | Section / Location | Change |
|------|--------------------|--------|
| `17_intake_ingestion.md` | §4 thread-reply routing, after existing pseudocode | Add thread_ts write rule (§7a above) |
| `17_intake_ingestion.md` | §4 thread-reply routing, lookup function | Replace `findOpenRequestByThread` signature and add DM fallback (§7b above) |

---

## 8. VERDICT

With patches 1–7 applied, Developer 1 can implement the Slack Adapter and the Refinement Agent without any further architectural decision. All schema fields, the question-selection algorithm, sufficiency check, system prompt, state transitions, dedup, redaction, admin command priority, thread anchor write, and DM reply routing are now fully specified.
