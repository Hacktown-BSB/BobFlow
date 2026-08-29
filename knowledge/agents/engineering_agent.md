# Agent Spec: Engineering Agent

**Depends on:** `04_agent_architecture.md`, `11_data_contracts.md`, `12_tool_contracts.md`  
**Used by:** Orchestrator, Developer 3

---

## Identity

| Field | Value |
|---|---|
| ID | `engineering` |
| Version | 1.0.0 |
| Owner | Developer 3 |

---

## System Prompt Template

```
You are the Engineering Agent for a corporate triage platform.

Given a software defect report and retrieved repository context, you must:
1. Identify the most likely root cause based on available evidence.
2. Reference specific files, commits, or PRs that support your analysis.
3. Draft a GitHub Issue with: title, description, steps to reproduce, evidence, and suggested assignee.

RULES:
- Only reference code/commits/PRs that were explicitly retrieved and provided to you.
- Do not guess file paths or function names not in the provided context.
- Do not speculate about causes without evidence.
- Output structured JSON.
- If evidence is insufficient for a root cause, state so clearly.
```

---

## Progressive Context Retrieval Steps

```
Step 1: Load repository map (names, owners, descriptions — no code)
        → Select candidate repository by system/module name
        ↓
Step 2: Load module-level file list for selected repository
        → Identify 1–3 most relevant files
        ↓
Step 3: Load targeted snippets (≤ 100 lines each) of relevant files
        ↓
Step 4: Load recent commits in relevant module (last 30 days, summaries only)
        → Identify commits touching relevant files
        ↓
Step 5: Load full diff of 1–2 most suspicious commits (≤ 200 lines)
```

Stop at earliest step where sufficient evidence is found.

---

## Input

```json
{
  "normalized_request": "NormalizedRequest",
  "triage_result": "TriageResult",
  "repository_context": {
    "repository": "string",
    "relevant_files": ["path/to/file.ext"],
    "snippets": [{ "file": "string", "lines": "string", "content": "string" }],
    "recent_commits": [{ "sha": "string", "message": "string", "date": "string", "files_changed": ["string"] }],
    "suspect_diff": "string | null"
  }
}
```

---

## Output: EngineeringResult

```json
{
  "request_id": "uuid",
  "repository": "string",
  "analysis": "string",
  "root_cause_hypothesis": "string | null",
  "confidence": 0.0,
  "evidence": ["string"],
  "github_issue": {
    "title": "string",
    "body": "string",
    "labels": ["string"],
    "assignees": ["github_username"],
    "milestone": "string | null"
  },
  "requires_human_approval": false
}
```

---

## GitHub Issue Creation Policy

| Priority | Requires Human Approval |
|---|---|
| LOW | No |
| MEDIUM | No |
| HIGH | No (auto-create, notify engineer) |
| CRITICAL | YES — human confirms before creation |

---

## Failure Modes

| Failure | Handling |
|---|---|
| Repository not found in map | Set repository=null, requires_human=true |
| Insufficient evidence (confidence < 0.5) | Create issue with "needs investigation" label |
| GitHub API unavailable | Queue issue draft; retry with exponential backoff |
| No clear assignee | Leave assignees=[], add "needs-triage" label |
