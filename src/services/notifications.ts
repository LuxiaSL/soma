/**
 * User Notifications Service
 * 
 * Manages in-app notifications for users who haven't opted into DMs
 */

import type { Database } from 'better-sqlite3'
import { generateId } from '../db/connection.js'
import { logger } from '../utils/logger.js'

export type NotificationType = 
  | 'insufficient_funds'
  | 'transfer_received'
  | 'tip_received'
  | 'reward_received'
  | 'bounty_earned'
  | 'grant_received'
  | 'low_balance'
  | 'system'

export interface UserNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  actionHint: string | null  // e.g., "/balance", "View Message"
  actionData: string | null  // e.g., message URL, command to run
  read: boolean
  createdAt: Date
}

interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  action_hint: string | null
  action_data: string | null
  read: number
  created_at: string
}

/**
 * Create a new notification for a user
 */
export function createNotification(
  db: Database,
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  actionHint?: string,
  actionData?: string
): UserNotification {
  const id = generateId()

  db.prepare(`
    INSERT INTO user_notifications (id, user_id, type, title, message, action_hint, action_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, type, title, message, actionHint ?? null, actionData ?? null)

  logger.debug({
    notificationId: id,
    userId,
    type,
    title,
  }, 'Notification created')

  return {
    id,
    userId,
    type,
    title,
    message,
    actionHint: actionHint ?? null,
    actionData: actionData ?? null,
    read: false,
    createdAt: new Date(),
  }
}

/**
 * Get notifications for a user with pagination
 */
export function getNotifications(
  db: Database,
  userId: string,
  options: {
    page?: number
    pageSize?: number
    unreadOnly?: boolean
  } = {}
): { notifications: UserNotification[]; totalCount: number; unreadCount: number } {
  const page = options.page ?? 0
  const pageSize = options.pageSize ?? 10
  const offset = page * pageSize

  // Get total counts
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?
  `).get(userId) as { count: number }

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND read = 0
  `).get(userId) as { count: number }

  // Get notifications
  let query = `
    SELECT id, user_id, type, title, message, action_hint, action_data, read, created_at
    FROM user_notifications
    WHERE user_id = ?
  `

  if (options.unreadOnly) {
    query += ` AND read = 0`
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`

  const rows = db.prepare(query).all(userId, pageSize, offset) as NotificationRow[]

  const notifications = rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    actionHint: row.action_hint,
    actionData: row.action_data,
    read: row.read === 1,
    createdAt: new Date(row.created_at),
  }))

  return {
    notifications,
    totalCount: totalCount.count,
    unreadCount: unreadCount.count,
  }
}

/**
 * Mark a notification as read
 */
export function markNotificationRead(db: Database, notificationId: string, userId: string): boolean {
  const result = db.prepare(`
    UPDATE user_notifications
    SET read = 1
    WHERE id = ? AND user_id = ?
  `).run(notificationId, userId)

  return result.changes > 0
}

/**
 * Mark all notifications as read for a user
 */
export function markAllNotificationsRead(db: Database, userId: string): number {
  const result = db.prepare(`
    UPDATE user_notifications
    SET read = 1
    WHERE user_id = ? AND read = 0
  `).run(userId)

  if (result.changes > 0) {
    logger.debug({
      userId,
      count: result.changes,
    }, 'Marked all notifications as read')
  }

  return result.changes
}

/**
 * Delete old notifications (cleanup job)
 * Keeps last N notifications per user, deletes anything older than maxAge days
 */
export function cleanupOldNotifications(
  db: Database,
  options: {
    maxAge?: number    // Days to keep (default: 30)
    maxPerUser?: number // Max notifications per user (default: 100)
  } = {}
): number {
  const maxAge = options.maxAge ?? 30
  const maxPerUser = options.maxPerUser ?? 100

  // Delete notifications older than maxAge days
  // Format to SQLite's datetime format (YYYY-MM-DD HH:MM:SS) to match datetime('now') storage
  const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
  
  const result1 = db.prepare(`
    DELETE FROM user_notifications
    WHERE created_at < ?
  `).run(cutoffDate)

  // Delete excess notifications per user (keep most recent maxPerUser)
  // This is a bit complex in SQLite, so we do it user by user for users with many notifications
  const usersWithManyNotifications = db.prepare(`
    SELECT user_id, COUNT(*) as count
    FROM user_notifications
    GROUP BY user_id
    HAVING count > ?
  `).all(maxPerUser) as Array<{ user_id: string; count: number }>

  let excessDeleted = 0
  for (const { user_id, count } of usersWithManyNotifications) {
    const excess = count - maxPerUser
    db.prepare(`
      DELETE FROM user_notifications
      WHERE id IN (
        SELECT id FROM user_notifications
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(user_id, excess)
    excessDeleted += excess
  }

  const totalDeleted = result1.changes + excessDeleted

  if (totalDeleted > 0) {
    logger.info({
      oldDeleted: result1.changes,
      excessDeleted,
      totalDeleted,
    }, 'Cleaned up old notifications')
  }

  return totalDeleted
}

/**
 * Get unread notification count for a user (for badges/indicators)
 */
export function getUnreadCount(db: Database, userId: string): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND read = 0
  `).get(userId) as { count: number }

  return result.count
}

// ============================================================================
// Notification Creation Helpers (for common notification types)
// ============================================================================

/**
 * Create an "insufficient funds" notification
 */
export function notifyInsufficientFunds(
  db: Database,
  userId: string,
  botName: string,
  cost: number,
  currentBalance: number
): UserNotification {
  return createNotification(
    db,
    userId,
    'insufficient_funds',
    'Out of Ichor',
    `Tried to summon ${botName} (${cost} ichor) but you only have ${currentBalance.toFixed(1)} ichor.`,
    '/balance',
    'balance'
  )
}

/**
 * Create a "transfer received" notification
 */
export function notifyTransferReceived(
  db: Database,
  userId: string,
  senderName: string,
  amount: number,
  newBalance: number,
  note?: string
): UserNotification {
  const message = note
    ? `${senderName} sent you ${amount} ichor: "${note}". New balance: ${newBalance.toFixed(1)}`
    : `${senderName} sent you ${amount} ichor. New balance: ${newBalance.toFixed(1)}`
  
  return createNotification(
    db,
    userId,
    'transfer_received',
    `Transfer from ${senderName}`,
    message,
    '/balance',
    'balance'
  )
}

/**
 * Create a "tip received" notification
 */
export function notifyTipReceived(
  db: Database,
  userId: string,
  tipperName: string,
  amount: number,
  channelName: string,
  messageUrl?: string
): UserNotification {
  return createNotification(
    db,
    userId,
    'tip_received',
    `Tip from ${tipperName}`,
    `${tipperName} tipped you ${amount} ichor in #${channelName}`,
    messageUrl ? 'View Message' : '/balance',
    messageUrl ?? 'balance'
  )
}

/**
 * Create a "bounty earned" notification
 */
export function notifyBountyEarned(
  db: Database,
  userId: string,
  amount: number,
  starCount: number,
  channelName: string,
  messageUrl?: string
): UserNotification {
  return createNotification(
    db,
    userId,
    'bounty_earned',
    `⭐ Bounty Earned!`,
    `Your message in #${channelName} reached ${starCount} stars! You earned ${amount} ichor.`,
    messageUrl ? 'View Message' : '/balance',
    messageUrl ?? 'balance'
  )
}

