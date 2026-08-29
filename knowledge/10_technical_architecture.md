# 10 — Technical Architecture

**Depends on:** `00_project_context.md`, `04_agent_architecture.md`, `06_workflow_architecture.md`  
**Used by:** all developers, `13_development_plan.md`

---

## Architecture Decision: Modular Monolith

For the MVP, we use a **modular monolith** deployed as a single Node.js / Python application. Rationale:

| Option | Decision |
|---|---|
| Microservices | REJECTED — unnecessary operational complexity for hackathon |
| Event-driven (Kafka/RabbitMQ) | REJECTED — adds infrastructure without MVP benefit |
| Modular monolith | **SELECTED** — low coupling, fast development, simple deployment |
| Serverless functions | CONSIDERED — viable for Slack adapter only |

Modules are structured for easy extraction into microservices post-hackathon.

---

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                    SLACK (external)                      │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  SLACK ADAPTER                          │
│  - Receive events (Events API / Socket Mode)            │
│  - Validate signatures                                  │
│  - Dispatch to Orchestrator                             │
│  - Send messages back                                   │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    API / BACKEND                         │
│  - REST endpoints for dashboard & integrations          │
│  - Authentication (API keys for MVP)                    │
│  - Request queue (in-memory for MVP, Redis post-MVP)    │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR                          │
│  - Request state machine                               │
│  - Agent routing                                        │
│  - Decision Trace management                            │
│  - Human approval gate                                  │
│  - Timeout management                                   │
└────┬──────┬──────┬──────┬──────┬──────┬────────────────┘
     ↓      ↓      ↓      ↓      ↓      ↓
┌─────────────────────────────────────────────────────────┐
│                   AGENT LAYER                           │
│  Refinement | Triage | Knowledge | Engineering          │
│  Incident | Ticket | Notification                       │
│  (each agent = module with system prompt + tool list)   │
└────┬──────┬──────┬──────┬──────┬──────┬────────────────┘
     ↓      ↓      ↓      ↓      ↓      ↓
┌─────────────────────────────────────────────────────────┐
│                  CONTEXT LAYER                          │
│  - Knowledge Retrieval (vector search + KB)             │
│  - Repository Intelligence (GitHub API + map)           │
│  - Incident Correlation (similarity + temporal)         │
└────┬──────┬──────┬──────────────────────────────────────┘
     ↓      ↓      ↓
┌─────────────────────────────────────────────────────────┐
│                  ACTION ENGINE                          │
│  - Tool authorization validation                        │
│  - Human approval gates                                 │
│  - Execution of external API calls                      │
│  - Result verification                                  │
└────┬──────┬──────┬──────────────────────────────────────┘
     ↓      ↓      ↓
┌────────┐ ┌─────┐ ┌──────┐ ┌───────┐ ┌──────────────┐
│ GitHub │ │ KB  │ │Ticket│ │ Email │ │ Slack (send) │
│  API   │ │ DB  │ │  API │ │  API  │ │              │
└────────┘ └─────┘ └──────┘ └───────┘ └──────────────┘
     ↓
┌─────────────────────────────────────────────────────────┐
│                    DATABASE                             │
│  - Request records                                      │
│  - Decision Traces (append-only)                        │
│  - Incident records                                     │
│  - Agent manifests                                      │
│  - MVP: SQLite / PostgreSQL                             │
└─────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────┐
│                    DASHBOARD                            │
│  - Request list + status                               │
│  - Decision Trace viewer                                │
│  - Incident view                                        │
│  - MVP: simple React / Next.js SPA                     │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Component | MVP Technology | Rationale |
|---|---|---|
| Runtime | Node.js (TypeScript) | Slack Bolt SDK is excellent; team familiarity |
| LLM | IBM watsonx / GPT-4o (configurable) | Hackathon requirement; abstract behind interface |
| Slack | Slack Bolt for JS (Socket Mode) | No public URL required for hackathon |
| Database | PostgreSQL (or SQLite for local demo) | Simple, relational, Decision Trace is append-only |
| Vector Store | pgvector extension or in-memory (MVP) | Avoids separate infrastructure |
| Knowledge Base | JSON/Markdown files + vector index | Simple for MVP; queryable |
| GitHub | Octokit REST API | Official SDK |
| Ticketing | Mock REST stub | Real integration post-MVP |
| Email | Nodemailer (SMTP) | Simple; requires human approval |
| Dashboard | Next.js (React) | Fast to build, SSR |
| LLM Client | Abstract `LLMClient` interface | Swap watsonx ↔ OpenAI without rewriting agents |

---

## LLM Abstraction Interface

```typescript
interface LLMClient {
  complete(prompt: Prompt): Promise<LLMResponse>;
  embed(text: string): Promise<number[]>;
}
```

All agents use `LLMClient` — never call provider SDKs directly. This enables testing with mock responses.

---

## Repository Structure

```
/
├── src/
│   ├── slack/           # Slack adapter (Dev 1)
│   ├── agents/          # Agent implementations (Dev 1-4)
│   ├── orchestrator/    # State machine + routing (Dev 5)
│   ├── context/         # Knowledge, GitHub, Incident retrieval (Dev 3, 4)
│   ├── engine/          # Action Engine + tool execution (Dev 5)
│   ├── db/              # Database models + Decision Trace (Dev 5)
│   └── api/             # REST API + dashboard backend (Dev 5)
├── dashboard/           # Next.js dashboard (Dev 5)
├── knowledge/           # This knowledge architecture
├── tests/
└── docs/
```

---

## Infrastructure for Demo

- Single server / local machine
- PostgreSQL (or SQLite for local)
- Slack app in test workspace
- GitHub repository (real or test)
- No Kubernetes, no queues, no cloud deployment required for MVP demo
