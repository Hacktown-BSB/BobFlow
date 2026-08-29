# 17 — Intake Refinement Policy

**File:** `knowledge/17_intake_refinement_policy.md`  
**Scope:** How the single next clarification question is chosen, under the hard cap of one question per turn and two rounds total.  
**Depends on:** `01_product_constitution.md` (P2, P11), `16_demo_strategy.md`, `17_intake_audit.md`  
**Used by:** Dev 1 (Refinement Agent implementation), Dev 5 (Orchestrator CLARIFY routing)  
**Note:** `knowledge/17_intake_intent_sufficiency.md` was listed as a read source but does not exist in the knowledge base. Decisions below are made from the available source files and are marked where that file's content would be needed.

---

## 1. STRATEGY COMPARISON

Three strategies for choosing the clarification question, scored against the ≤2-round budget mandated by P2.

| Criterion | Fixed questionnaire per domain | Decision-tree-driven question bank | LLM-generated free-form question |
|---|---|---|---|
| **Turns to sufficiency** | 1–2 (asks all gaps simultaneously or prioritizes top field) | 1–2 (selects highest-priority missing field deterministically) | 0–2 (may ask the exactly right question, or ask an irrelevant one) |
| **Determinism** | HIGH — same domain → same question order, always | HIGH — missing-field set → fixed priority table → one question, inspectable without LLM | LOW — different prompt run → different question; non-reproducible |
| **Token cost** | LOW — no LLM call for question selection; LLM only for normalization | LOW — no LLM call for question selection | MEDIUM — requires LLM call just to choose a question before any normalization |
| **Failure mode when user answers off-topic** | Always asks the next question from the questionnaire, regardless of answer content | Detects whether the answer filled the field; if not, escalates to round 2 with the same field | May ask a second question about the answer to the first, consuming both rounds before touching the core missing field |
| **Inspectability** | YES — question for any state readable from a table | YES — question for any state derivable from field-priority table, no LLM needed | NO — cannot predict question without running the model |

### Recommendation: **Decision-tree-driven question bank**

**Rationale:** Satisfies P10 (deterministic execution) — question selection is fully inspectable code. Satisfies P12 (token efficiency) — no extra LLM call to select a question. Satisfies P2 — the highest-priority missing field is asked in round 1, leaving round 2 for the second-most-critical gap.

The LLM is still used to *render* the question in natural language (from the bank entry), but not to *select* it. If the question bank covers all domain/field combinations, the selection path is a lookup table, not inference.

### Condition under which the recommendation flips

If the KB covers fewer than 4 domains (i.e., domain_hint is almost always null after round 0), a fixed questionnaire is cheaper — the question bank's field-priority table has nothing to prioritize over. Flip threshold: **if domain_hint is UNKNOWN after round 0 in more than 50% of requests in the first week of production**, switch to fixed questionnaire (one universal "describe your problem in one sentence" question for round 1).

---

## 2. SELECTION RULE

### Given: the missing-field set

After round 0 (first message analyzed), the Refinement Agent determines which required fields (per domain hint) are absent. The selection rule produces exactly one field to ask about.

**Inputs:**
- `domain_hint` (may be null)
- `missing_fields[]` — the set of required fields not yet present

**Algorithm (deterministic code, no LLM):**

```
1. Look up domain_hint in FIELD_PRIORITY_TABLE (see §3)
2. If domain_hint is null: use the UNKNOWN row
3. Iterate the priority-ordered field list for that domain
4. Return the FIRST field in the list that is in missing_fields[]
5. That field's question bank entry (pt-BR) is the clarification question
```

**Tie-break:** The priority table is ordered; iteration is deterministic. No ties are possible — first match wins.

**Inspectable without LLM:** Given `domain_hint` + `missing_fields[]`, any developer can look up the question in the table below without running any model.

### FIELD_PRIORITY_TABLE

| domain_hint | Priority 1 | Priority 2 | Priority 3 |
|---|---|---|---|
| SOFTWARE | `error_description` | `system_name` | `steps_to_reproduce` |
| HARDWARE | `device_type` | `problem_description` | `asset_tag` |
| ACCESS | `system_name` | `access_type` | `urgency_reason` |
| DIGITAL | `tool_name` | `problem_description` | `account_email` |
| SECURITY | `what_was_observed` | `when_it_happened` | `which_system` |
| BUSINESS_PROCESS | `process_name` | `stuck_step` | — |
| QUESTION | `specific_question` | — | — |
| UNKNOWN | `general_description` | — | — |
| null | `general_description` | — | — |

