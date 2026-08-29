# Agent Spec: Notification Agent

**Depends on:** `04_agent_architecture.md`, `11_data_contracts.md`  
**Used by:** Orchestrator, Developer 5

---

## Identity

| Field | Value |
|---|---|
| ID | `notification` |
| Version | 1.0.0 |
| Owner | Developer 5 |

---

## Purpose

Thin function agent. Composes plain-language Slack messages from structured results. No complex reasoning required — uses templates with light LLM personalization.

**No LLM call is made if a matching template exists.** LLM is only used for non-standard outcomes.

---

## Message Templates

| Result Type | Template |
|---|---|
| RESOLVED (KB) | "✅ Found a solution: [answer]. Source: [article_title]." |
| TICKET_CREATED | "📋 Created ticket [ticket_id] in [queue]. Priority: [priority]. Expected response: [SLA]." |
| GITHUB_ISSUE_CREATED | "🐛 Reported to Engineering — Issue [issue_number] created in [repository]. Assigned to [assignee or 'team']." |
| INCIDENT_DECLARED | "⚠️ Multiple users are reporting this issue. An incident has been opened [incident_id]. The team is investigating." |
| CLARIFICATION_NEEDED | "Hi [name], to help you faster I need one thing: [question]" |
| ESCALATED | "🔴 Your request has been escalated to [team]. A team member will contact you shortly." |
| UNABLE_TO_RESOLVE | "I wasn't able to resolve this automatically. I've flagged it for human review. You'll hear back soon." |

---

## Input

```json
{
  "notification_type": "RESOLVED | TICKET_CREATED | GITHUB_ISSUE_CREATED | INCIDENT_DECLARED | CLARIFICATION_NEEDED | ESCALATED | UNABLE_TO_RESOLVE",
  "user_id": "slack_user_id",
  "thread_ts": "string",
  "channel_id": "string",
  "result_summary": { },
  "decision_trace_url": "string | null"
}
```

---

## Output

Slack message sent. Returns:

```json
{
  "status": "SENT | FAILED",
  "slack_message_ts": "string | null"
}
```

---

## Failure Modes

| Failure | Handling |
|---|---|
| Slack API unavailable | Log; retry up to 3× with backoff; alert ops |
| Missing thread_ts | Send as new message in channel |
