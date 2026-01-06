/**
 * Button Interaction Handlers
 * 
 * Handles all button click interactions
 */

import {
  type ButtonInteraction,
  type Client,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getBalance, transferBalance } from '../../services/balance.js'
import { getOrCreateUser } from '../../services/user.js'
import {
  createBalanceEmbed,
  createBalanceButtons,
  createHistoryEmbed,
  createPaginationButtons,
  createTransferSuccessEmbed,
  createTransferReceivedEmbed,
  Emoji,
} from '../embeds/builders.js'
import { getHistoryPage } from '../commands/history.js'
import { sendDM } from '../notifications/dm.js'
import { logger } from '../../utils/logger.js'

export async function handleButton(
  interaction: ButtonInteraction,
  db: Database,
  client: Client
): Promise<void> {
  const customId = interaction.customId

  logger.debug({
    customId,
    userId: interaction.user.id,
  }, 'Handling button interaction')

  // Balance refresh
  if (customId === 'balance_refresh') {
    await handleBalanceRefresh(interaction, db)
    return
  }

  // History view (from balance page)
  if (customId === 'history_view') {
    await handleHistoryView(interaction, db)
    return
  }

  // Costs view (from balance page)
  if (customId === 'costs_view') {
    await handleCostsView(interaction, db)
    return
  }

  // History pagination
  if (customId.startsWith('history_prev_') || customId.startsWith('history_next_')) {
    await handleHistoryPagination(interaction, db)
    return
  }

  // Transfer confirm
  if (customId.startsWith('transfer_confirm_')) {
    await handleTransferConfirm(interaction, db, client)
    return
  }

  // Transfer cancel
  if (customId === 'transfer_cancel') {
    await handleTransferCancel(interaction)
    return
  }

  // Unknown button
  logger.warn({ customId }, 'Unknown button customId')
  await interaction.reply({
    content: `${Emoji.CROSS} Unknown button action.`,
    flags: MessageFlags.Ephemeral,
  })
}

async function handleBalanceRefresh(
  interaction: ButtonInteraction,
  db: Database
): Promise<void> {
  const user = getOrCreateUser(db, interaction.user.id)
  const serverId = interaction.guildId

  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  const balanceData = getBalance(db, user.id, serverId ?? undefined, userRoles)

  const nextRegenAt = balanceData.balance < balanceData.maxBalance
    ? new Date(Date.now() + (1 / balanceData.effectiveRegenRate) * 60 * 60 * 1000)
    : null

  const roleBonus = balanceData.effectiveRegenRate > balanceData.regenRate
    ? { multiplier: balanceData.effectiveRegenRate / balanceData.regenRate }
    : undefined

  const embed = createBalanceEmbed({
    balance: balanceData.balance,
    maxBalance: balanceData.maxBalance,
    regenRate: balanceData.regenRate,
    effectiveRegenRate: balanceData.effectiveRegenRate,
    nextRegenAt,
    roleBonus,
  })

  const buttons = createBalanceButtons()

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  })
}

async function handleHistoryView(
  interaction: ButtonInteraction,
  db: Database
): Promise<void> {
  const user = getOrCreateUser(db, interaction.user.id)
  const { transactions, totalPages } = getHistoryPage(db, user.id, 0)

  const embed = createHistoryEmbed(transactions, 0, totalPages)
  const buttons = createPaginationButtons(0, totalPages)

  await interaction.update({
    embeds: [embed],
    components: totalPages > 1 ? [buttons] : [],
  })
}

async function handleCostsView(
  interaction: ButtonInteraction,
  _db: Database
): Promise<void> {
  // Defer to costs command logic by replying with instructions
  await interaction.reply({
    content: `Use \`/costs\` to view bot activation costs.`,
    flags: MessageFlags.Ephemeral,
  })
}

async function handleHistoryPagination(
  interaction: ButtonInteraction,
  db: Database
): Promise<void> {
  const customId = interaction.customId
  const direction = customId.includes('prev') ? -1 : 1
  const currentPage = parseInt(customId.split('_')[2])
  const newPage = currentPage + direction

  const user = getOrCreateUser(db, interaction.user.id)
  const { transactions, totalPages } = getHistoryPage(db, user.id, newPage)

  const embed = createHistoryEmbed(transactions, newPage, totalPages)
  const buttons = createPaginationButtons(newPage, totalPages)

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  })
}

async function handleTransferConfirm(
  interaction: ButtonInteraction,
  db: Database,
  client: Client
): Promise<void> {
  // Parse custom ID: transfer_confirm_{recipientId}_{amount}_{note?}
  const parts = interaction.customId.split('_')
  const recipientId = parts[2]
  const amount = parseFloat(parts[3])
  const note = parts[4] ? decodeURIComponent(parts.slice(4).join('_')) : undefined

  const sender = getOrCreateUser(db, interaction.user.id)
  const recipient = getOrCreateUser(db, recipientId)
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This action can only be performed in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const result = transferBalance(
      db,
      sender.id,
      recipient.id,
      amount,
      serverId,
      note
    )

    // Fetch recipient Discord user for DM
    const recipientDiscord = await client.users.fetch(recipientId)

    // Update sender's message with success
    const successEmbed = createTransferSuccessEmbed(
      recipientDiscord.tag,
      amount,
      result.fromBalanceAfter
    )

    await interaction.update({
      embeds: [successEmbed],
      components: [],
    })

    // DM recipient
    const dmEmbed = createTransferReceivedEmbed(
      interaction.user.tag,
      amount,
      result.toBalanceAfter,
      note
    )

    const dmSent = await sendDM(recipientDiscord, { embeds: [dmEmbed] })

    if (!dmSent) {
      logger.info({
        recipientId,
        amount,
      }, 'Could not DM transfer recipient (DMs disabled)')
    }

    logger.info({
      senderId: sender.id,
      recipientId: recipient.id,
      amount,
      note,
      fromBalance: result.fromBalanceAfter,
      toBalance: result.toBalanceAfter,
    }, 'Transfer completed')

  } catch (error: any) {
    logger.error({ error }, 'Transfer failed')

    await interaction.update({
      content: `${Emoji.CROSS} Transfer failed: ${error.message || 'Unknown error'}`,
      embeds: [],
      components: [],
    })
  }
}

async function handleTransferCancel(
  interaction: ButtonInteraction
): Promise<void> {
  await interaction.update({
    content: `${Emoji.CROSS} Transfer cancelled.`,
    embeds: [],
    components: [],
  })
}