**Field present = non-null and non-empty string in the NormalizedRequest.** The LLM populates these during round 0 analysis; the Orchestrator checks presence deterministically before each round.

---

## 3. QUESTION BANK (pt-BR)

One question per field, written in the conversational Slack voice from `16_demo_strategy.md` ("Hi Ana! To help you faster…"). Maximum one sentence. No technical jargon or internal system names exposed.

### SOFTWARE domain

| Field | Question (pt-BR) |
|---|---|
| `error_description` | Aparece alguma mensagem de erro ou código específico quando isso acontece? |
| `system_name` | Em qual sistema ou ferramenta o problema está ocorrendo? |
| `steps_to_reproduce` | Você consegue descrever o que estava tentando fazer quando o erro apareceu? |

### HARDWARE domain

| Field | Question (pt-BR) |
|---|---|
| `device_type` | Qual equipamento está com problema — notebook, desktop, impressora, monitor ou outro? |
| `problem_description` | O que exatamente está acontecendo com o equipamento? |
| `asset_tag` | Você sabe o número de patrimônio ou modelo do equipamento? (Pode pular se não souber.) |

### ACCESS domain

| Field | Question (pt-BR) |
|---|---|
| `system_name` | Em qual sistema ou aplicativo você está com problema de acesso? |
| `access_type` | É uma senha, uma permissão específica, VPN ou outro tipo de acesso? |
| `urgency_reason` | Esse problema está te impedindo de trabalhar agora? |

### DIGITAL domain

| Field | Question (pt-BR) |
|---|---|
| `tool_name` | Qual ferramenta ou aplicativo está com problema? |
| `problem_description` | O que está acontecendo — erro, lentidão, tela em branco ou outra coisa? |
| `account_email` | O problema é com a sua conta pessoal ou afeta outras pessoas também? |

### SECURITY domain

| Field | Question (pt-BR) |
|---|---|
| `what_was_observed` | O que você viu ou recebeu que pareceu suspeito? |
| `when_it_happened` | Quando isso aconteceu — agora há pouco, hoje, ou em outro momento? |
| `which_system` | Em qual dispositivo ou sistema você notou isso? |

### BUSINESS_PROCESS domain

| Field | Question (pt-BR) |
|---|---|
| `process_name` | Qual processo ou etapa está com problema? |
| `stuck_step` | Em qual passo específico você está travado ou sem conseguir avançar? |

### QUESTION domain

| Field | Question (pt-BR) |
|---|---|
| `specific_question` | Qual é exatamente a dúvida — pode detalhar um pouco mais? |

### UNKNOWN / null domain_hint

| Field | Question (pt-BR) |
|---|---|
| `general_description` | Pode me contar um pouco mais sobre o que está acontecendo? |

---

## 4. ROUND-2 BEHAVIOUR

### When round 1 was answered…

#### …fully and on-topic
- The answered field is removed from `missing_fields[]`.
- Round-2 question selection: apply §2 algorithm to the remaining `missing_fields[]`.
- If `missing_fields[]` is now empty → `is_complete = true`, transition to `READY_FOR_TRIAGE`.
- If still fields missing → ask round-2 question.

#### …partially (e.g., "I don't know")
- The field is considered **present** with value `"unknown"` — it no longer blocks classification.
- The Refinement Agent sets `notes`: `"[field_name]: user stated 'I don't know'"`.
- Do NOT ask the same question again in round 2.
- Apply §2 to the next missing field. If none remain, proceed to triage.

