/**
 * Priority Scoring Engine — implements 08_priority_model.md.
 *
 * Pure functions, zero I/O, zero LLM calls (P10 / I5).
 *
 * ── SPEC DEFECT RESOLUTION ────────────────────────────────────────────────────
 * 08_priority_model.md formula term: (5 - workaround_score) * 1
 *   comment: "no workaround raises score"
 * Input table: Score 0 = "Yes, easy", Score 5 = "None"
 *
 * As written: workaround=5 (None) → (5-5)=0 contribution  ← inverted
 *             workaround=0 (easy) → (5-0)=5 contribution  ← inverted
 *
 * FIX: Changed the formula term from (5 - workaround_score) to workaround_score.
 * The input table is correct (0=easy→low score, 5=none→high score, consistent with
 * every other input). The formula had the inversion. Using workaround_score directly
 * makes the comment true: "no workaround raises score" (score=5 → high contribution).
 *
 * ── SIGNAL EXTRACTION RULES ───────────────────────────────────────────────────
 * Signals are derived deterministically from TriageInput fields:
 *   normalized_message, intent, domain_hint, system_hint, is_complete
 *
 * Where a signal is unknowable from TriageInput, a documented default is used.
 * See extractPriorityScores() for per-field rules.
 */

import type { Domain, Priority, PriorityScores } from '../db/schema.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DomainFlags {
  /** True when domain=SOFTWARE and message contains production-down signals. */
  production_down: boolean;
  /** True when domain=ACCESS and message contains C-level user signals. */
  clevel_blocked: boolean;
}

// ── computePriority ───────────────────────────────────────────────────────────

/**
 * Computes Priority from PriorityScores, domain, and domain-level flags.
 * All domain overrides apply a floor — they never lower priority.
 *
 * Formula (max_possible = 75):
 *   urgency*2 + users_affected*2 + customer_impact*3 + financial_impact*1
 *   + security_flag*4 + workaround*1 + criticality*2
 *
 * Score bands: 0–4 INFORMATIONAL, 5–19 LOW, 20–39 MEDIUM, 40–59 HIGH, 60–75 CRITICAL
 */
export function computePriority(
  scores: PriorityScores,
  domain: Domain,
  flags: DomainFlags,
): Priority {
  const composite = computeComposite(scores);
  const bandPriority = bandToPriority(composite);
  return applyDomainOverrides(bandPriority, domain, flags, scores);
}

/**
 * Computes the raw 0–75 composite score.
 * Exported for testing / evidence reporting.
 */
