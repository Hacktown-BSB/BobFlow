# 07 — Decision Architecture

**Depends on:** `05_agent_registry.md`, `08_priority_model.md`  
**Used by:** Triage Agent, Orchestrator, `decision-trees/*`, `14_testing_strategy.md`

---

## Decision Tree Structure

Decisions are hierarchical. Each level narrows the routing.

```
ROOT
├── PHYSICAL (Hardware)
├── DIGITAL
│   ├── ACCESS
│   ├── DIGITAL_TOOL
│   └── BUSINESS_PROCESS
├── SOFTWARE
│   ├── BUG / DEFECT
│   ├── PERFORMANCE
│   └── DATA_ISSUE
├── SECURITY
│   ├── PHISHING
│   ├── UNAUTHORIZED_ACCESS
│   ├── DATA_BREACH
│   └── POLICY_VIOLATION
└── UNKNOWN
    └── HUMAN_REVIEW
```

---

## Decision Node Schema

Every node in the decision tree follows this structure:

```yaml
node_id: string
question: "What type of problem is being reported?"
domain: SOFTWARE | DIGITAL | HARDWARE | ACCESS | SECURITY | BUSINESS_PROCESS | QUESTION | UNKNOWN
required_evidence:
  - "error message OR system name"
answers:
  - match: "error / crash / bug / exception / 500"
    next_node: software
    confidence_boost: +0.15
  - match: "laptop / printer / keyboard / monitor / cable"
    next_node: physical
  - match: "password / login / VPN / permission / access denied"
    next_node: access
fallback:
  node_id: unknown
  action: human_review
```

---

## Root Decision Node

See `decision-trees/root.md` for the full evaluated root.

Key classification signals:

| Signal | Domain |
|---|---|
| HTTP error codes, stack traces, exceptions, crashes | SOFTWARE |
| SaaS tool, Slack, Teams, email, cloud service | DIGITAL |
| Laptop, PC, printer, phone, badge, building access | HARDWARE |
| Password, VPN, permissions, accounts, SSO | ACCESS |
| Phishing, breach, unauthorized, ransomware, vulnerability | SECURITY |
| Process, approval flow, workflow, policy question | BUSINESS_PROCESS |
| How to, guide, documentation, policy | QUESTION |
| None of the above | UNKNOWN |

---

## Confidence Scoring

Classification confidence is computed as:

```
base_confidence = 0.5

for each matched_signal in evidence:
    base_confidence += signal.weight

if system_identified:
    base_confidence += 0.1

if module_identified:
    base_confidence += 0.05

confidence = min(base_confidence, 1.0)
```

Threshold: confidence < 0.6 → domain = UNKNOWN, requires_human = true

---

## Decision Trace Schema

Each decision step:

```json
{
  "step_id": "uuid",
  "timestamp": "ISO8601",
  "agent": "orchestrator | refinement | triage | ...",
  "state_from": "RECEIVED",
  "state_to": "NORMALIZING",
  "decision": "string",
  "confidence": 0.0,
  "evidence": ["string"],
  "context_source": "slack_message | knowledge_base | github | incident_db",
  "next_action": "string",
  "result": "string | null"
}
```

The full trace is an ordered array of these steps, referenced by `request_id`.

**The trace is append-only. No step may be modified after creation (Invariant I1).**
