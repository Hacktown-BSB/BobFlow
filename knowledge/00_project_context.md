# 00 — Project Context

**Depends on:** nothing  
**Used by:** all artifacts

---

## Project

**Name:** IBM Dev Day Hackathon — AI-Powered Corporate Triage & Workflow Orchestration Platform  
**Interface:** Slack + IBM Bob  
**Status:** Architecture phase — five developers implementing MVP

---

## One-Line Mission

Route every employee operational request to the right resolution path — automatically, transparently, and without unnecessary human handoff.

---

## Core Problem

Employees across departments report problems and requests with no unified entry point, inconsistent information, and unclear ownership. IT, Engineering, and Support teams receive incomplete context and duplicate reports.

---

## Core Solution

A Slack-native triage platform that:
1. Accepts any operational request via natural language
2. Refines ambiguous input through targeted clarification
3. Classifies and routes to specialized agents
4. Retrieves only the context required for each decision
5. Executes actions through governed tools
6. Returns transparent results with a Decision Trace

---

## Request Domains

| Domain | Examples |
|---|---|
| SOFTWARE | bugs, errors, crashes, performance |
| DIGITAL | SaaS tools, accounts, licenses, digital config |
| HARDWARE | devices, peripherals, network equipment |
| ACCESS | permissions, VPN, SSO, credentials |
| SECURITY | breaches, phishing, anomalies, policy |
| BUSINESS_PROCESS | workflows, approvals, missing steps |
| QUESTION | how-to, guidance, policy lookup |
| OTHER | anything unclassified |

---

## Central Architectural Principle

> **Progressive Context Retrieval**
>
> REQUEST → DOMAIN → SYSTEM → MODULE → RESOURCE → RELEVANT CONTEXT → DECISION → ACTION

Never load entire repositories, databases, or org structures. Load only what is needed at each decision step.

---

## Team

Five developers — parallel implementation with clear ownership boundaries.

---

## Integration Targets (MVP)

- Slack (primary interface)
- GitHub (repository intelligence)
- IT ticketing system (stub/mock for MVP)
- Email (notification)
- Internal knowledge base (structured documents)

---

## Key Constraints

- Hackathon timeline: must have a demonstrable end-to-end flow
- Must not fabricate information
- Must not execute high-risk actions without human approval
- Must maintain a full auditable Decision Trace
