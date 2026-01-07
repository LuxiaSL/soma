/**
 * Transaction Service
 * Handles transaction logging (audit trail)
 */

import type { Database } from 'better-sqlite3'
import type { Transaction, TransactionType, TransactionRow } from '../types/index.js'
import { generateId } from '../db/connection.js'
import { logger } from '../utils/logger.js'

export interface CreateTransactionParams {
  serverId: string | null
  type: TransactionType
  fromUserId: string | null
  toUserId: string | null
  botDiscordId?: string
  amount: number
  balanceAfter: number
  metadata?: Record<string, unknown>
}

/**
 * Create a new transaction record
 */
export function createTransaction(
  db: Database,
  params: CreateTransactionParams
): Transaction {
  const id = generateId()
  const metadata = params.metadata || {}

  db.prepare(`
    INSERT INTO transactions (
      id, server_id, type, from_user_id, to_user_id, bot_discord_id, amount, balance_after, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.serverId,
    params.type,
    params.fromUserId,
    params.toUserId,
    params.botDiscordId || null,
    params.amount,
    params.balanceAfter,
    JSON.stringify(metadata)
  )

  logger.debug({
    id,
    type: params.type,
    amount: params.amount,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
  }, 'Created transaction')

  return {
    id,
    timestamp: new Date(),
    serverId: params.serverId,
    type: params.type,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    botDiscordId: params.botDiscordId || null,
    amount: params.amount,
    balanceAfter: params.balanceAfter,
    metadata,
  }
}

/**
 * Get transactions for a user
 */
export function getTransactionsForUser(
  db: Database,
  userId: string,
  serverId?: string,
  limit: number = 20
): Transaction[] {
  let query = `
    SELECT * FROM transactions
    WHERE from_user_id = ? OR to_user_id = ?
  `
  const params: (string | number)[] = [userId, userId]

  if (serverId) {
    query += ' AND server_id = ?'
    params.push(serverId)
  }

  query += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params) as TransactionRow[]

  return rows.map(row => ({
    id: row.id,
    // SQLite datetime('now') returns UTC, append 'Z' so JS Date parses it correctly
    timestamp: new Date(row.timestamp.replace(' ', 'T') + 'Z'),
    serverId: row.server_id,
    type: row.type as TransactionType,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    botDiscordId: row.bot_discord_id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }))
}

/**
 * Get transaction by ID
 */
export function getTransactionById(db: Database, id: string): Transaction | null {
  const row = db.prepare(`
    SELECT * FROM transactions WHERE id = ?
  `).get(id) as TransactionRow | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    // SQLite datetime('now') returns UTC, append 'Z' so JS Date parses it correctly
    timestamp: new Date(row.timestamp.replace(' ', 'T') + 'Z'),
    serverId: row.server_id,
    type: row.type as TransactionType,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    botDiscordId: row.bot_discord_id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }
}
