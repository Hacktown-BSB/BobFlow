# Documentation Plan — BobFlow

## Top-Level Overview

**Goal:** Replace the existing `README.md` with a complete, hackathon-submission-grade document for **BobFlow — IBM IT Triage Multi-Agent Orchestration Platform**.

**Scope:**
- Single file: `README.md` at workspace root (current Bob setup guide is already preserved in `SETUP.md` — no migration needed)
- Written in English
- Structured to score well across all four IBM judging criteria
- Follows Mural-UnB visual style (shields badges, team table, clear sections) adapted for enterprise/IBM context
- Features IBM watsonx as the primary AI engine prominently throughout
- Includes full project narrative, multi-agent architecture, AND complete setup/run instructions
- Architecture diagram uses ASCII in a fenced code block (renders on GitHub)

**Non-goals:**
- Changes to any source code
- New documentation files beyond README.md
- Translation (English only)

---

## Sub-Tasks

---

### Sub-Task 1 — Write the README Header and Badges Section

**Intent:** Create the visual "first impression" — project title, tagline, IBM watsonx badge, and all shield badges aligned with the Mural-UnB reference style.

**Expected Outcomes:**
- `README.md` opens with a centered `<div>` block containing the project title and tagline
- IBM watsonx badge is displayed prominently alongside Slack, TypeScript, and Node.js badges
- A navigation bar links to all major sections via anchor tags
- A horizontal rule separates the header from body content

**Todo List:**
1. Write the `<div align="center">` block with:
   - H1 title: "IBM IT Triage — Multi-Agent Orchestration Platform"
   - Tagline: "Route every employee request to the right resolution — automatically, transparently, without unnecessary human handoff"
   - IBM watsonx badge (blue), Slack badge, TypeScript badge, Node.js badge, License badge
   - Navigation links: Motivation • What It Does • Architecture • Agents • Installation • Team
2. Add a horizontal rule
3. Add a Table of Contents section with all anchors

**Relevant Context:**
- Reference style: user-provided Mural-UnB README (shields.io badge pattern)
- Product name: **BobFlow**
- IBM watsonx is the primary LLM — `LLM_AUTH_STYLE=apikey`, `LLM_TEAM_ID` header in `src/llm/client.ts`

**Status:** [x] done

---

### Sub-Task 2 — Write the Motivation and Problem Statement Section

**Intent:** Provide the compelling narrative that justifies why this tool was built, anchored in the core friction between technical and non-technical teams. This is the heart of the hackathon submission — it must be emotionally resonant and evidence-grounded.

**Expected Outcomes:**
- A "The Problem" section that vividly describes IT request chaos in enterprise settings
- A "Why It Matters" section quantifying the friction (scattered channels, duplicate reports, no ownership)
- A "Our Approach" section briefly previewing the solution
- Satisfies the **Effectiveness and Efficiency** criterion: addresses a high-priority, relevant issue

**Todo List:**
1. Write "The Problem" subsection describing the daily reality: employees use Slack, email, Teams, verbal requests — creating duplicate tickets, unclear ownership, and resolution delays
2. Write "Why It Matters" with 3–4 bullet points: productivity lost to context switching, engineers interrupted by misrouted tickets, non-technical staff unable to gauge severity, no audit trail for decisions
3. Write "Our Approach" paragraph: one Slack entry point, AI-driven classification, zero manual routing
4. Ensure language bridges technical and non-technical audiences (no jargon in this section)

**Relevant Context:**
- `knowledge/00_project_context.md`: "Core Problem" and "One-Line Mission" sections
- `knowledge/01_product_constitution.md`: Principles P1 (Resolve Before Escalate), P11 (User Transparency)
- User's stated motivation: "reduce friction between technical and non-technical teams regarding IT-related matters"

**Status:** [x] done

---

### Sub-Task 3 — Write the "What It Does" and Features Section

**Intent:** Explain the product from a user's perspective — what happens when an employee sends a Slack message — and enumerate the key capabilities. Satisfies **Design and Usability** criterion.

**Expected Outcomes:**
- A numbered "The Experience" walkthrough (Employee sends message → Refinement → Triage → Agent → Result)
- A features table or bullet list organized by capability area (Intelligent Triage, Code Intelligence, Knowledge Answers, IT Tickets, Audit Trail)
- Readable by both technical and non-technical evaluators

**Todo List:**
1. Write the step-by-step user journey (5–6 steps) from Slack message to resolution notification
2. Write a "Core Capabilities" section with 5 feature groups, each with a 1-line description
3. Add a domain classification table showing the 8 domains and example requests (from `knowledge/00_project_context.md`)
4. Add a priority band table (CRITICAL → INFORMATIONAL with score ranges from `src/engine/priority-scoring.ts`)

**Relevant Context:**
- `knowledge/00_project_context.md`: Domain table
- `knowledge/08_priority_model.md` (if exists) or `src/engine/priority-scoring.ts`
- `knowledge/06_workflow_architecture.md`: end-to-end workflow examples

**Status:** [x] done

---

### Sub-Task 4 — Write the Architecture and Multi-Agent Design Section

**Intent:** Provide the technical depth evaluators need to score **Completeness and Feasibility** and **Creativity and Innovation**. Show the system is real, designed, and implemented.

