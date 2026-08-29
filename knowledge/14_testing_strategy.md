# 14 — Testing Strategy

**Depends on:** `13_development_plan.md`, `11_data_contracts.md`, `04_agent_architecture.md`  
**Used by:** all developers

---

## Priority

For the hackathon, tests are prioritized in this order:

1. **End-to-end tests** for the primary and secondary demo scenarios (must pass)
2. **Unit tests** for deterministic logic (Priority Scoring, duplicate detection thresholds)
3. **Integration tests** for agent → Orchestrator communication
4. **Contract tests** for data schemas
5. **Mock LLM tests** for agent prompt behavior

---

## Test Architecture

```
tests/
├── e2e/
│   ├── primary-demo.test.ts         # Full ERP invoice bug scenario
│   ├── secondary-a.test.ts          # Hardware ticket scenario
│   ├── secondary-b.test.ts          # KB resolution scenario
│   └── secondary-c.test.ts          # Incident correlation scenario
├── unit/
│   ├── priority-scoring.test.ts
│   ├── similarity.test.ts
│   ├── decision-tree-router.test.ts
│   └── action-engine-auth.test.ts
├── integration/
│   ├── refinement-agent.test.ts
│   ├── triage-agent.test.ts
│   ├── knowledge-agent.test.ts
│   ├── engineering-agent.test.ts
│   ├── incident-agent.test.ts
│   └── ticket-agent.test.ts
├── contract/
│   ├── request-schema.test.ts
│   ├── decision-trace-schema.test.ts
│   └── action-schema.test.ts
└── fixtures/
    ├── requests/                    # Sample NormalizedRequests
    ├── triage-results/              # Sample TriageResults
    └── repository-context/          # Sample repo context for Engineering Agent
```

---

## Test Cases by Area

### Refinement

| Case | Input | Expected |
|---|---|---|
| Complete software request | "The invoice module throws 500 errors" | is_complete=true, domain_hint=SOFTWARE |
| Incomplete request | "Something is broken" | is_complete=false, clarification_question set |
| Hardware request | "My laptop won't turn on" | is_complete=true (device type present), domain_hint=HARDWARE |
| After 2 clarification rounds | Still vague | is_complete=false, proceeds anyway |
| Security report | "I got a suspicious email with a link" | is_complete=true, domain_hint=SECURITY |

### Classification (Triage)

| Case | Input | Expected domain | Min confidence |
|---|---|---|---|
| HTTP 500 error in ERP | "invoice module keeps throwing 500" | SOFTWARE | 0.85 |
| Laptop broken | "my laptop screen is black" | HARDWARE | 0.90 |
| Password reset | "forgot my VPN password" | ACCESS | 0.88 |
| Zoom not working | "Zoom keeps crashing for everyone" | DIGITAL | 0.80 |
| Phishing email | "I received a suspicious link" | SECURITY | 0.92 |
| Ambiguous | "things are slow" | UNKNOWN or SOFTWARE/MEDIUM | < 0.65 |

### Routing

| Domain + System | Expected Agent |
|---|---|
| SOFTWARE + ERP | Engineering Agent |
| DIGITAL + Zoom | Knowledge Agent |
| HARDWARE | Ticket Agent |
| ACCESS | Ticket Agent |
| SECURITY | Incident Agent → escalation |
| UNKNOWN | Human review |

### Priority Scoring

| Inputs | Expected Priority |
|---|---|
| Security flag=5, users=5, no workaround | CRITICAL |
| Users=2, workaround=easy, no customer impact | LOW |
| Production system down, customers affected | CRITICAL |
| Single user, minor display issue | LOW |
| Multiple users, major feature broken, no workaround | HIGH |

### Duplicate Detection

| Scenario | Expected |
|---|---|
| Same user, same message within 5 min | DUPLICATE |
| 3 users report invoice 500 within 1 hour | INCIDENT |
| 2 users report different bugs in same system | RELATED |
| 5 users + customer impact | MAJOR_INCIDENT |
| Unrelated messages in same time window | NONE |

### GitHub Retrieval

| Input | Expected |
|---|---|
| system=ERP, module=invoice | Repository identified from map |
| Repository identified | Module file list loaded (not full repo) |
| Suspect commit found | Only that commit's diff loaded |
| Token budget tracked | Total context ≤ 4,000 tokens |

### Issue Generation

| Input | Expected |
|---|---|
| Engineering Agent with evidence | Issue title references error + system |
| Priority=CRITICAL | requires_human_approval=true |
| No repository match | Issue not created, human escalation |
| Assignee from repository map | Correct GitHub username in assignee |

### Ticket Generation

| Input | Expected |
|---|---|
| Domain=HARDWARE | Queue = IT-Hardware |
| Domain=ACCESS | Queue = IT-Security-Access |
| Priority=CRITICAL | requires_human=true |
| Ticketing system unavailable | Status=QUEUED, retry scheduled |

### Tool Authorization (Action Engine)

| Scenario | Expected |
|---|---|
| Refinement Agent calls github.create_issue | AuthorizationError thrown |
| Engineering Agent calls ticket.create | AuthorizationError thrown |
| Notification Agent calls email.send (no approval) | Action blocked, queued for approval |
| Engineering Agent calls github.read_file | Allowed |
| Decision Trace append after action | Trace updated correctly |

### Decision Trace

| Scenario | Expected |
|---|---|
| Request completed | All states recorded in trace |
| Attempt to modify trace step | Error — trace is append-only |
| Agent message without trace_step_id | Rejected |
| Dashboard loads trace | All steps visible with timestamps |

### Failure Handling

| Failure | Expected |
|---|---|
| LLM timeout during Triage | domain=UNKNOWN, requires_human=true |
| GitHub API unavailable | Issue queued, employee notified |
| Clarification not answered (30 min) | Proceed with partial info |
| CRITICAL security event | Immediate notification sent, human gated |

---

## End-to-End: Primary Demo Test

```
Input: "The ERP system is generating 500 errors when creating invoices for clients. Started yesterday afternoon. All finance team is blocked."

Expected trace:
1. Received → Slack Adapter
2. Normalizing → Refinement (is_complete=true after analysis)
3. Triaging → domain=SOFTWARE, system=ERP, module=invoice, priority=HIGH
4. Incident check → finds 2 other similar reports → INCIDENT declared
5. Priority elevated to CRITICAL
6. Engineering Agent activated
7. Repository map loaded → ERP repository identified
8. Module file list loaded → invoices/
9. File snippet loaded → invoice_service.ts
10. Recent commits loaded → commit from yesterday found
11. Engineering Agent produces analysis + GitHub Issue draft
12. Action Engine checks: priority=CRITICAL → human approval required
13. Human approves → GitHub Issue created
14. Notification sent to employee with issue reference
15. Decision Trace recorded (all 14 steps)
```

All 15 steps must be verifiable in the Decision Trace.