export function computeComposite(scores: PriorityScores): number {
  return (
    clamp(scores.urgency,          0, 5) * 2 +
    clamp(scores.users_affected,   0, 5) * 2 +
    clamp(scores.customer_impact,  0, 5) * 3 +
    clamp(scores.financial_impact, 0, 5) * 1 +
    clamp(scores.security_flag,    0, 5) * 4 +
    clamp(scores.workaround,       0, 5) * 1 +   // 0=easy(low), 5=none(high) — see spec note above
    clamp(scores.criticality,      0, 5) * 2
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function bandToPriority(score: number): Priority {
  if (score >= 60) return 'CRITICAL';
  if (score >= 40) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  if (score >= 5)  return 'LOW';
  return 'INFORMATIONAL';
}

const PRIORITY_ORDER: Priority[] = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function maxPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_ORDER.indexOf(a) >= PRIORITY_ORDER.indexOf(b) ? a : b;
}

function applyDomainOverrides(
  base: Priority,
  domain: Domain,
  flags: DomainFlags,
  scores: PriorityScores,
): Priority {
  let result = base;

  // SECURITY domain → floor HIGH
  if (domain === 'SECURITY') {
    result = maxPriority(result, 'HIGH');
  }

  // SOFTWARE + production down → floor CRITICAL
  if (domain === 'SOFTWARE' && flags.production_down) {
    result = maxPriority(result, 'CRITICAL');
  }

  // ACCESS + C-level blocked → floor HIGH
  if (domain === 'ACCESS' && flags.clevel_blocked) {
    result = maxPriority(result, 'HIGH');
  }

  // security_flag=5 (confirmed breach) → always CRITICAL regardless of domain
  if (scores.security_flag >= 5) {
    result = maxPriority(result, 'CRITICAL');
  }

  return result;
}

// ── extractPriorityScores ─────────────────────────────────────────────────────

/**
 * Derives PriorityScores deterministically from TriageInput fields.
 *
 * RULES (documented per field):
 *
 * urgency (0–5):
 *   Keyword scan of normalized_message + intent.
 *   - "business stopped" / "company" / "entire" blocked                 → 5
 *   - "everyone" / "all" / "toda" / "todos" / "equipe" / "team"
 *     / "team blocked" / "ninguém" / "nobody"                           → 4
 *   - "can't work" / "não consigo" / "bloqueado" / "blocked" /
 *     "travado" / "urgente" / "urgent" / "crítico"                      → 3
 *   - "hoje" / "today" / "ontem" / "yesterday" / "waiting"              → 2
 *   - "slow" / "lento" / "minor"                                        → 1
 *   - no urgency signal                                                  → 0 (default)
 *
 * users_affected (0–5):
 *   Keyword scan.  TriageInput carries no explicit user count, so we
 *   infer from scale words.
 *   - "all" / "everyone" / "toda" / "todos" / "equipe" / "team"        → 5
 *   - "multiple" / "vários" / "várias" / "many" / "several" / "group"  → 3
 *   - "2" / "two" / "a few" / "some"                                    → 2
 *   - default (no scale word)                                           → 1 (single user assumed)
 *   NOTE: exact count is unknowable without an LLM; keyword heuristic is a
 *         conservative approximation.
 *
 * customer_impact (0–5):
 *   Default 0.  TriageInput carries no customer-vs-internal flag.
 *   - "cliente" / "client" / "customer" / "invoice" / "nota fiscal"    → 2 (single customer implied)
 *   - default                                                           → 0
 *   NOTE: multi-customer vs single-customer is unknowable; defaulting to 0/2.
 *
 * financial_impact (0–5):
 *   Default 0.  Inferred from financial keywords.
 *   - "invoice" / "nota fiscal" / "fatura" / "payment" / "pagamento" /
 *     "billing" / "receita" / "revenue" / "financial" / "financeiro"   → 2
 *   - default                                                           → 0
 *   NOTE: actual monetary value unknowable; keyword presence = measurable impact (score 2).
 *
 * security_flag (0–5):
 *   - domain_hint = SECURITY                                            → 4 (probable)
 *   - "senha" / "password" / "credential" / "breach" / "attack" /
 *     "phishing" / "malware" / "hack" / "vulnerability"                → 4
 *   - default                                                           → 0
 *
 * workaround (0–5):
 *   0 = "Yes, easy", 5 = "None"
 *   - "no workaround" / "sem alternativa" / "não tem como" /
 *     "stuck" / "travado" / "blocked" / "bloqueado"
 *     AND no mention of workaround alternative                          → 5
 *   - "partial" / "parcial" / "temporary fix" / "workaround parcial"   → 3
 *   - "workaround" / "alternative" / "alternativa" / "I can use" /
 *     "posso usar"                                                      → 1
 *   - default (no signal)                                               → 5
 *     (conservative: assume no workaround when not stated — safer to escalate)
 *
 * criticality (0–5):
 *   Derived from system_hint and message.
 *   - "ERP" / "CRM" / "SAP" / "production" / "produção" / "core" /
 *     "infrastructure" / "database" / "DB" / "crítico"                 → 4
 *   - "payment" / "pagamento" / "billing" / "HR" / "finance" /
 *     "financeiro" / "accounting" / "contabilidade"                     → 3
 *   - "internal tool" / "ferramenta interna" / "dashboard"             → 2
 *   - default                                                           → 1
 */
export function extractPriorityScores(
  normalized_message: string,
  intent: string,
  domain_hint: Domain | null,
  system_hint: string | null,
): PriorityScores {
  const text = [normalized_message, intent, system_hint ?? ''].join(' ').toLowerCase();

  return {
    urgency:          extractUrgency(text),
    users_affected:   extractUsersAffected(text),
    customer_impact:  extractCustomerImpact(text),
    financial_impact: extractFinancialImpact(text),
    security_flag:    extractSecurityFlag(text, domain_hint),
    workaround:       extractWorkaround(text),
    criticality:      extractCriticality(text, system_hint),
  };
}

function extractUrgency(text: string): number {
  if (match(text, /business.stopped|company.blocked|entire.company|empresa.parada/)) return 5;
  if (match(text, /everyone|all.+blocked|toda.+(equipe|time)|todos.+bloqueados?|ninguém.+consegue|nobody.+can|team.+blocked|equipe.+bloqueada?|finance.team.+blocked|all.+finance/)) return 4;
  if (match(text, /can't work|cannot work|não consigo|bloqueado|blocked|travado|urgente|urgent|crítico|critical/)) return 3;
  if (match(text, /\bontem\b|yesterday|hoje\b|today|\bwaiting\b/)) return 2;
  if (match(text, /\bslow\b|lento|minor|pequeno/)) return 1;
  return 0;
}

function extractUsersAffected(text: string): number {
  if (match(text, /\ball\b|everyone|toda.+(equipe|time)|todos\b|equipe\b|toda.+equipe|finance.team|finance team/)) return 5;
  if (match(text, /multiple|vários|várias|many|several|group|\bteam\b/)) return 3;
  if (match(text, /\b(2|two|a few|some)\b/)) return 2;
  return 1;
}

function extractCustomerImpact(text: string): number {
  if (match(text, /cliente|client|customer|invoice|nota.fiscal/)) return 2;
  return 0;
}

function extractFinancialImpact(text: string): number {
  if (match(text, /invoice|nota.fiscal|fatura|payment|pagamento|billing|receita|revenue|financial|financeiro/)) return 2;
  return 0;
}

function extractSecurityFlag(text: string, domain_hint: Domain | null): number {
  if (domain_hint === 'SECURITY') return 4;
  if (match(text, /senha|password|credential|breach|attack|phishing|malware|hack|vulnerab/)) return 4;
  return 0;
}

function extractWorkaround(text: string): number {
  // Explicit workaround mentioned → 1
  if (match(text, /workaround|alternative|alternativa|posso usar|i can use|temporary.fix/)) return 1;
  // Partial workaround → 3
  if (match(text, /partial|parcial/)) return 3;
  // Default: assume no workaround (conservative — escalate rather than under-prioritise)
  return 5;
}

function extractCriticality(text: string, system_hint: string | null): number {
  const sys = (system_hint ?? '').toLowerCase();
  const combined = text + ' ' + sys;
  if (match(combined, /\berp\b|crm|\bsap\b|production|produção|\bcore\b|infrastructure|database|\bdb\b|crítico/)) return 4;
  if (match(combined, /payment|pagamento|billing|\bhr\b|finance|financeiro|accounting|contabilidade/)) return 3;
  if (match(combined, /internal.tool|ferramenta.interna|dashboard/)) return 2;
  return 1;
}

function match(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

// ── extractDomainFlags ────────────────────────────────────────────────────────

/**
 * Derives DomainFlags from message text.
 *
 * production_down: SOFTWARE domain AND message suggests service completely down
 *   ("down" / "não funciona" / "500" / "error" + "all" or "everyone")
 *
 * clevel_blocked: ACCESS domain AND message mentions C-level title
 *   ("CEO" / "CFO" / "CTO" / "COO" / "VP" / "Director" / "board")
 */
export function extractDomainFlags(
  normalized_message: string,
  intent: string,
  domain_hint: Domain | null,
): DomainFlags {
  const text = [normalized_message, intent].join(' ').toLowerCase();

  const production_down =
    domain_hint === 'SOFTWARE' &&
    match(text, /\bdown\b|não funciona|500|http.5\d\d|service.unavailable|out.of.service|completely.blocked/);

  const clevel_blocked =
    domain_hint === 'ACCESS' &&
    match(text, /\bceo\b|\bcfo\b|\bcto\b|\bcoo\b|\bvp\b|director|board member|\bc-level\b/);

  return { production_down, clevel_blocked };
}

// ── buildEvidence ─────────────────────────────────────────────────────────────

/**
 * Builds the evidence[] array for the Decision Trace from scored signals.
 * Satisfies P4 (Evidence Before Conclusions) — every signal is named.
 */
export function buildPriorityEvidence(
  scores: PriorityScores,
  composite: number,
  priority: Priority,
  flags: DomainFlags,
): string[] {
  const evidence: string[] = [
    `priority_score:${composite}/75`,
    `priority_band:${priority}`,
    `urgency:${scores.urgency}`,
    `users_affected:${scores.users_affected}`,
    `customer_impact:${scores.customer_impact}`,
    `financial_impact:${scores.financial_impact}`,
    `security_flag:${scores.security_flag}`,
    `workaround:${scores.workaround}`,
    `criticality:${scores.criticality}`,
  ];
  if (flags.production_down)  evidence.push('override:production_down→CRITICAL');
  if (flags.clevel_blocked)   evidence.push('override:clevel_blocked→HIGH');
  return evidence;
}