**Expected Outcomes:**
- ASCII architecture diagram showing all layers (Slack → Orchestrator → Agents → Context → Actions → DB)
- Agent responsibility table (all 7 agents: name, domain, LLM usage, status)
- State machine description (11 states listed, transitions explained briefly)
- Progressive Context Retrieval principle explained with its 6 tiers
- Decision Trace explained as the auditability mechanism

**Todo List:**
1. Add the full ASCII architecture diagram (from sub-agent research, adapted slightly)
2. Write the Agent Architecture table with columns: Agent, Domain, LLM Usage, Primary Responsibility, Status
3. Write the Request Lifecycle section describing the 11-state machine with a small state flow (text-based, not Mermaid)
4. Write the "Progressive Context Retrieval" subsection (6 tiers, why it matters for token efficiency and IBM watsonx cost)
5. Write the "Decision Trace" subsection: what it captures, why it's append-only, example fields

**Relevant Context:**
- `knowledge/04_agent_architecture.md`
- `knowledge/06_workflow_architecture.md`
- `knowledge/10_technical_architecture.md`
- `src/orchestrator/state-machine.ts` (state type definitions)
- Sub-agent research: architecture overview in section 6

**Status:** [x] done

---

### Sub-Task 5 — Write the Tech Stack and IBM Integration Section

**Intent:** Highlight IBM watsonx as the AI backbone while crediting all technologies. Supports **Completeness and Feasibility** criterion.

**Expected Outcomes:**
- Shields badges for IBM watsonx, Slack, TypeScript, Node.js, SQLite
- A "Why IBM watsonx" paragraph explaining the LLM abstraction and IBM-specific auth headers
- Tech stack table organized by layer (AI, Interface, Runtime, Storage)

**Todo List:**
1. Write the IBM watsonx highlight paragraph: OpenAI-compatible endpoint, `LLM_AUTH_STYLE`, `LLM_TEAM_ID` header, model flexibility
2. Build the tech stack table with layers: AI & ML, Interface, Runtime, Storage, Testing
3. Add inline badges for key technologies

**Relevant Context:**
- `src/llm/client.ts`: LLMClient interface with IBM-specific config
- `package.json`: dependencies (@slack/bolt, better-sqlite3, TypeScript)

**Status:** [x] done

---

### Sub-Task 6 — Write the Complete Installation and Setup Section

**Intent:** Enable any evaluator to clone and run the project in under 10 minutes. Supports **Design and Usability** criterion (ease of adoption).

**Expected Outcomes:**
- Prerequisites list (Node.js, npm, Slack App credentials, IBM watsonx API key)
- Step-by-step clone + install + environment configuration instructions
- All environment variables documented in a `.env` template code block
- Run commands for development and production modes
- Test command documented

**Todo List:**
1. Write the Prerequisites subsection (Node.js 18+, npm, Slack App with Socket Mode, IBM watsonx credentials)
2. Write Clone + Install steps
3. Write the full `.env` file template with every variable documented inline (from `src/index.ts` env validation and sub-agent research section 16)
4. Write run commands: `npm run build`, `npm start`, `npm test`
5. Note mock modes for demo without real LLM: `TRIAGE_MODE=mock`, `REFINEMENT_MODE=mock`, `ISSUE_MODE=mock`

**Relevant Context:**
- `src/index.ts`: env validation at startup
- Sub-agent research section 16: full environment variable list
- `knowledge/15_mvp_scope.md`: MVP scope and what's demo-ready

**Status:** [x] done

---

### Sub-Task 7 — Write the Roadmap, Team, and Closing Sections

**Intent:** Complete the document with a forward-looking roadmap, contributor table, and license — matching Mural-UnB's closing style.

**Expected Outcomes:**
- A "What's Next" roadmap with 3 post-hackathon items (Jira/ServiceNow, KB admin UI, analytics)
- A team table using GitHub avatar pattern from Mural-UnB reference
- License badge and section (ISC per package.json)
- A closing tagline centered div

**Todo List:**
1. Write the Roadmap section with checkboxes for post-MVP features (from `knowledge/15_mvp_scope.md` COULD HAVE section)
2. Write the Team section using Mural-UnB `<table>` HTML format with GitHub avatar URLs — **confirmed GitHub handles:**
   - `TiagoSBittencourt`
   - `devwallyson`
   - `Bappoz`
   - `ggzin-br`
   - `luanaa2005`
3. Add License section (ISC)
4. Add closing `<div align="center">` with a call-to-action line

**Relevant Context:**
- `knowledge/15_mvp_scope.md`: COULD HAVE and SHOULD HAVE lists
- Mural-UnB team table pattern from user-provided reference
- `package.json`: license field (ISC)

**Status:** [x] done

---

## Confirmed Decisions

1. **README.md** is replaced entirely. The existing content (Bob IDE setup guide) is already preserved in `SETUP.md` — no migration needed.
2. **Product name:** BobFlow
3. **Team GitHub handles:** `TiagoSBittencourt`, `devwallyson`, `Bappoz`, `ggzin-br`, `luanaa2005`
4. **Architecture diagram:** ASCII in a fenced code block (GitHub-rendered)
