# Decision Tree: Security

**Depends on:** `decision-trees/root.md`, `07_decision_architecture.md`, `08_priority_model.md`  
**Used by:** Triage Agent, Incident Agent

---

## Node: SECURITY

```yaml
node_id: security
domain: SECURITY
question: "What type of security event is being reported?"
priority_floor: HIGH  # all security requests start at HIGH minimum

branches:
  - id: security_phishing
    label: PHISHING
    signals: [phishing, suspicious email, fake email, scam, malicious link, suspicious attachment]
    immediate_action: do_not_click_links
    action: incident_agent → security_team_escalation
    priority: HIGH
    requires_human: true

  - id: security_unauthorized_access
    label: UNAUTHORIZED_ACCESS
    signals: [someone else logged in, account compromised, unauthorized login, strange session]
    immediate_action: account_lockdown_recommended
    action: incident_agent → security_team_escalation
    priority: CRITICAL
    requires_human: true

  - id: security_data_breach
    label: DATA_BREACH
    signals: [data leak, data breach, exposed data, confidential sent, wrong recipient]
    action: incident_agent → MAJOR_INCIDENT → security_team_escalation
    priority: CRITICAL
    requires_human: true

  - id: security_malware
    label: MALWARE
    signals: [virus, malware, ransomware, infected, suspicious file, computer acting strange]
    immediate_action: isolate_device_recommended
    action: incident_agent → security_team_escalation
    priority: CRITICAL
    requires_human: true

  - id: security_policy
    label: POLICY_VIOLATION
    signals: [policy violation, compliance, audit, regulatory, GDPR, unauthorized software]
    action: ticket (IT-Security-Compliance)
    priority: MEDIUM
    requires_human: false

fallback:
  label: SECURITY_UNKNOWN
  action: incident_agent → security_team_escalation
  priority: HIGH
  requires_human: true
```

---

## Safety Rule

**All SECURITY domain requests with priority HIGH or CRITICAL bypass the automatic action flow and require human approval before any action is executed.**

This is enforced at the Action Engine level (Invariant I8).

---

## Immediate Response

For CRITICAL security events, the Notification Agent sends an immediate acknowledgment to the employee before any investigation is complete:

```
"🔴 Security concern received. The security team has been alerted. 
Do not take any further action on the suspected issue until contacted. 
Reference: [request_id]"
```
