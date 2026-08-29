# 12 — Tool Contracts

**Depends on:** `04_agent_architecture.md`, `11_data_contracts.md`  
**Used by:** Action Engine, all agent implementations, `13_development_plan.md`

---

## Governance Rules

1. Every tool is classified as READ, WRITE, or DESTRUCTIVE
2. WRITE tools require explicit authorization in `Action.authorization`
3. DESTRUCTIVE tools are not available in MVP
4. No agent may call a tool not in its authorized list (Invariant I7)
5. All tool calls are logged to the Decision Trace
6. Tool schemas are versioned — breaking changes require agent version bumps

---

## Tool Registry

### slack.send_message

```typescript
{
  tool_id: "slack.send_message",
  risk_level: "WRITE",
  authorized_agents: ["notification", "refinement"],
  description: "Send a message to a Slack channel or thread",
  input: {
    channel_id: string,
    text: string,
    thread_ts?: string,
    blocks?: SlackBlock[]
  },
  output: {
    ok: boolean,
    ts: string
  }
}
```

---

### slack.read_message

```typescript
{
  tool_id: "slack.read_message",
  risk_level: "READ",
  authorized_agents: ["refinement"],
  description: "Read messages from a Slack thread",
  input: {
    channel_id: string,
    thread_ts: string
  },
  output: {
    messages: SlackMessage[]
  }
}
```

---

### github.read_repository_map

```typescript
{
  tool_id: "github.read_repository_map",
  risk_level: "READ",
  authorized_agents: ["engineering"],
  description: "Load the repository map (no code)",
  input: {},
  output: { repository_map: RepositoryMap }
}
```

---

### github.read_file

```typescript
{
  tool_id: "github.read_file",
  risk_level: "READ",
  authorized_agents: ["engineering"],
  description: "Read a specific file from a repository (targeted snippet)",
  input: {
    full_name: string,   // org/repo
    path: string,
    line_start?: number,
    line_end?: number
  },
  output: {
    content: string,
    sha: string
  },
  constraints: "max 150 lines per call"
}
```

---

### github.list_commits

```typescript
{
  tool_id: "github.list_commits",
  risk_level: "READ",
  authorized_agents: ["engineering"],
  description: "List recent commits in a path (summaries only)",
  input: {
    full_name: string,
    path: string,
    since?: string,   // ISO8601
    max_results?: number  // default 20
  },
  output: {
    commits: Array<{ sha, message, author, date, files_changed }>
  }
}
```

---

### github.create_issue

```typescript
{
  tool_id: "github.create_issue",
  risk_level: "WRITE",
  authorized_agents: ["engineering"],
  description: "Create a GitHub issue",
  input: {
    full_name: string,
    title: string,
    body: string,
    labels?: string[],
    assignees?: string[]
  },
  output: {
    issue_number: number,
    url: string
  },
  approval_required_when: "priority === CRITICAL"
}
```

---

### kb.search

```typescript
{
  tool_id: "kb.search",
  risk_level: "READ",
  authorized_agents: ["knowledge", "ticket"],
  description: "Semantic search over the knowledge base",
  input: {
    query: string,
    domain?: Domain,
    top_k?: number   // default 5
  },
  output: {
    articles: Array<{ article_id, title, snippet, relevance_score }>
  }
}
```

---

### ticket.create

```typescript
{
  tool_id: "ticket.create",
  risk_level: "WRITE",
  authorized_agents: ["ticket"],
  description: "Create an IT ticket",
  input: {
    queue: string,
    title: string,
    description: string,
    priority: Priority,
    request_id: string,
    reporter: string
  },
  output: {
    ticket_id: string,
    url: string,
    status: string
  },
  approval_required_when: "priority === CRITICAL"
}
```

---

### email.send (human approval always required)

```typescript
{
  tool_id: "email.send",
  risk_level: "WRITE",
  authorized_agents: ["notification"],
  description: "Send an email (always requires human approval)",
  input: {
    to: string[],
    subject: string,
    body: string,
    cc?: string[]
  },
  output: {
    message_id: string,
    status: "QUEUED | SENT"
  },
  approval_required_when: "always"
}
```

---

### incident.create

```typescript
{
  tool_id: "incident.create",
  risk_level: "WRITE",
  authorized_agents: ["incident"],
  description: "Create an incident record",
  input: {
    classification: string,
    severity: string,
    correlated_request_ids: string[],
    affected_system: string
  },
  output: {
    incident_id: string
  },
  approval_required_when: "classification === MAJOR_INCIDENT"
}
```

---

## Tool Authorization Check (pseudocode)

```
ActionEngine.execute(action: Action, calling_agent: string):
  tool = ToolRegistry.get(action.action_type)
  
  if calling_agent not in tool.authorized_agents:
    throw AuthorizationError
  
  if tool.approval_required_when matches action.parameters:
    if not action.status === 'APPROVED':
      queue_for_human_approval(action)
      return PENDING
  
  result = execute_tool(action)
  append_to_trace(action, result)
  return result
```
