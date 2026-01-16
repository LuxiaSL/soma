/**
 * Transfer Limits Service
 * 
 * Tracks and enforces daily limits on ichor transfers (both /transfer and tips).
 * Prevents abuse by capping how much users can send/receive per day.
 */

import type { Database } from 'better-sqlite3'
import { getGlobalConfig } from './config.js'
import { logger } from '../utils/logger.js'
import { getTodayDateStringPST } from '../utils/timezone.js'

/**
 * Get today's date string in YYYY-MM-DD format (PST timezone)
 * Daily transfer limits reset at midnight PST, not UTC.
 */
function getTodayDateString(): string {
  return getTodayDateStringPST()
}

/**
 * Transfer limit status for a user
 */
export interface TransferLimitStatus {
  sentToday: number
  receivedToday: number
  maxDailySent: number
  maxDailyReceived: number
  sentRemaining: number
  receivedRemaining: number
}

/**
 * Get a user's daily transfer status
 * Automatically treats stale dates as zero
 */
export function getDailyTransferStatus(
  db: Database,
  discordUserId: string
): TransferLimitStatus {
  const config = getGlobalConfig()
  const today = getTodayDateString()

  // Get sent amount
  const sentRow = db.prepare(`
    SELECT amount_today, reset_date
    FROM user_daily_transfers
    WHERE discord_id = ? AND target_type = 'sent'
  `).get(discordUserId) as { amount_today: number; reset_date: string } | undefined

  // Get received amount
  const receivedRow = db.prepare(`
    SELECT amount_today, reset_date
    FROM user_daily_transfers
    WHERE discord_id = ? AND target_type = 'received'
  `).get(discordUserId) as { amount_today: number; reset_date: string } | undefined

  // If reset_date is not today, treat as 0
  const sentToday = (sentRow && sentRow.reset_date === today) ? sentRow.amount_today : 0
  const receivedToday = (receivedRow && receivedRow.reset_date === today) ? receivedRow.amount_today : 0

  return {
    sentToday,
    receivedToday,
    maxDailySent: config.maxDailySent,
    maxDailyReceived: config.maxDailyReceived,
    sentRemaining: Math.max(0, config.maxDailySent - sentToday),
    receivedRemaining: Math.max(0, config.maxDailyReceived - receivedToday),
  }
}

/**
 * Result of a transfer limit check
 */
export interface TransferLimitCheckResult {
  allowed: boolean
  reason?: 'sender_limit' | 'receiver_limit'
  senderRemaining?: number
  receiverRemaining?: number
}

/**
 * Check if a transfer/tip can proceed given daily limits
 * @param db Database connection
 * @param senderDiscordId Discord ID of the sender
 * @param receiverDiscordId Discord ID of the receiver
 * @param amount Amount being transferred
 */
export function checkTransferLimits(
  db: Database,
  senderDiscordId: string,
  receiverDiscordId: string,
  amount: number
): TransferLimitCheckResult {
  const senderStatus = getDailyTransferStatus(db, senderDiscordId)
  const receiverStatus = getDailyTransferStatus(db, receiverDiscordId)

  // Check if sender can send this amount
  if (senderStatus.sentRemaining < amount) {
    return {
      allowed: false,
      reason: 'sender_limit',
      senderRemaining: senderStatus.sentRemaining,
    }
  }

  // Check if receiver can receive this amount
  if (receiverStatus.receivedRemaining < amount) {
    return {
      allowed: false,
      reason: 'receiver_limit',
      receiverRemaining: receiverStatus.receivedRemaining,
    }
  }

  return { allowed: true }
}

/**
 * Record a sent transfer amount
 */
export function recordDailySent(
  db: Database,
  discordUserId: string,
  amount: number
): void {
  const today = getTodayDateString()

  db.prepare(`
    INSERT INTO user_daily_transfers (discord_id, target_type, amount_today, reset_date)
    VALUES (?, 'sent', ?, ?)
    ON CONFLICT(discord_id, target_type) DO UPDATE SET
      amount_today = CASE 
        WHEN reset_date = ? THEN amount_today + ?
        ELSE ?
      END,
      reset_date = ?
  `).run(discordUserId, amount, today, today, amount, amount, today)

  logger.debug({
    discordUserId,
    amount,
    type: 'sent',
  }, 'Recorded daily sent transfer')
}

/**
 * Record a received transfer amount
 */
export function recordDailyReceived(
  db: Database,
  discordUserId: string,
  amount: number
): void {
  const today = getTodayDateString()

  db.prepare(`
    INSERT INTO user_daily_transfers (discord_id, target_type, amount_today, reset_date)
    VALUES (?, 'received', ?, ?)
    ON CONFLICT(discord_id, target_type) DO UPDATE SET
      amount_today = CASE 
        WHEN reset_date = ? THEN amount_today + ?
        ELSE ?
      END,
      reset_date = ?
  `).run(discordUserId, amount, today, today, amount, amount, today)

  logger.debug({
    discordUserId,
    amount,
    type: 'received',
  }, 'Recorded daily received transfer')
}

/**
 * Record both sent and received for a transfer
 * Call this after a successful transfer/tip
 */
export function recordTransfer(
  db: Database,
  senderDiscordId: string,
  receiverDiscordId: string,
  amount: number
): void {
  recordDailySent(db, senderDiscordId, amount)
  recordDailyReceived(db, receiverDiscordId, amount)
}

/**
 * Cleanup old transfer tracking entries (call periodically)
 * Removes entries older than 7 days to keep the table small
 */
export function cleanupTransferTracking(db: Database): void {
  try {
    const result = db.prepare(`
      DELETE FROM user_daily_transfers 
      WHERE reset_date < date('now', '-7 days')
    `).run()

    if (result.changes > 0) {
      logger.debug({ cleaned: result.changes }, 'Cleaned up old transfer tracking entries')
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup transfer tracking entries')
  }
}

