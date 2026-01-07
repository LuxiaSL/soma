/**
 * Rewards Service
 * Handles reward claim tracking to prevent stacking
 */

import type { Database } from 'better-sqlite3'

/**
 * Check if a user has already claimed a reward for a message
 */
export function hasClaimedReward(
  db: Database,
  userId: string,
  messageId: string
): boolean {
  const row = db.prepare(`
    SELECT 1 FROM reward_claims 
    WHERE user_id = ? AND message_id = ?
  `).get(userId, messageId)

  return !!row
}

/**
 * Record that a user claimed a reward for a message
 */
export function recordRewardClaim(
  db: Database,
  userId: string,
  messageId: string
): void {
  db.prepare(`
    INSERT OR IGNORE INTO reward_claims (user_id, message_id)
    VALUES (?, ?)
  `).run(userId, messageId)
}

