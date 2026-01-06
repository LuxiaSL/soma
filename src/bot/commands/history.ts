/**
 * /history Command
 * 
 * View transaction history with pagination
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import type { TransactionRow } from '../../types/index.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { createHistoryEmbed, createPaginationButtons } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

const ITEMS_PER_PAGE = 10

export const historyCommand = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View your transaction history')
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Number of transactions to show (1-50)')
      .setMinValue(1)
      .setMaxValue(50))

export async function executeHistory(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const limit = interaction.options.getInteger('limit') || ITEMS_PER_PAGE
  const serverId = interaction.guildId

  // Ensure user exists
  const user = getOrCreateUser(db, interaction.user.id)

  // Ensure server exists if in a guild
  if (serverId) {
    getOrCreateServer(db, serverId)
  }

  // Get transaction count for pagination
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE from_user_id = ? OR to_user_id = ?
  `).get(user.id, user.id) as { count: number }

  const totalCount = countRow.count
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

  // Get first page of transactions
  const rows = db.prepare(`
    SELECT * FROM transactions
    WHERE from_user_id = ? OR to_user_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(user.id, user.id, limit) as TransactionRow[]

  // Format transactions
  const transactions = rows.map(row => {
    const isOutgoing = row.from_user_id === user.id
    const amount = row.amount
    const metadata = row.metadata ? JSON.parse(row.metadata) : {}

    let description = formatTransactionDescription(row.type, isOutgoing, metadata, db)

    return {
      type: row.type,
      amount: amount,
      timestamp: new Date(row.timestamp),
      description,
    }
  })

  const embed = createHistoryEmbed(transactions, 0, totalPages)
  const buttons = createPaginationButtons(0, totalPages)

  logger.debug({
    userId: user.id,
    transactionCount: transactions.length,
    totalPages,
  }, 'History command executed')

  await interaction.reply({
    embeds: [embed],
    components: totalPages > 1 ? [buttons] : [],
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Format transaction description based on type
 */
function formatTransactionDescription(
  type: string,
  isOutgoing: boolean,
  metadata: Record<string, any>,
  _db: Database
): string {
  switch (type) {
    case 'spend':
      const botName = metadata.botName || 'Bot'
      return `${botName} activation`

    case 'regen':
      return 'Regeneration'

    case 'reward':
      const rewardEmoji = metadata.emoji || '⭐'
      return `Reaction reward ${rewardEmoji}`

    case 'tip':
      return isOutgoing ? 'Tip given' : 'Tip received'

    case 'transfer':
      if (isOutgoing) {
        const toUser = metadata.toUserDiscordId
          ? `<@${metadata.toUserDiscordId}>`
          : 'user'
        return `Transfer to ${toUser}`
      } else {
        const fromUser = metadata.fromUserDiscordId
          ? `<@${metadata.fromUserDiscordId}>`
          : 'user'
        return `Transfer from ${fromUser}`
      }

    case 'grant':
      return 'Admin grant'

    case 'revoke':
      return 'Admin revoke'

    case 'refund':
      return 'Refund'

    default:
      return type.charAt(0).toUpperCase() + type.slice(1)
  }
}

/**
 * Get a page of transaction history (for button handlers)
 */
export function getHistoryPage(
  db: Database,
  userId: string,
  page: number
): {
  transactions: Array<{
    type: string
    amount: number
    timestamp: Date
    description: string
  }>
  totalPages: number
} {
  // Get transaction count
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE from_user_id = ? OR to_user_id = ?
  `).get(userId, userId) as { count: number }

  const totalCount = countRow.count
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

  // Get page of transactions
  const offset = page * ITEMS_PER_PAGE
  const rows = db.prepare(`
    SELECT * FROM transactions
    WHERE from_user_id = ? OR to_user_id = ?
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(userId, userId, ITEMS_PER_PAGE, offset) as TransactionRow[]

  const transactions = rows.map(row => {
    const isOutgoing = row.from_user_id === userId
    const metadata = row.metadata ? JSON.parse(row.metadata) : {}

    return {
      type: row.type,
      amount: row.amount,
      timestamp: new Date(row.timestamp),
      description: formatTransactionDescription(row.type, isOutgoing, metadata, db),
    }
  })

  return { transactions, totalPages }
}

