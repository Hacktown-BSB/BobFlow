# Decision Tree: Digital

**Depends on:** `decision-trees/root.md`, `07_decision_architecture.md`  
**Used by:** Triage Agent

---

## Node: DIGITAL

```yaml
node_id: digital
domain: DIGITAL
question: "What type of digital issue is this?"

branches:
  - id: access
    label: ACCESS
    signals: [password, VPN, SSO, MFA, permission, access denied, login, credentials, account locked]
    sub_branches:
      - id: access_password
        signals: [password, forgot, reset, expired]
        action: knowledge_base_lookup → self_service_reset
        priority_floor: MEDIUM

      - id: access_vpn
        signals: [VPN, remote access, tunnel]
        action: knowledge_base_lookup → ticket
        priority_floor: MEDIUM

      - id: access_permissions
        signals: [permission, access denied, role, unauthorized]
        action: ticket (IT-Security-Access)
        priority_floor: MEDIUM
        requires_manager_approval: true

  - id: digital_tool
    label: DIGITAL_TOOL
    signals: [Slack, Teams, Zoom, Gmail, Outlook, OneDrive, SharePoint, SaaS, app, tool, license]
    sub_branches:
      - id: tool_outage
        signals: [down, not loading, unavailable, outage, everyone affected]
        action: incident_check → external_status_check
        priority_floor: HIGH

      - id: tool_account
        signals: [account, login to tool, suspended, deactivated, license]
        action: ticket (IT-Digital-Tools)
        priority_floor: MEDIUM

      - id: tool_config
        signals: [configure, setting, integration, connect, setup]
        action: knowledge_base_lookup → ticket
        priority_floor: LOW

  - id: business_process
    label: BUSINESS_PROCESS
    signals: [process, workflow, approval, stuck, waiting, policy, procedure]
    action: knowledge_base_lookup → ticket (IT-Operations)
    priority_floor: LOW

fallback:
  label: DIGITAL_UNKNOWN
  action: ticket (IT-General)
  priority_floor: LOW
```

---

## Output

- Most paths: **Knowledge Agent** first, then **Ticket Agent** if unresolved
- Access Permissions: **Ticket Agent** directly (requires manager approval context)
- Tool Outage: **Incident Agent** correlation check first
