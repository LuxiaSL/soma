/**
 * SQLite Schema Definition
 */

export const SCHEMA = `
-- Users (Discord users we know about)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Global user balances (shared across all servers)
CREATE TABLE IF NOT EXISTS balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  amount REAL NOT NULL DEFAULT 50,
  last_regen_at TEXT DEFAULT (datetime('now'))
);

-- Servers (Discord guilds) - for reward config and role multipliers
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Bot costs (per-server overrides possible)
CREATE TABLE IF NOT EXISTS bot_costs (
  id TEXT PRIMARY KEY,
  bot_discord_id TEXT NOT NULL,
  server_id TEXT REFERENCES servers(id),
  base_cost REAL NOT NULL,
  description TEXT,
  UNIQUE (bot_discord_id, server_id)
);

-- Role configurations (per-server, affects cost multipliers)
CREATE TABLE IF NOT EXISTS role_configs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id),
  role_discord_id TEXT NOT NULL,
  regen_multiplier REAL DEFAULT 1.0,
  max_balance_override REAL,
  cost_multiplier REAL DEFAULT 1.0,
  UNIQUE (server_id, role_discord_id)
);

-- Transactions (audit log)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  timestamp TEXT DEFAULT (datetime('now')),
  server_id TEXT REFERENCES servers(id),
  type TEXT NOT NULL,
  from_user_id TEXT REFERENCES users(id),
  to_user_id TEXT REFERENCES users(id),
  bot_discord_id TEXT,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  metadata TEXT DEFAULT '{}'
);

-- Tracked messages (for reaction rewards/tips)
-- Messages are tracked for 7 days after bot response
CREATE TABLE IF NOT EXISTS tracked_messages (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  server_id TEXT REFERENCES servers(id),
  bot_discord_id TEXT NOT NULL,
  trigger_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Reward claims (prevents same user from rewarding same message multiple times)
CREATE TABLE IF NOT EXISTS reward_claims (
  user_id TEXT NOT NULL REFERENCES users(id),
  message_id TEXT NOT NULL,
  claimed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, message_id)
);

-- User server roles cache (tracks which roles users have in which servers)
-- Used for global regen rate calculation (best role follows you everywhere)
CREATE TABLE IF NOT EXISTS user_server_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  server_id TEXT NOT NULL REFERENCES servers(id),
  role_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of Discord role IDs
  last_seen TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, server_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_server ON transactions(server_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type, timestamp);
CREATE INDEX IF NOT EXISTS idx_bot_costs_bot ON bot_costs(bot_discord_id);
CREATE INDEX IF NOT EXISTS idx_role_configs_server ON role_configs(server_id);
CREATE INDEX IF NOT EXISTS idx_tracked_messages_expires ON tracked_messages(expires_at);
`
