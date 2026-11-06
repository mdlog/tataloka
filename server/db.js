// SQLite storage (node:sqlite, built into Node ≥ 22.13 — no native dependency).
// Holds accounts (with plan + credits), login sessions, saved designs and credit history. Default file: data/tataloka.db
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,
  google_sub    TEXT UNIQUE,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS designs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  room_type   TEXT NOT NULL,
  style       TEXT NOT NULL,
  total_idr   INTEGER NOT NULL,
  item_count  INTEGER NOT NULL,
  images      TEXT NOT NULL,
  graph_json  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS designs_user ON designs(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS design_renders (
  design_id   TEXT PRIMARY KEY REFERENCES designs(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        BLOB NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  from_bonus  INTEGER NOT NULL DEFAULT 0,
  period      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_events_user ON credit_events(user_id, id DESC);
-- Pending email verification: one live code + link per account (only their hashes are stored).
CREATE TABLE IF NOT EXISTS email_codes (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  link_hash   TEXT NOT NULL UNIQUE,
  attempts    INTEGER NOT NULL DEFAULT 0,
  sent_at     INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
`

// Columns added after the first release; existing databases get them on start.
const USER_COLUMNS = {
  plan: "TEXT NOT NULL DEFAULT 'free'",
  credit_period: 'TEXT',
  credits_used: 'INTEGER NOT NULL DEFAULT 0',
  bonus_credits: 'INTEGER NOT NULL DEFAULT 0',
  email_verified_at: 'INTEGER', // null = email not verified yet (AI features stay locked)
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  const have = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name))
  for (const [name, type] of Object.entries(USER_COLUMNS)) if (!have.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`)
  // Accounts from before email verification: Google already verified theirs; email + password ones must verify.
  if (!have.has('email_verified_at')) db.exec('UPDATE users SET email_verified_at = created_at WHERE google_sub IS NOT NULL')
  return db
}
