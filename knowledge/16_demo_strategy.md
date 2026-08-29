# 16 — Demo Strategy

**Depends on:** `15_mvp_scope.md`, `03_solution_model.md`, `07_decision_architecture.md`  
**Used by:** all developers (demo preparation), presentation team

---

## Demo Philosophy

- Show a **complete end-to-end flow** — not disconnected features
- Every step is visible in the **Decision Trace dashboard**
- The audience must understand: "an employee sent a Slack message, the system handled everything"
- Prioritize **narrative clarity** over technical depth during the live demo
- Have all scenarios pre-seeded so there is no waiting for LLM responses during the presentation

---

## Pre-Demo Setup

| Item | Responsibility | Notes |
|---|---|---|
| Slack app connected to demo workspace | Dev 1 | Test bot account |
| Demo ERP repository seeded in GitHub | Dev 3 | With realistic invoice module code |
| Repository map seeded with ERP entry | Dev 3 | invoice signals, module paths, assignee |
| KB seeded with Zoom/Slack troubleshooting articles | Dev 4 | Secondary Demo B |
| 2 prior requests seeded in DB (for incident correlation) | Dev 2 | Secondary Demo C |
| Dashboard running, Decision Trace viewer ready | Dev 5 | Visible on second screen |
| Mock IT ticketing system running | Dev 4 | Returns valid ticket IDs |
| Human approval notification configured | Dev 5 | Via Slack DM to demo user |

---

## Primary Demo: Software Bug → GitHub Issue

**Story:** Ana, a finance team member, reports that the ERP system fails when creating invoices.

### Script

```
1. Ana sends Slack message:
   "@triage-bot The ERP system is throwing errors when I try to generate invoices for clients.
    Everyone on the finance team is blocked. This started yesterday afternoon."

2. Bob responds:
   "Hi Ana! To help you faster, one question:
    Are you seeing a specific error message or error code when this happens?"

3. Ana replies:
   "Yes — it shows 'HTTP 500 Internal Server Error' in the browser."

4. [SHOW DASHBOARD]
   Request status: READY_FOR_TRIAGE
   Refinement complete — NormalizedRequest formed

5. Bob (internally — show on dashboard):
   Triage: domain=SOFTWARE, system=ERP, module=invoice, priority=HIGH
   Priority elevated to CRITICAL (multiple users + no workaround + production system)
   Incident check: 2 similar reports found → INCIDENT declared

6. Bob sends to Ana:
   "⚠️ Multiple users are reporting this. An incident has been opened [INC-0042].
    Routing to Engineering now..."

7. [SHOW DASHBOARD — Progressive Retrieval]
   - Repository Map loaded → ERP repository identified
   - Module list: invoices/ directory selected
   - invoice_service.ts snippet loaded
   - Recent commits: commit from yesterday in invoices/
   - Suspect diff loaded

8. Engineering Agent:
   "Root cause hypothesis: Yesterday's commit (abc1234) modified the invoice
    generation function. The change introduced a missing null check on client_tax_id."

9. [SHOW APPROVAL GATE]
   Priority=CRITICAL → Human approval required
   Demo host clicks "Approve" in dashboard

10. GitHub Issue created:
    Title: "[ERP] Invoice generation HTTP 500 — null check missing in invoice_service"
    Assignee: @senior-engineer
    Labels: critical, erp, invoices

11. Ana receives Slack notification:
    "🐛 Reported to Engineering — Issue #47 created in erp-system.
    Assigned to @senior-engineer. Reference: REQ-0123"

12. [SHOW DECISION TRACE TIMELINE]
    All 12 steps visible with timestamps, agents, confidence scores, evidence.
```

**Duration:** ~3 minutes

---

## Secondary Demo A: Hardware Problem → IT Ticket

**Story:** Carlos reports his laptop won't turn on.

### Script (condensed)

```
Carlos: "@triage-bot My laptop screen is completely black, it won't turn on."

Bob: Refinement → is_complete=true (device type known)
     Triage: HARDWARE → Ticket Agent
     Ticket created: IT-Hardware, priority=MEDIUM

Bob to Carlos:
"📋 Created ticket TKT-8821 in IT-Hardware.
 Priority: MEDIUM. Expected response within 8 hours."
```

**Duration:** ~45 seconds

---

## Secondary Demo B: Known Digital Problem → Immediate Resolution

**Story:** Maria can't connect to Zoom.

### Script (condensed)

```
Maria: "@triage-bot Zoom keeps crashing when I try to join a meeting."

Bob: Refinement → is_complete=true
     Triage: DIGITAL → Knowledge Agent
     KB search → article: "Zoom crashing on Windows 11 — update driver"
     Confidence: 0.92

Bob to Maria:
"✅ Found a solution:

Zoom crashing is often caused by an outdated display driver on Windows 11.
Steps:
1. Open Device Manager
2. Update Display Adapters driver
3. Restart and rejoin

Source: IT Knowledge Base — KB-041"
```

**Duration:** ~30 seconds  
**Key message:** *No ticket created, resolved immediately from knowledge base.*

---

## Secondary Demo C: Incident Correlation

**Story:** Three employees independently report the same ERP error within 30 minutes.

### Script (condensed)

```
[Pre-seeded: Pedro and Sofia already reported invoice 500 errors in last hour]

Lucas: "@triage-bot Invoice module is giving an error 500 again."

Bob: Incident Agent
     Finds Pedro's and Sofia's reports
     Similarity score: 0.91
     Classification: INCIDENT

Bob to Lucas:
"⚠️ We've detected that multiple colleagues are reporting the same issue.
 An incident has been opened [INC-0042].
 The Engineering team has been alerted. 
 We'll keep you updated."

[SHOW DASHBOARD — Incident view]
3 correlated requests, severity=CRITICAL, team notified
```

**Duration:** ~45 seconds  
**Key message:** *System detects the pattern before anyone manually escalates.*

---

## Presentation Flow (15 minutes total)

| Segment | Duration | Content |
|---|---|---|
| Problem statement | 2 min | The current reality — no unified entry, incomplete tickets, manual triage |
| Architecture overview | 2 min | Quick system diagram — Slack → Agents → Actions → Trace |
| Primary Demo | 3 min | Full ERP invoice scenario |
| Secondary Demo B | 1 min | KB instant resolution |
| Secondary Demo C | 1 min | Incident correlation |
| Decision Trace walkthrough | 2 min | Show the full audit timeline |
| Architecture differentiators | 2 min | Progressive retrieval, token efficiency, safety gates |
| Q&A / wrap-up | 2 min | |

---

## Fallback Plan

If any live demo component fails:

| Failure | Fallback |
|---|---|
| Slack connection issue | Pre-recorded GIF walkthrough |
| LLM API rate limit | Pre-cached response in mock mode |
| GitHub API unavailable | Seeded response in repository intelligence stub |
| Dashboard not loading | JSON Decision Trace displayed directly |

**All demo scenarios must have pre-recorded backup recordings.**
