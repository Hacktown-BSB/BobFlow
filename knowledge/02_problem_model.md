# 02 — Problem Model

**Depends on:** `00_project_context.md`  
**Used by:** `03_solution_model.md`, `01_product_constitution.md`, `16_demo_strategy.md`

---

## Actors

| Actor | Role | System Interaction |
|---|---|---|
| Employee | Originates requests | Slack, email |
| IT Support | Handles hardware, access, digital tools | Ticketing system |
| Software Engineer | Resolves software defects and infrastructure issues | GitHub, deployment tools |
| Engineering Manager | Prioritizes and assigns technical work | GitHub, project management |
| Security Team | Responds to threats and policy violations | SIEM, ticketing |
| Department Manager | Needs visibility into team-impacting issues | Dashboards, email |
| System Administrator | Manages infrastructure, permissions, integrations | Admin consoles |
| HR / Facilities | Handles physical and organizational requests | Internal systems |

---

## Current Workflow

```
Employee has a problem
      ↓
Searches internally (often fails)
      ↓
Asks a colleague (interruption)
      ↓ or
Sends email to IT / Engineering / HR (wrong team)
      ↓ or
Opens a ticket with incomplete information
      ↓
Ticket is routed manually (takes hours/days)
      ↓
Support agent reads ticket, asks for more information
      ↓
Back-and-forth via email (days of delay)
      ↓
Eventually routed to the correct team
      ↓
Resolution (if not abandoned)
```

---

## Pain Points by Actor

### Employee
- Does not know which team to contact
- Does not know the correct level of detail to provide
- Receives no status updates between submission and resolution
- Searches and finds outdated or irrelevant knowledge-base articles
- Asks colleagues, creating interruptions
- Gives up on low-priority issues and works around them silently

### IT Support
- Receives tickets with missing information (no error message, no steps to reproduce)
- Spends significant time asking clarifying questions
- Manually triages and routes many tickets to the wrong team initially
- Receives duplicate reports of the same incident as separate tickets
- Has no automated correlation of related requests
- Lacks visibility into which employees are blocked by the same issue

### Software Engineering
- Receives bug reports with no reproduction steps, no logs, no error codes
- Cannot distinguish between configuration issues and code defects
- No automatic identification of the relevant repository or module
- Receives requests better suited for IT (e.g., access issues routed as bugs)
- Loses time context-switching from development to support investigation

### Engineering Manager
- Lacks a unified view of open issues across teams
- Cannot easily identify patterns (recurring bug in same module)
- Relies on manual status updates from engineers
- Cannot measure time-to-triage or time-to-resolution at scale

### Security Team
- Security concerns arrive mixed with regular support requests
- Delay between incident report and security team awareness
- No automated escalation for potential security events
- Difficulty correlating multiple low-severity reports into a potential threat

### Department Manager
- No visibility into how many requests their team has open
- Cannot measure business impact of unresolved issues
- No SLA transparency

---

## Business Impact

| Impact | Description |
|---|---|
| **Wasted time** | Employees spend 20–40 min per request finding the right channel |
| **Context switching** | Engineers interrupted multiple times per day for support queries |
| **Duplicate work** | Same issue diagnosed multiple times by different support agents |
| **Delayed incidents** | Critical incidents discovered hours after first reports |
| **Poor prioritization** | Critical and trivial requests treated with equal urgency |
| **Communication fragmentation** | Status lives in email threads, Slack DMs, ticket comments — no single view |
| **Invisible workarounds** | Employees work around problems silently; systemic issues go undetected |
| **Knowledge decay** | Solutions are not captured; same problems are solved repeatedly |

---

## Root Causes

These are underlying causes, not symptoms:

| # | Root Cause |
|---|---|
| RC1 | No unified, low-friction entry point for all request types |
| RC2 | No automatic normalization of freeform natural-language requests |
| RC3 | No structured classification to route requests to the right team |
| RC4 | No context enrichment before a request reaches a support agent |
| RC5 | No correlation logic to detect when multiple requests describe the same problem |
| RC6 | No progressive disclosure of context — all or nothing |
| RC7 | No machine-readable priority model — urgency is inferred subjectively |
| RC8 | No feedback loop from resolution back to knowledge base |
| RC9 | No traceability of why a decision was made |
| RC10 | Support workflows are human-only; no AI assistance in the resolution path |
