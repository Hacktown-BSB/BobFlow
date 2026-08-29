import Database from 'better-sqlite3';
import { initDb } from './db/schema.js';
import { createBot } from './slack/bot.js';

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_VARS = [
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_BOT_USER_ID',
  'TRIAGE_ADMIN_USERS',
] as const;

for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    console.error(`[startup] Missing required environment variable: ${v}`);
    process.exit(1);
  }
}

const BOT_TOKEN   = process.env['SLACK_BOT_TOKEN']!;
const APP_TOKEN   = process.env['SLACK_APP_TOKEN']!;
const BOT_USER_ID = process.env['SLACK_BOT_USER_ID']!;

// ── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env['DB_PATH'] ?? 'triage.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
initDb(db);
console.log(`[startup] Database ready: ${DB_PATH}`);

// ── Bot ───────────────────────────────────────────────────────────────────────
const app = createBot(db, {
  botToken: BOT_TOKEN,
  appToken: APP_TOKEN,
  botUserId: BOT_USER_ID,
});

await app.start();
console.log('[startup] Bot connected via Socket Mode ✓');
