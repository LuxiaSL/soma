/**
 * Database Migrations
 * 
 * Handles schema updates for existing databases.
 * Each migration runs once and is tracked in the schema_migrations table.
 */

import type { Database } from 'better-sqlite3'
import { logger } from '../utils/logger.js'

interface Migration {
  id: string
  description: string
  up: (db: Database) => void
}

/**
 * All migrations in order
 */
const MIGRATIONS: Migration[] = [
  {
    id: '001_add_user_profile_columns',
    description: 'Add username, display_name, avatar_hash, last_seen columns to users table',
    up: (db) => {
      // Check if columns already exist (for fresh databases)
      const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
      const existingColumns = new Set(tableInfo.map(c => c.name))

      if (!existingColumns.has('username')) {
        db.exec(`ALTER TABLE users ADD COLUMN username TEXT`)
      }
      if (!existingColumns.has('display_name')) {
        db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`)
      }
      if (!existingColumns.has('avatar_hash')) {
        db.exec(`ALTER TABLE users ADD COLUMN avatar_hash TEXT`)
      }
      if (!existingColumns.has('last_seen')) {
        db.exec(`ALTER TABLE users ADD COLUMN last_seen TEXT`)
      }
    }
  },
  {
    id: '002_add_user_preferences',
    description: 'Add user_preferences table for DM opt-in and other settings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id),
          dm_opt_in INTEGER NOT NULL DEFAULT 0,
          welcomed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)
    }
  },
  {
    id: '003_add_user_notifications',
    description: 'Add user_notifications table for in-app notification inbox',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          action_hint TEXT,
          action_data TEXT,
          read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id, read, created_at DESC)`)
    }
  },
]

/**
 * Initialize migrations table
 */
function initMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

/**
 * Get list of already applied migrations
 */
function getAppliedMigrations(db: Database): Set<string> {
  const rows = db.prepare(`SELECT id FROM schema_migrations`).all() as Array<{ id: string }>
  return new Set(rows.map(r => r.id))
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database): { applied: string[], skipped: string[] } {
  initMigrationsTable(db)
  
  const applied = getAppliedMigrations(db)
  const result = { applied: [] as string[], skipped: [] as string[] }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      result.skipped.push(migration.id)
      continue
    }

    logger.info({ migrationId: migration.id, description: migration.description }, 'Running migration')

    try {
      // Run migration in a transaction
      const runMigration = db.transaction(() => {
        migration.up(db)
        db.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migration.id)
      })
      runMigration()

      result.applied.push(migration.id)
      logger.info({ migrationId: migration.id }, 'Migration completed')
    } catch (error) {
      logger.error({ migrationId: migration.id, error }, 'Migration failed')
      throw error
    }
  }

  if (result.applied.length > 0) {
    logger.info({ applied: result.applied.length, skipped: result.skipped.length }, 'Migrations complete')
  }

  return result
}