#### …evasively (unrelated topic)
- Operationally: the answer text did not populate the targeted field (Refinement Agent's LLM cannot extract the required information from the reply).
- Action: in round 2, **rephrase the same question** using the round-2 variant from the bank (see round-2 variants below).
- Do NOT ask a new question. The priority field from round 1 is re-asked once, more directly.
- This is the ONLY scenario where the same field is targeted twice.

#### …with a contradiction of the original message
**The contradiction-handling rule:** The later statement does NOT automatically win.

The Refinement Agent detects a contradiction when both statements cannot be simultaneously true (e.g., "started this morning" in the original message + "this has been happening for a week" in the reply).

Handling:
1. Both statements are preserved verbatim in `clarification_history`.
2. The `notes` field records: `"CONTRADICTION: [field]. Original: '[value A]'. Round 1 answer: '[value B]'. Using original."`.
3. **The original message value is retained** as the field value. Rationale: the original message was written without prompting; the reply was written under direct questioning and may have been influenced by the question framing.
4. If the contradiction is on a safety-relevant field (e.g., `when_it_happened` for a SECURITY event), set `is_complete = false`, `notes` records the contradiction, and the Orchestrator routes to `requires_human = true` after round 2 regardless.

### Round-2 rephrasing variants (pt-BR)

| domain_hint | Field | Round-2 rephrase |
|---|---|---|
| SOFTWARE | `error_description` | Entendi — e na tela, aparece algum número ou texto de erro, mesmo que seja breve? |
| HARDWARE | `device_type` | Só para confirmar: é um notebook, desktop, impressora ou outro tipo de equipamento? |
| ACCESS | `system_name` | Qual é o nome do sistema onde você está tentando entrar? |
| DIGITAL | `tool_name` | O nome do aplicativo ou ferramenta com problema é qual exatamente? |
| SECURITY | `what_was_observed` | Para ajudar o time de segurança: o que especificamente te pareceu suspeito? |
| UNKNOWN | `general_description` | Pode me dar mais um detalhe sobre o problema para eu direcionar melhor? |

---

## 5. EXIT BEHAVIOUR AFTER ROUND 2 WITH REQUEST STILL INSUFFICIENT

### Conditions
`clarification_round = 2` AND `is_complete = false` (required fields still missing or answers were evasive).

### NormalizedRequest values set at exit

| Field | Value |
|---|---|
| `is_complete` | `false` |
| `clarification_round` | `2` |
| `normalized_message` | Best-effort normalization of all available text (original + round 1 + round 2 answers) |
| `intent` | Best-effort one-line intent extracted from available text |
| `domain_hint` | Best available value, or `UNKNOWN` if still null |
| `notes` | `"Exited after 2 clarification rounds. Missing fields: [list]. Proceeding with partial information."` |

The Orchestrator transitions to `READY_FOR_TRIAGE` unconditionally. Triage operates on whatever is available. If `domain_hint = UNKNOWN` or `confidence < 0.6`, Triage routes to `requires_human = true`.

### Slack message to the user (pt-BR)

```
Obrigado pelas respostas, [first_name]! Vou encaminhar sua solicitação com as 
informações disponíveis. Um atendente pode entrar em contato para detalhes adicionais.
Referência: [request_id_short]
```

Where `request_id_short` = first 8 characters of the UUID.

### Decision Trace entry

```json
{
  "step_id": "<uuid>",
  "timestamp": "<ISO8601>",
  "agent": "refinement",
  "state_from": "NORMALIZING",
  "state_to": "READY_FOR_TRIAGE",
  "decision": "Exited refinement after 2 clarification rounds with is_complete=false",
  "confidence": 0.3,
  "evidence": [
    "clarification_round=2",
    "missing_fields=[<list>]",
    "best_effort_domain_hint=<value>"
  ],
  "context_source": ["slack_message"],
  "next_action": "route_to_triage",
  "result": "partial_normalization"
}
```

Confidence of `0.3` signals low-quality input to downstream agents without blocking the workflow.

---

## 6. PRIMARY DEMO TRANSCRIPT (pt-BR, annotated)

From `16_demo_strategy.md` primary demo scenario, with full refinement annotation.

---

**Turn 0 — Ana's first message**

> *Ana:* `@triage-bot O sistema ERP está dando erros quando tento gerar notas fiscais para clientes. Todo o time de finanças está bloqueado. Começou ontem à tarde.`

| Annotation | Value |
|---|---|
| State | `NORMALIZING` |
| Available fields | `system_name` = "ERP" ✓, `error_description` = absent, `steps_to_reproduce` = "tentando gerar notas fiscais" ✓ |
| Missing fields | `error_description` |
| domain_hint | `SOFTWARE` (signal: "sistema", "erros", "ERP") |
| is_complete | `false` |
| Tokens sent to LLM | ~380 (system prompt ~180 + user message ~200) |
| Selected question | SOFTWARE / `error_description` → priority 1 |

---

**Turn 1 — Bot clarification (Round 1)**

> *Bot:* `Oi, Ana! Para te ajudar mais rápido: aparece alguma mensagem de erro ou código específico quando isso acontece?`

| Annotation | Value |
|---|---|
| State | `CLARIFICATION_PENDING` |
| clarification_round | `1` |
| clarification_history | `[{ question: "Aparece alguma mensagem...", answer: null }]` |
| Tokens sent | 0 — question selected deterministically from bank, no LLM call |

---

**Turn 2 — Ana's answer (Round 1 reply)**

> *Ana:* `Sim — aparece 'HTTP 500 Internal Server Error' no navegador.`

| Annotation | Value |
|---|---|
| State | `NORMALIZING` |
| Answer received | `error_description` = "HTTP 500 Internal Server Error" ✓ |
| missing_fields[] after update | empty |
| is_complete | `true` |
| clarification_history | `[{ question: "Aparece alguma mensagem...", answer: "HTTP 500 Internal Server Error no navegador" }]` |
| Tokens sent to LLM | ~480 (system prompt ~180 + original message ~200 + Q1+A1 ~100) |
| Round 2 needed | NO |

---

**Turn 3 — Transition**

| Annotation | Value |
|---|---|
| State | `READY_FOR_TRIAGE` |
| normalized_message | "O sistema ERP está gerando erro HTTP 500 ao tentar criar notas fiscais. O time de finanças está bloqueado desde ontem à tarde." |
| intent | "ERP invoice generation failing with HTTP 500" |
| domain_hint | `SOFTWARE` |
| system_hint | `ERP` |
| module_hint | `invoice` |
| is_complete | `true` |
| clarification_round | `1` |
| Total LLM tokens for refinement | ~860 (two calls: round 0 analysis ~380 + round 1 merge ~480) |

---

### Contrast: Secondary Demo B (Zoom crash — no clarification needed)

> *Maria:* `@triage-bot O Zoom fica travando quando tento entrar numa reunião.`

| Annotation | Value |
|---|---|
| State | `NORMALIZING` |
| Available fields | `tool_name` = "Zoom" ✓, `problem_description` = "travando ao entrar numa reunião" ✓ |
| domain_hint | `DIGITAL` |
| missing_fields | empty (all required fields for DIGITAL domain present) |
| is_complete | `true` |
| clarification_round | `0` |
| LLM tokens | ~350 (single call) |
| Rounds needed | 0 |

---

### Contrast: Secondary Demo C (Lucas — incomplete but sufficient)

> *Lucas:* `@triage-bot O módulo de notas fiscais está dando erro 500 de novo.`

| Annotation | Value |
|---|---|
| Available fields | `module_hint` = "notas fiscais/invoice" ✓, `error_description` = "erro 500" ✓, `system_hint` = implied ERP from prior context |
| domain_hint | `SOFTWARE` |
| missing_fields | `system_name` (could ask) — but `error_description` present and `module_hint` present |
| is_complete | `true` (P2: don't ask for inferable information — "sistema ERP" inferable from module context and seeded incident) |
| clarification_round | `0` |
| Rounds needed | 0 |

---

## OPEN QUESTIONS

| ID | Question | Decision needed by |
|---|---|---|
| OQ-R1 | `17_intake_intent_sufficiency.md` was listed as a read source but does not exist. If it defines sufficiency thresholds different from the field-presence rule above, those definitions supersede §2 of this document. | Before Dev 1 begins implementation |
| OQ-R2 | The contradiction rule retains the original message value. Is this correct for SECURITY events where the user may be providing additional detail in round 1? Consider: safety-relevant fields always defer to human review when contradicted, regardless of which value is retained. | Review with security policy in Step 3 |
| OQ-R3 | `first_name` is used in the round-2 exit message. This is not a field in `NormalizedRequest`. Either add `slack_display_name: string` to the schema or replace with "Olá" as the salutation. | Dev 1 + Dev 5 schema decision |
