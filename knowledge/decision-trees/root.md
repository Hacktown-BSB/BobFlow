# Decision Tree: Root

**Depends on:** `07_decision_architecture.md`  
**Used by:** Triage Agent, Orchestrator

---

## Purpose

The root decision node is the first classification step. It maps a normalized request to one of the primary domains. Sub-trees handle deeper routing.

---

## Node: ROOT

```yaml
node_id: root
question: "What category best describes this request?"
required_evidence:
  - "normalized_message"
  - "intent"

branches:
  - id: physical
    label: HARDWARE
    signals:
      - laptop | computer | PC | keyboard | mouse | monitor | screen | printer
      - headset | webcam | cable | charger | badge | desk phone | office equipment
      - network port | ethernet | wifi adapter
    next: decision-trees/physical.md

  - id: access
    label: ACCESS
    signals:
      - password | login | VPN | permission | access denied | locked out
      - SSO | SAML | MFA | two-factor | account suspended | provisioning
      - can't log in | no access | unauthorized | credentials
    next: decision-trees/digital.md#access

  - id: digital
    label: DIGITAL
    signals:
      - Slack | Teams | Zoom | Gmail | Outlook | OneDrive | SharePoint
      - SaaS | cloud tool | license | subscription | account disabled
      - application not loading | browser extension | configuration
    next: decision-trees/digital.md

  - id: software
    label: SOFTWARE
    signals:
      - error | exception | crash | bug | HTTP 500 | HTTP 4xx | stack trace
      - not working | broken | wrong result | data missing | slow | timeout
      - API | database | query | invoice | report | module | service
    next: decision-trees/software.md

  - id: security
    label: SECURITY
    signals:
      - phishing | suspicious email | ransomware | breach | hacked
      - unauthorized access | data leak | malware | virus | anomaly
      - someone else logged in | strange activity
    next: decision-trees/security.md

  - id: business_process
    label: BUSINESS_PROCESS
    signals:
      - process | workflow | approval | policy | how does | procedure
      - missing step | stuck | waiting for approval | need authorization
    next: decision-trees/digital.md#business_process

  - id: question
    label: QUESTION
    signals:
      - how to | how do I | where can I | what is | documentation
      - guide | tutorial | policy | FAQ
    next: knowledge_agent

fallback:
  node_id: unknown
  label: UNKNOWN
  next: decision-trees/unknown.md
```

---

## Signal Weighting

Each matched signal adds to classification confidence (see `07_decision_architecture.md`).

Multiple signals from the same branch: confidence boost capped at 0.3 per branch.
Signals from two different branches: default to higher-evidence branch; note ambiguity in `evidence`.
