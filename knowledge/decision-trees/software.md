# Decision Tree: Software

**Depends on:** `decision-trees/root.md`, `07_decision_architecture.md`  
**Used by:** Triage Agent, Engineering Agent

---

## Node: SOFTWARE

```yaml
node_id: software
domain: SOFTWARE
question: "What type of software issue is this?"

branches:
  - id: software_bug
    label: BUG_DEFECT
    signals: [bug, error, exception, crash, broken, not working, wrong result, HTTP 5xx]
    required_fields:
      - error_message_or_code
      - system_name
      - steps_to_reproduce
    action: engineering_agent
    priority_floor: MEDIUM

  - id: software_performance
    label: PERFORMANCE
    signals: [slow, timeout, hanging, unresponsive, taking too long, high latency]
    required_fields:
      - system_name
      - affected_operation
    action: engineering_agent
    priority_floor: MEDIUM

  - id: software_data
    label: DATA_ISSUE
    signals: [wrong data, missing data, data corruption, incorrect value, report wrong]
    required_fields:
      - system_name
      - expected_vs_actual
    action: engineering_agent
    priority_floor: HIGH  # data issues can have financial impact

  - id: software_integration
    label: INTEGRATION
    signals: [API, integration, sync, webhook, external service not responding]
    required_fields:
      - system_name
      - external_service
    action: engineering_agent
    priority_floor: HIGH

fallback:
  label: SOFTWARE_UNKNOWN
  action: engineering_agent (with incomplete_context flag)
  priority_floor: MEDIUM
```

---

## System Identification

After domain=SOFTWARE, Triage attempts system identification:

```
Signals → system_hint → repository_map lookup → repository selected
```

Example mappings (populated per organization):

| Signal | System |
|---|---|
| "invoice", "billing", "payment" | ERP / Finance System |
| "CRM", "customer", "lead" | CRM System |
| "employee", "HR", "payroll" | HRIS |
| "order", "fulfillment" | Order Management |

The repository map (`schemas/repository-map.schema.json`) contains the authoritative signal→repository mapping.

---

## Output

All SOFTWARE paths route to **Engineering Agent** with:
- `domain: SOFTWARE`
- `system` (if identified)
- `module` (if identified)
- `priority` (from Priority Model)
- `incident_check_result` (from Incident Agent, run in parallel for HIGH/CRITICAL)
