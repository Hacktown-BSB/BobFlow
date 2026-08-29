# 15 — MVP Scope

**Depends on:** `13_development_plan.md`, `04_agent_architecture.md`, `06_workflow_architecture.md`  
**Used by:** all developers, `16_demo_strategy.md`

---

## Scope Classification

### MUST HAVE — Required for Demo

| Feature | Owner | Notes |
|---|---|---|
| Slack message reception | Dev 1 | Socket Mode |
| Refinement Agent (clarification loop) | Dev 1 | Max 2 rounds |
| Triage Agent (domain classification) | Dev 2 | All 8 domains |
| Priority Scoring Function | Dev 2 | Deterministic |
| Decision Tree evaluation (root + sub-trees) | Dev 2 | All 6 trees |
| Engineering Agent | Dev 3 | Core demo path |
| Repository Map (seeded for demo) | Dev 3 | ERP/invoice scenario |
| Progressive GitHub context retrieval | Dev 3 | Map → module → snippet → commits |
| GitHub Issue creation | Dev 3 | With human approval for CRITICAL |
| Knowledge Agent | Dev 4 | With seeded KB articles |
| KB semantic search (pgvector or in-memory) | Dev 4 | Top-5 articles |
| Ticket Agent | Dev 4 | Mock ticketing system |
| Incident Agent (correlation detection) | Dev 2 | For secondary Demo C |
| Orchestrator state machine | Dev 5 | All workflow paths |
| Action Engine (authorization + approval gate) | Dev 5 | Tool auth enforcement |
| Decision Trace (storage + append-only) | Dev 5 | Full trace per request |
| Notification Agent (Slack messages) | Dev 5 | All message templates |
| Dashboard — Request list | Dev 5 | Status display |
| Dashboard — Decision Trace viewer | Dev 5 | Timeline view |
| LLMClient abstraction (watsonx or GPT-4o) | Dev 5 | With mock for testing |

---

### SHOULD HAVE — Include If Time Allows

| Feature | Owner | Notes |
|---|---|---|
| Incident dashboard view | Dev 5 | Correlated requests |
| SLA tracking and breach alerts | Dev 5 | Timer per priority level |
| Repository map auto-generation from GitHub | Dev 3 | Seeded manually for MVP |
| Duplicate request merging UX in Slack | Dev 1 | Show existing ticket ref |
| Ticket system webhook (bi-directional) | Dev 4 | Status updates from ticket system |
| Multi-channel Slack support | Dev 1 | Single channel for MVP |

---

### COULD HAVE — Post-Hackathon

| Feature | Notes |
|---|---|
| Real IT ticketing system integration (Jira, ServiceNow) | Replace mock stub |
| Knowledge base admin UI (add/edit articles) | Currently manual files |
| Automated post-mortem generation | After incident resolution |
| Self-service password reset integration | Direct Active Directory integration |
| Feedback loop: resolved → KB article creation | Improve KB automatically |
| Multi-language support | English only for MVP |
| Voice/file attachment processing | Text only for MVP |
| Analytics dashboard | Metrics, trends, MTTR |

---

### OUT OF SCOPE — Explicitly Excluded

| Feature | Reason |
|---|---|
| Production deployment (K8s, cloud) | Not required for demo |
| Automatic code deployment | Safety boundary (Invariant) |
| Automatic PR merging | Safety boundary (Invariant) |
| HR data access | Privacy boundary |
| External email without human approval | Safety boundary |
| Custom LLM fine-tuning | Timeline |
| Mobile app | Out of scope |
| SAML/SSO user management | Out of scope |

---

## MVP End-to-End Workflow Coverage

| Workflow | Covered in MVP | Demo |
|---|---|---|
| Software bug → Engineering → GitHub Issue | ✓ | Primary |
| Hardware → IT Ticket | ✓ | Secondary A |
| Digital/Question → Knowledge Base → Answer | ✓ | Secondary B |
| Multiple reports → Incident | ✓ | Secondary C |
| Security → Escalation | Partial (human gate) | Not primary demo |
| Access → IT Ticket | ✓ | Covered by Secondary A path |
| UNKNOWN → Human review | ✓ | Fallback |
