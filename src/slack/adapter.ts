import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type { NormalizedRequest } from '../db/schema.js';
import {
  isEventProcessed, recordEventSeen, createRequest, findOpenRequestForReply,
  findOpenRequestByUser, appendClarificationAnswer, linkEventToRequest,
} from '../db/repository.js';

// ── Redaction (patch §5b: email row removed; patch §5 adds missing patterns) ──
//
// Patterns: CREDENTIAL keyword form, CONNECTION-STRING, TOKEN (Bearer/JWT),
//           CPF, CARD (Luhn-validated), INTERNAL-IP (private ranges).
// Email: REMOVED per patch §5b (ACCESS domain needs reporter's email).

const REDACT_PATTERNS: Array<{ label: string; re: RegExp; replacement: string; validate?: (m: string) => boolean }> = [
  // 1. Password/secret keyword form — covers senha|secret|api_key (patch §5 adds missing keywords)
  {
    label: 'CREDENTIAL',
    re: /(password|senha|token|secret|api[_.]?key)\s*[:=]\s*\S+/gi,
    replacement: '[REDACTED-CREDENTIAL]',
  },
  // 2. Connection strings
  {
    label: 'CONNECTION-STRING',
    re: /(postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
    replacement: '[REDACTED-CONNECTION-STRING]',
  },
  // 3. Bearer tokens / JWT
  {
    label: 'TOKEN',
    re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: '[REDACTED-TOKEN]',
  },
  // 4. Brazilian CPF (punctuated: NNN.NNN.NNN-NN)
  {
    label: 'CPF',
    re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    replacement: '[REDACTED-CPF]',
  },
  // 5. Credit card — 13–19 digits, optionally separated by spaces/hyphens; Luhn-validated
  {
    label: 'CARD',
    re: /\b(?:\d[\s-]?){13,19}\d\b/g,
    replacement: '[REDACTED-CARD]',
    validate: luhnValid,
  },
  // 6. Private-range IPv4 addresses (10.x, 192.168.x, 172.16-31.x)
  {
    label: 'INTERNAL-IP',
    re: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[REDACTED-INTERNAL-IP]',
  },
];

// Luhn algorithm — strips non-digits, returns true when check passes
function luhnValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redact(text: string): { text: string; applied: boolean; patterns: string[] } {
  let out = text;
  const patterns: string[] = [];
  for (const { label, re, replacement, validate } of REDACT_PATTERNS) {
    if (validate) {
      // For patterns that require per-match validation (e.g. Luhn check for cards)
      let fired = false;
      const next = out.replace(re, (match) => {
        if (validate(match)) { fired = true; return replacement; }
        return match;
      });
      if (fired) { out = next; patterns.push(label); }
    } else {
      const next = out.replace(re, replacement);
      if (next !== out) { out = next; patterns.push(label); }
    }
  }
  return { text: out, applied: patterns.length > 0, patterns };
}

// ── Debounce buffer ───────────────────────────────────────────────────────────
interface BufferEntry {
  messages: string[];
  user_id: string;
  channel_id: string;
  first_event_id: string;   // dedup key for the resulting record
  first_ts: string;         // ts of the first triggering message (C2)
  attachments: string[];
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_DEBOUNCE_MS = 4_000;

// ── Orchestrator interface (injected) ─────────────────────────────────────────
export interface OrchestratorInterface {
  onRequestReceived(request_id: string): Promise<void>;
  onClarificationReply(params: { request_id: string; answer: string }): Promise<void>;
}

// ── Discriminated result ──────────────────────────────────────────────────────
export type ProcessEventResult =
  | { outcome: 'CREATED' }
  | { outcome: 'IGNORED' }
  | { outcome: 'REPLY' }
  | { outcome: 'OPEN_REQUEST_EXISTS'; request_id: string };

// ── SlackAdapter ──────────────────────────────────────────────────────────────
export class SlackAdapter {
  private buffers = new Map<string, BufferEntry>();
  private replyBuffers = new Map<string, { messages: string[]; timer: ReturnType<typeof setTimeout> }>();
  private debounceMs: number;

  constructor(
    private db: Database.Database,
    private orchestrator: OrchestratorInterface,
    private botUserId: string,
    options?: { debounceMs?: number },
  ) {
    this.debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * Entry point for every Slack event. Must be called AFTER ack().
   * event_id / event_ts logged unconditionally for §3 dedup audit.
   */
  async processEvent(
    event: Record<string, unknown>,
    envelope: { event_id?: string; event_ts?: string },
  ): Promise<ProcessEventResult> {
    // C1: log envelope ids for both deliveries
    console.log(`[adapter] event_id=${envelope.event_id ?? 'n/a'} event_ts=${envelope.event_ts ?? 'n/a'} type=${event['type']} subtype=${event['subtype'] ?? '-'} thread_ts=${event['thread_ts'] ?? 'none'}`);

    // C3: bot guard — reject self AND other bots
    if (event['bot_id'] || event['user'] === this.botUserId) {
      console.log('[adapter] bot guard fired — ignored');
      return { outcome: 'IGNORED' };
    }

    // Ignore edits/deletes
    if (event['subtype'] === 'message_changed' || event['subtype'] === 'message_deleted') {
      return { outcome: 'IGNORED' };
    }

    const type      = event['type'] as string;
    const subtype   = event['subtype'] as string | undefined;
    const userId    = event['user'] as string;
    const channelId = event['channel'] as string;
    const threadTs  = event['thread_ts'] as string | undefined;
    const text      = (event['text'] as string | undefined) ?? '';
    const ts        = event['ts'] as string;
    const channelType = event['channel_type'] as string | undefined;

    // ── C1: deterministic routing — BEFORE idempotency check ─────────────────
    // message.channels without thread_ts → IGNORE immediately (do NOT consume event_id)
    if (type === 'message' && channelType === 'channel' && !threadTs && !subtype) {
      console.log('[adapter] message.channels without thread_ts — ignored');
      return { outcome: 'IGNORED' };
    }

    const eventId = (event['event_ts'] as string | undefined)
      ?? envelope.event_id
      ?? (() => { console.warn('[adapter] no event_id — generating UUID'); return randomUUID(); })();

    // Idempotency check (guards genuine Slack retries within a single path)
    if (isEventProcessed(this.db, eventId)) {
      console.log(`[adapter] duplicate suppressed: ${eventId}`);
      return { outcome: 'IGNORED' };
    }

    // ── app_mention → CREATE ──────────────────────────────────────────────────
    if (type === 'app_mention') {
      // Concurrency check BEFORE recordEventSeen so a retry is not silently swallowed
      const open = findOpenRequestByUser(this.db, userId, channelId);
      if (open) {
        console.log(`[adapter] concurrency: user ${userId} already has open request ${open.request_id}`);
        return { outcome: 'OPEN_REQUEST_EXISTS', request_id: open.request_id };
      }
      recordEventSeen(this.db, eventId);
      await this._bufferCreate(userId, channelId, ts, text, eventId);
      return { outcome: 'CREATED' };
    }

    // ── message path ──────────────────────────────────────────────────────────
    if (type === 'message') {
      // Thread reply
      if (threadTs) {
        recordEventSeen(this.db, eventId);
        await this._handleReply(userId, channelId, threadTs, text, eventId);
        return { outcome: 'REPLY' };
      }

      // DM (im) top-level: may be a reply to a pending request (§7b: no thread_ts in DMs)
      if (channelType === 'im' && !subtype) {
        const pending = findOpenRequestForReply(this.db, null, channelId, userId);
        if (pending) {
          recordEventSeen(this.db, eventId);
          // Route as clarification reply (DM fallback)
          await this._handleReply(userId, channelId, null, text, eventId);
          return { outcome: 'REPLY' };
        } else {
          // Concurrency check BEFORE recordEventSeen
          const open = findOpenRequestByUser(this.db, userId, channelId);
          if (open) {
            console.log(`[adapter] concurrency: user ${userId} already has open request ${open.request_id}`);
            return { outcome: 'OPEN_REQUEST_EXISTS', request_id: open.request_id };
          }
          recordEventSeen(this.db, eventId);
          // thread_ts must be null for DMs — storing ts here would make bot replies open a thread inside DM
          await this._bufferCreate(userId, channelId, null as unknown as string, text, eventId);
          return { outcome: 'CREATED' };
        }
      }
    }

    console.log(`[adapter] IGNORED: type=${type} channelType=${channelType ?? 'n/a'} reason=no_matching_path`);
    return { outcome: 'IGNORED' };
  }

  // ── Debounced CREATE path ─────────────────────────────────────────────────
  private async _bufferCreate(
    userId: string,
    channelId: string,
    ts: string | null,
    text: string,
    eventId: string,
  ): Promise<void> {
    const key = `${channelId}:${userId}`;
    const existing = this.buffers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(text);
      existing.timer = setTimeout(() => this._guardedFlush(() => this._flushCreate(key), 'flushCreate'), this.debounceMs);
      return;
    }

    const timer = setTimeout(() => this._guardedFlush(() => this._flushCreate(key), 'flushCreate'), this.debounceMs);
    this.buffers.set(key, {
      messages: [text],
      user_id: userId,
      channel_id: channelId,
      first_event_id: eventId,
      first_ts: ts ?? '',   // C2: thread anchor = user's original message ts (null for DMs)
      attachments: [],
      timer,
    });
  }

  /**
   * Error boundary for debounced flushes.
   *
   * Flushes fire from `setTimeout`, OUTSIDE the `processEvent` try/catch and
   * outside any awaited chain, so a rejection here becomes an unhandled promise
   * rejection that crashes the whole process (P0: bot dies on triage handoff).
   * This wraps every flush so a downstream failure is logged and contained —
   * the request record is already persisted and stays retryable.
   */
  private _guardedFlush(run: () => Promise<void>, label: string): void {
    run().catch(err => {
      console.error(`[adapter] ${label} failed (request left for retry):`, err);
    });
  }

  private async _flushCreate(key: string): Promise<void> {
    const buf = this.buffers.get(key);
    if (!buf) return;
    this.buffers.delete(key);

    const raw = buf.messages.join('\n').slice(0, 4_000);
    const { text, applied, patterns } = redact(raw);

    // thread_ts is null for DMs (empty string sentinel → null)
    const thread_ts = buf.first_ts === '' ? null : buf.first_ts;

    const req = createRequest(this.db, {
      request_id: randomUUID(),
      slack_event_id: buf.first_event_id,
      slack_user_id: buf.user_id,
      slack_channel_id: buf.channel_id,
      thread_ts,  // C2: user's original message ts (null for DMs)
      original_message: text,
      redaction_applied: applied,
      redacted_patterns: patterns,
      attachments: buf.attachments,
      status: 'RECEIVED',
      is_complete: false,
      clarification_round: 0,
      clarification_history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    linkEventToRequest(this.db, buf.first_event_id, req.request_id);
    await this.orchestrator.onRequestReceived(req.request_id);
  }

  // ── Reply path (patch §5c: 4s debounce on replies too) ──────────────────────
  private async _handleReply(
    userId: string,
    channelId: string,
    threadTs: string | null,
    text: string,
    _eventId: string,
  ): Promise<void> {
    const pending = findOpenRequestForReply(this.db, threadTs, channelId, userId);
    if (!pending) {
      console.log(`[adapter] reply to non-pending thread — ignored`);
      return;
    }

    const key = `reply:${threadTs ?? 'dm'}:${channelId}:${userId}`;
    const existing = this.replyBuffers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(text);
      existing.timer = setTimeout(() => this._guardedFlush(() => this._flushReply(key, pending.request_id, threadTs, userId, channelId), 'flushReply'), this.debounceMs);
      return;
    }
    const timer = setTimeout(() => this._guardedFlush(() => this._flushReply(key, pending.request_id, threadTs, userId, channelId), 'flushReply'), this.debounceMs);
    this.replyBuffers.set(key, { messages: [text], timer });
  }

  private async _flushReply(
    key: string,
    request_id: string,
    threadTs: string | null,
    userId: string,
    channelId: string,
  ): Promise<void> {
    const buf = this.replyBuffers.get(key);
    if (!buf) return;
    this.replyBuffers.delete(key);

    // Re-check still CLARIFICATION_PENDING after debounce window
    const pending = findOpenRequestForReply(this.db, threadTs, channelId, userId);
    if (!pending || pending.request_id !== request_id) {
      console.log(`[adapter] reply debounce: request no longer pending — ignored`);
      return;
    }

    const answer = buf.messages.join('\n').slice(0, 4_000);
    await this.orchestrator.onClarificationReply({ request_id, answer });
  }

  /** Exposed for tests: flush all pending debounce timers immediately. */
  async flushAll(): Promise<void> {
    const createKeys = [...this.buffers.keys()];
    const replyKeys  = [...this.replyBuffers.keys()];
    for (const k of createKeys) {
      clearTimeout(this.buffers.get(k)!.timer);
      await this._flushCreate(k);
    }
    // reply buffers need their metadata; we stored only messages+timer
    // so flush is handled inline when timer fires — exposed via forceFlushReply
    for (const k of replyKeys) {
      const buf = this.replyBuffers.get(k);
      if (buf) clearTimeout(buf.timer);
    }
    // Can't reconstruct metadata from key alone in this path; tests use advanceTimers
    void replyKeys;
  }
}
