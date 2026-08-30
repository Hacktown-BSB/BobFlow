<div align="center">

# 🤖 BobFlow

### IBM IT Triage — Multi-Agent Orchestration Platform

**Route every employee request to the right resolution — automatically, transparently, without unnecessary human handoff.**

<br />

[![IBM watsonx](https://img.shields.io/badge/IBM%20watsonx-AI%20Engine-0530AD?style=for-the-badge&logo=ibm&logoColor=white)](https://www.ibm.com/watsonx)
[![Slack](https://img.shields.io/badge/Slack-Interface-4A154B?style=for-the-badge&logo=slack&logoColor=white)](https://slack.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow?style=for-the-badge)](LICENSE)

<br />

[Motivation](#-motivation) • [What It Does](#-what-it-does) • [Architecture](#-architecture) • [Agents](#-agents) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [Team](#-team)

</div>

---

## 📖 Table of Contents

- [💡 Motivation](#-motivation)
- [❓ What It Does](#-what-it-does)
- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🤖 Agents](#-agents)
- [🛠️ Tech Stack](#️-tech-stack)
- [🚀 Installation](#-installation)
- [🔮 What's Next](#-whats-next)
- [👥 Team](#-team)
- [📄 License](#-license)

---

## 💡 Motivation

### The Wall of Friction

Every organization runs on IT. But the path from "something is broken" to "it's fixed" is rarely straight.

A developer notices the ERP system is throwing errors — so they message a colleague on Slack. The IT helpdesk receives the same report via email. A manager opens a ticket on the portal with incomplete context. Three parallel threads describe the same incident with different details, different urgency, and zero coordination.

Meanwhile, the finance team has stopped processing invoices.

This is the **Wall of Friction**: the invisible barrier between a problem being reported and the right people taking the right action with the right context.

### Why It Matters

The gap between technical and non-technical teams costs organizations in four concrete ways:

- **Misrouted requests** — a non-technical employee cannot know whether their issue belongs to IT Support, Engineering, or Security. They send it to whoever they can reach.
- **Duplicate noise** — the same incident spawns 3–5 separate reports, each missing context the others have. Engineers spend time deduplicating before they can even start solving.
- **Invisible severity** — there is no shared vocabulary for priority. "Urgent" means different things to a sales manager and a DevOps engineer.
- **No audit trail** — when a request finally resolves, nobody can reconstruct who decided what, when, and why. Post-mortems are guesswork.

### Our Approach

**BobFlow** collapses all of this into a single conversational entry point on Slack. An employee describes their problem in plain language. BobFlow understands it, classifies it, scores its priority deterministically, routes it to the right specialized agent, and returns a clear answer — with a full, immutable Decision Trace behind every step.

No forms. No routing charts. No manual escalation. Just: describe the problem, get a resolution.

---

## ❓ What It Does

### The BobFlow Experience

1. **💬 Employee sends a Slack message**
   Any natural language description of an IT issue, question, or request — in English or Portuguese.

2. **🔍 Refinement Agent clarifies ambiguity**
   If the request lacks required context (e.g. which system, which user is affected), BobFlow asks up to two targeted questions. No more.

3. **🧠 Triage Agent classifies and scores**
   The request is classified into one of 8 domains and assigned a priority band (CRITICAL → INFORMATIONAL) using a deterministic scoring engine — never a freeform LLM estimate.

4. **🔀 Orchestrator routes to the right agent**
   Based on domain and priority, the Orchestrator state machine selects the appropriate specialist agent.

5. **⚙️ Specialist Agent acts**
   - **Software bug?** → Engineering Agent retrieves code context from GitHub and creates a structured GitHub Issue.
   - **Hardware or access issue?** → Ticket Agent opens an IT ticket in the correct queue.
   - **Question or process?** → Knowledge Agent searches the internal knowledge base and returns an answer.
   - **Multiple concurrent reports?** → Incident Agent correlates them into a single incident record.

6. **📣 Notification Agent reports back**
   The employee receives a plain-language Slack reply: what was decided, what action was taken, and a reference (ticket ID, issue URL, KB article link).

7. **📋 Decision Trace recorded**
   Every decision, every piece of evidence, every agent invocation is appended to an immutable audit log. Nothing is deleted.

---

## ✨ Features

### 🎯 Intelligent Triage

- 8-domain classification (SOFTWARE, HARDWARE, ACCESS, DIGITAL, SECURITY, BUSINESS_PROCESS, QUESTION, UNKNOWN)
- Deterministic priority scoring — no LLM guessing, pure signal-extraction arithmetic
- Duplicate detection and request correlation
- Human approval gates for CRITICAL and HIGH-risk actions

### 🐛 Code Intelligence

- GitHub repository analysis via Graphify code intelligence provider
- Automatic GitHub Issue creation with real symbols, call paths, and impacted files
- Progressive context retrieval — never loads full repositories into a prompt

### 📚 Knowledge Base Answers

- Semantic search over internal KB articles
- Top-5 relevant articles returned with confidence scores
- Escalation recommendation when KB confidence is low

### 🎫 IT Ticket Creation

- Structured ticket creation to domain-appropriate queues (IT-Hardware, IT-Security-Access, IT-General)
- Priority and SLA automatically derived from triage score
- Stub integration ready for Jira / ServiceNow replacement post-MVP

### 🔐 Full Auditability

- Immutable, append-only Decision Trace per request
- Every routing decision backed by named evidence signals
- Human-readable Slack status updates at every lifecycle stage

---

## 🏗️ Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Employee (Slack)                             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │  mention / message
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│               SLACK ADAPTER  (Socket Mode — @slack/bolt)             │
│   Receives events · validates payloads · dispatches to Orchestrator  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR                                 │
│            State Machine · Routing · Decision Trace writer           │
│            Human Approval Gate · Timeout & Escalation               │
└───────┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌──────────────┐
│Refinement│ │  Triage  │ │Engineering│ │Ticket  │ │  Knowledge   │
│  Agent   │ │  Agent   │ │  Agent    │ │ Agent  │ │    Agent     │
│          │ │          │ │           │ │        │ │              │
│Clarifies │ │Classifies│ │GitHub ctx │ │IT queue│ │KB semantic   │
│ambiguity │ │& scores  │ │+ Issue    │ │creation│ │search        │
└──────────┘ └──────────┘ └─────┬─────┘ └────────┘ └──────────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │    CONTEXT LAYER       │
                   │  Graphify · KB Index   │
                   │  Incident Correlator   │
                   └────────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
     ┌─────────────┐    ┌──────────────┐    ┌───────────────┐
     │  GitHub API │    │  IT Ticketing│    │ Knowledge Base│
     │  (Issues)   │    │  (mock/Jira) │    │  (JSON + vec) │
     └─────────────┘    └──────────────┘    └───────────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │   NOTIFICATION AGENT   │
                   │   Plain-language Slack │
                   │   status updates       │
                   └────────────┬───────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │ DATABASE (SQLite/PG)   │
                   │ Requests · Traces      │
                   │ Incidents · Tickets    │
                   └────────────────────────┘
```

### Request Lifecycle (11 States)

```
RECEIVED → NORMALIZING → READY_FOR_TRIAGE → TRIAGING → TRIAGED
    → CONTEXT_RETRIEVAL → AGENT_EXECUTING → ACTION_PENDING
    → ACTION_EXECUTED → VERIFYING → RESOLVED
                                           ↘ ESCALATED
                                           ↘ ABANDONED
                                           ↘ DUPLICATE_SUPPRESSED
```

### Progressive Context Retrieval

BobFlow never loads an entire repository, database, or org chart into a prompt. Context is loaded in tiers — only what is needed for the current decision step:

| Tier | Content | Always Loaded |
|------|---------|--------------|
| GLOBAL | Product Constitution (15 rules, ~500 tokens) | ✅ |
| TASK | Current request + conversation history | ✅ |
| AGENT | Agent system prompt + tool list | Per-agent |
| WORKFLOW | State machine state + route taken | Per-transition |
| DATA | Domain-specific KB articles, code snippets | On demand |
| TOOL | Tool schema for the tool about to be invoked | Just-in-time |

This design minimizes IBM watsonx token consumption per request while ensuring each agent has exactly the context it needs.

### Decision Trace

Every request produces an immutable, append-only audit log. Each entry records:

- **Timestamp** — when the decision was made
- **Agent** — which agent produced the decision
- **Input** — what was evaluated (request text, signals extracted)
- **Evidence** — named signals backing the decision (e.g. `urgency:3`, `users_affected:5`)
- **Output** — the decision result (domain, priority, route, action taken)
- **Authorization** — who approved, if a human gate was triggered

The trace is never modified after creation. It is available to the employee on request.

---

## 🤖 Agents

| Agent | Domains | LLM Usage | Primary Responsibility | Status |
|-------|---------|-----------|----------------------|--------|
| **Refinement** | All | High | Detect ambiguity; generate ≤ 2 targeted clarification questions; normalize request | ✅ Implemented |
| **Triage** | All | Medium | Classify domain; compute deterministic priority score; select route; detect duplicates | ✅ Implemented |
| **Engineering** | SOFTWARE, SECURITY | High | Retrieve GitHub code context via Graphify; compose structured GitHub Issue with real symbols and call paths | ✅ Implemented |
| **Knowledge** | DIGITAL, BUSINESS_PROCESS, QUESTION, UNKNOWN | High | Semantic search over internal KB; return top-5 articles with confidence; recommend escalation when needed | ✅ Implemented (seeded KB) |
| **Ticket** | HARDWARE, ACCESS | Low | Create structured IT ticket in the correct queue with priority and SLA derived from triage | ✅ Implemented (mock) |
| **Incident** | All (correlation) | Low–Medium | Detect temporal + semantic clustering of similar requests; create incident record; trigger escalation | ✅ Implemented |
| **Notification** | All | Low | Send plain-language Slack status updates to the requesting employee at every lifecycle stage | ✅ Implemented |
| **Orchestrator** | All | Minimal | State machine controller; route between agents; enforce human approval gates; write Decision Trace | ✅ Implemented |

### Domain Classification

| Domain | Example Requests |
|--------|-----------------|
| `SOFTWARE` | "ERP invoices failing", "app throws 500 on checkout", "API timeout in production" |
| `HARDWARE` | "laptop won't boot", "monitor has no signal", "office printer offline" |
| `ACCESS` | "can't log in to VPN", "SSO not working for Salesforce", "need access to S3 bucket" |
| `DIGITAL` | "Slack account locked", "need a new Adobe license", "Zoom not syncing calendar" |
| `SECURITY` | "received phishing email", "suspicious login from unknown IP", "credentials may be leaked" |
| `BUSINESS_PROCESS` | "approval workflow is stuck", "invoice not reaching finance", "expense report missing step" |
| `QUESTION` | "how do I set up MFA?", "what is our PTO policy?", "where do I submit expense reports?" |
| `UNKNOWN` | Anything unclassified — routed to best-effort KB lookup + human review |

### Priority Scoring

Priority is computed **deterministically** — never by LLM freeform estimation. Seven signals are extracted from the request text and scored 0–5:

| Signal | Weight | Description |
|--------|--------|-------------|
| `urgency` | ×2 | Temporal and blocking language ("urgent", "team blocked", "company stopped") |
| `users_affected` | ×2 | Scale of impact ("all", "team", "multiple", single user) |
| `customer_impact` | ×3 | External customer involvement ("invoice", "client", "customer") |
| `financial_impact` | ×1 | Financial keywords ("payment", "revenue", "billing") |
| `security_flag` | ×4 | Security signals or SECURITY domain |
| `workaround` | ×1 | Absence of workaround (0 = easy workaround, 5 = no workaround) |
| `criticality` | ×2 | System criticality ("ERP", "SAP", "production", "infrastructure") |

Composite score (max 75) maps to a priority band:

| Score | Priority | Typical SLA |
|-------|----------|-------------|
| 60–75 | `CRITICAL` | Immediate human escalation |
| 40–59 | `HIGH` | < 1 hour |
| 20–39 | `MEDIUM` | < 4 hours |
| 5–19 | `LOW` | < 1 business day |
| 0–4 | `INFORMATIONAL` | Best-effort |

Domain overrides apply floors (never lower priority): SECURITY → floor HIGH; SOFTWARE + production down → floor CRITICAL; ACCESS + C-level blocked → floor HIGH.

---

## 🛠️ Tech Stack

### IBM watsonx — AI Engine

BobFlow is built around **IBM watsonx** as its primary AI engine. The [`LLMClient`](src/llm/client.ts) interface uses the OpenAI-compatible endpoint exposed by watsonx, with IBM-specific authentication:

- `LLM_AUTH_STYLE=apikey` — IBM API key authentication
- `LLM_TEAM_ID` — IBM watsonx team/project header (`X-Team-ID`)
- Drop-in support for any watsonx-hosted model via `LLM_MODEL`

The abstraction layer also supports OpenAI GPT-4o and Azure OpenAI, making the system portable across IBM cloud environments and local development alike.

### Full Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **AI & ML** | IBM watsonx | LLM inference and text embeddings |
| **Interface** | Slack Bolt v5 (Socket Mode) | Employee-facing chat interface |
| **Runtime** | Node.js 18+ / TypeScript 7 | Application engine |
| **Storage** | SQLite 3 (MVP) / PostgreSQL (production) | Request state, Decision Traces, incidents |
| **Code Intelligence** | Graphify | Repository symbol extraction and call-path analysis |
| **Build** | TypeScript compiler (`tsc`) | Type-safe compilation to ESM |
| **Testing** | Node.js built-in test runner | Unit and integration tests with mock providers |

[![IBM watsonx](https://img.shields.io/badge/IBM%20watsonx-Primary%20LLM-0530AD?logo=ibm&logoColor=white)](https://www.ibm.com/watsonx)
[![Slack Bolt](https://img.shields.io/badge/Slack%20Bolt-v5-4A154B?logo=slack&logoColor=white)](https://slack.dev/bolt-js/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)

---

## 🚀 Installation

### Prerequisites

- **Node.js 18+** and **npm**
- A **Slack App** with Socket Mode enabled and the following scopes:
  - Bot token scopes: `app_mentions:read`, `chat:write`, `channels:history`
  - App-level token with `connections:write` scope
- An **IBM watsonx** API key and endpoint URL (or any OpenAI-compatible LLM endpoint)
- **Optional:** Graphify CLI for code intelligence (falls back to mock provider if absent)

### 1. Clone and Install

```bash
git clone https://github.com/Hacktown-BSB/ZovaoDoBob.git
cd ZovaoDoBob
npm install
```

### 2. Configure Environment

Create a `.env` file at the project root (or export these variables directly):

```bash
# ── Slack ─────────────────────────────────────────────────────
# Bot OAuth token (xoxb-...)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# App-level token for Socket Mode (xapp-...)
SLACK_APP_TOKEN=xapp-your-app-token

# Slack user ID of the bot itself (e.g. U0123ABCDEF)
SLACK_BOT_USER_ID=U0123ABCDEF

# Comma-separated Slack user IDs who can approve high-risk actions
TRIAGE_ADMIN_USERS=U1111111111,U2222222222

# ── Database ──────────────────────────────────────────────────
# Path to SQLite database file (created automatically on first run)
DB_PATH=triage.db

# ── IBM watsonx / LLM ─────────────────────────────────────────
# Base URL of the OpenAI-compatible endpoint
LLM_BASE_URL=https://your-watsonx-endpoint/v1

# IBM API key
LLM_API_KEY=your-ibm-api-key

# Authentication style: "apikey" for IBM watsonx, "bearer" for OpenAI
LLM_AUTH_STYLE=apikey

# Model name as listed in your watsonx deployment
LLM_MODEL=ibm/granite-13b-chat-v2

# Embedding model for semantic KB search
LLM_EMBED_MODEL=ibm/slate-125m-english-rtrvr

# IBM watsonx team/project ID (X-Team-ID header)
LLM_TEAM_ID=your-team-id

# ── Agent Modes ───────────────────────────────────────────────
# Set to "mock" to run fully offline without LLM calls (demo/CI mode)
# Set to "llm" to use real IBM watsonx inference
TRIAGE_MODE=mock
REFINEMENT_MODE=mock
ISSUE_MODE=mock

# ── Code Intelligence ─────────────────────────────────────────
# "graphify" uses real Graphify CLI; "mock" uses deterministic test fixtures
CODE_INTELLIGENCE_PROVIDER=mock

# Absolute path to the repository Graphify should analyse
# (only required when CODE_INTELLIGENCE_PROVIDER=graphify)
GRAPHIFY_REPO_PATH=/path/to/your/repo
```

### 3. Build and Run

```bash
# Compile TypeScript
npm run build

# Start the bot
npm start
```

The bot connects to Slack via Socket Mode. No public URL or reverse proxy is required.

### 4. Run Tests

```bash
npm test
```

Tests run entirely in mock mode — no Slack tokens or LLM credentials are needed.

### Running in Demo Mode (No External APIs)

To run a fully offline demo without any IBM watsonx or Slack credentials:

```bash
TRIAGE_MODE=mock \
REFINEMENT_MODE=mock \
ISSUE_MODE=mock \
CODE_INTELLIGENCE_PROVIDER=mock \
SLACK_BOT_TOKEN=xoxb-demo \
SLACK_APP_TOKEN=xapp-demo \
SLACK_BOT_USER_ID=UDEMO \
TRIAGE_ADMIN_USERS=UDEMO \
npm start
```

---

## 🔮 What's Next

BobFlow's MVP covers four end-to-end demo workflows. Post-hackathon priorities:

- [ ] **🎫 Real ticketing integration** — Replace the mock stub with a live Jira or ServiceNow REST API connector
- [ ] **📚 Knowledge Base admin UI** — Web interface to add, edit, and curate KB articles without editing files manually
- [ ] **📊 Analytics dashboard** — Request volume trends, MTTR by domain, SLA breach rate, knowledge gap detection
- [ ] **🔁 Feedback loop** — Automatically promote resolved requests to KB articles when confidence is high
- [ ] **🌍 Multi-language support** — Extend beyond English and Portuguese to all major enterprise languages
- [ ] **📎 Attachment processing** — Accept screenshots and log files alongside text descriptions

---

## 👥 Team

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/TiagoSBittencourt">
        <img src="https://github.com/TiagoSBittencourt.png" width="100px;" alt="Tiago Bittencourt"/>
        <br /><sub><b>Tiago Bittencourt</b></sub>
      </a>
      <br /><span>Scrum Master · ML & Agent Developer</span>
    </td>
    <td align="center">
      <a href="https://github.com/devwallyson">
        <img src="https://github.com/devwallyson.png" width="100px;" alt="Wallyson"/>
        <br /><sub><b>Wallyson</b></sub>
      </a>
      <br /><span>Backend Developer</span>
    </td>
    <td align="center">
      <a href="https://github.com/Bappoz">
        <img src="https://github.com/Bappoz.png" width="100px;" alt="Bappoz"/>
        <br /><sub><b>Bappoz</b></sub>
      </a>
      <br /><span>Agent Developer</span>
    </td>
    <td align="center">
      <a href="https://github.com/ggzin-br">
        <img src="https://github.com/ggzin-br.png" width="100px;" alt="ggzin-br"/>
        <br /><sub><b>ggzin-br</b></sub>
      </a>
      <br /><span>Backend Developer</span>
    </td>
    <td align="center">
      <a href="https://github.com/luanaa2005">
        <img src="https://github.com/luanaa2005.png" width="100px;" alt="Luana"/>
        <br /><sub><b>Luana</b></sub>
      </a>
      <br /><span>Frontend Developer</span>
    </td>
  </tr>
</table>

---

## 📄 License

Distributed under the ISC License. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

Built with ❤️ for the IBM Dev Day Hackathon

</div>
