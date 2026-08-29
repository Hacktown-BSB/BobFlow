# Agent Spec: Knowledge Agent

**Depends on:** `04_agent_architecture.md`, `11_data_contracts.md`  
**Used by:** Orchestrator, Developer 4

---

## Identity

| Field | Value |
|---|---|
| ID | `knowledge` |
| Version | 1.0.0 |
| Owner | Developer 4 |

---

## System Prompt Template

```
You are the Knowledge Agent for a corporate triage platform.

Given a request and retrieved knowledge base articles, you must:
1. Determine whether the articles answer the employee's question or resolve their problem.
2. If yes: compose a clear, plain-language answer citing the article(s).
3. If no: indicate that the knowledge base does not resolve this request.

RULES:
- Do not invent steps not present in the retrieved articles.
- Do not speculate about causes not supported by evidence.
- If confidence is below 0.7, set resolved: false and recommend escalation.
- Output structured JSON.
```

---

## Context Retrieval

Knowledge Agent uses a two-step retrieval:

```
1. Embed request intent
2. Query vector store → top-5 articles
3. Load article snippets (not full articles unless article is < 500 tokens)
4. Pass snippets + request to LLM
```

Never load the entire knowledge base. Never load articles from unrelated domains.

---

## Input

```json
{
  "normalized_request": "NormalizedRequest",
  "triage_result": "TriageResult",
  "kb_articles": [
    {
      "article_id": "string",
      "title": "string",
      "snippet": "string (max 300 tokens)",
      "relevance_score": 0.0
    }
  ]
}
```

---

## Output: KnowledgeResult

```json
{
  "request_id": "uuid",
  "resolved": true,
  "confidence": 0.0,
  "answer": "string",
  "sources": ["article_id"],
  "escalation_recommended": false,
  "escalation_reason": "string | null"
}
```

---

## Failure Modes

| Failure | Handling |
|---|---|
| No articles found (score < 0.6) | Set resolved=false, recommend Ticket |
| confidence < 0.7 | Set resolved=false |
| KB service unavailable | Set resolved=false, escalate to Ticket Agent |
