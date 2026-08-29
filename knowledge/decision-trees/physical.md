# Decision Tree: Physical (Hardware)

**Depends on:** `decision-trees/root.md`, `07_decision_architecture.md`  
**Used by:** Triage Agent

---

## Node: PHYSICAL

```yaml
node_id: physical
domain: HARDWARE
question: "What type of hardware is affected?"

branches:
  - id: physical_computing
    label: COMPUTING_DEVICE
    signals: [laptop, desktop, PC, MacBook, computer]
    sub_questions:
      - "Is the device completely non-functional or partially functional?"
      - "Is this the employee's primary work device?"
    queue: IT-Hardware
    priority_floor: MEDIUM

  - id: physical_peripheral
    label: PERIPHERAL
    signals: [keyboard, mouse, monitor, screen, webcam, headset, printer, scanner]
    queue: IT-Hardware
    priority_floor: LOW

  - id: physical_network
    label: NETWORK_HARDWARE
    signals: [ethernet, network port, router, switch, wifi, access point]
    queue: IT-Hardware
    priority_floor: MEDIUM

  - id: physical_mobile
    label: MOBILE_DEVICE
    signals: [phone, mobile, tablet, iPad]
    queue: IT-Hardware
    priority_floor: LOW

  - id: physical_facilities
    label: FACILITIES
    signals: [badge, door access, office, desk, chair, facilities]
    queue: Facilities
    priority_floor: LOW

fallback:
  label: PHYSICAL_UNKNOWN
  queue: IT-Hardware
  priority_floor: LOW
```

---

## Output

After physical classification, route to **Ticket Agent** with:
- `queue` from matched branch
- `priority` from Priority Model (floor from branch)
- No GitHub, no Knowledge Base required

---

## Required Request Fields

| Field | Required | Fallback |
|---|---|---|
| Device type | YES | "unknown device" |
| Asset tag | NO | omit |
| Problem description | YES | use raw message |
| Location | NO | omit |
