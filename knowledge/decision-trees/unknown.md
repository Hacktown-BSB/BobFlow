# Decision Tree: Unknown

**Depends on:** `decision-trees/root.md`, `07_decision_architecture.md`  
**Used by:** Triage Agent, Orchestrator

---

## Node: UNKNOWN

Triggered when:
- Triage confidence < 0.6
- No signal matches from root decision tree
- Request is too vague to classify even after 2 clarification rounds

---

## Handling Strategy

```
UNKNOWN classification
        ↓
Was clarification attempted? (clarification_round >= 1)
        │
       YES → Route to human review
       NO  → Return to Refinement Agent for one more targeted clarification
                    ↓
               Still UNKNOWN after clarification
                    ↓
               Route to human review
```

---

## Human Review Routing

```yaml
node_id: unknown
action: human_review
queue: IT-General
priority_floor: MEDIUM
message_to_employee: |
  "I wasn't able to automatically categorize your request. 
  A support agent will review it and follow up with you shortly. 
  Reference: [request_id]"
```

---

## Decision Trace for UNKNOWN

When a request resolves as UNKNOWN, the Decision Trace records:
- All classification attempts
- Which signals were found (if any)
- Confidence scores at each attempt
- Reason for human escalation

This trace is used to improve the classification model over time (post-MVP).
