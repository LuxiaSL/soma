/**
 * User Preferences Service
 * 
 * Manages user preferences like DM opt-in and welcome status
 */

import type { Database } from 'better-sqlite3'
import { logger } from '../utils/logger.js'

export interface UserPreferences {
  userId: string
  dmOptIn: boolean
  welcomed: boolean
  createdAt: Date
  updatedAt: Date
}

interface UserPreferencesRow {
  user_id: string
  dm_opt_in: number
  welcomed: number
  created_at: string
  updated_at: string
}

/**
 * Get user preferences, creating default entry if none exists
 */
export function getUserPreferences(db: Database, userId: string): UserPreferences {
  const row = db.prepare(`
    SELECT user_id, dm_opt_in, welcomed, created_at, updated_at
    FROM user_preferences
    WHERE user_id = ?
  `).get(userId) as UserPreferencesRow | undefined

  if (row) {
    return {
      userId: row.user_id,
      dmOptIn: row.dm_opt_in === 1,
      welcomed: row.welcomed === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  // Create default preferences
  db.prepare(`
    INSERT INTO user_preferences (user_id, dm_opt_in, welcomed)
    VALUES (?, 0, 0)
  `).run(userId)

  return {
    userId,
    dmOptIn: false,
    welcomed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Check if user has opted in to DMs (convenience function)
 */
export function isDmOptedIn(db: Database, userId: string): boolean {
  const prefs = getUserPreferences(db, userId)
  return prefs.dmOptIn
}

/**
 * Toggle DM opt-in status
 * @returns The new opt-in status
 */
export function toggleDmOptIn(db: Database, userId: string): boolean {
  const prefs = getUserPreferences(db, userId)
  const newValue = !prefs.dmOptIn

  db.prepare(`
    UPDATE user_preferences
    SET dm_opt_in = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newValue ? 1 : 0, userId)

  logger.info({
    userId,
    dmOptIn: newValue,
  }, 'User DM preference updated')

  return newValue
}

/**
 * Set DM opt-in to a specific value
 */
export function setDmOptIn(db: Database, userId: string, optIn: boolean): void {
  getUserPreferences(db, userId) // Ensure row exists

  db.prepare(`
    UPDATE user_preferences
    SET dm_opt_in = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(optIn ? 1 : 0, userId)

  logger.info({
    userId,
    dmOptIn: optIn,
  }, 'User DM preference set')
}

/**
 * Check if user has been welcomed
 */
export function hasBeenWelcomed(db: Database, userId: string): boolean {
  const prefs = getUserPreferences(db, userId)
  return prefs.welcomed
}

/**
 * Mark user as welcomed
 */
export function markWelcomed(db: Database, userId: string): void {
  getUserPreferences(db, userId) // Ensure row exists

  db.prepare(`
    UPDATE user_preferences
    SET welcomed = 1, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId)

  logger.debug({ userId }, 'User marked as welcomed')
}

