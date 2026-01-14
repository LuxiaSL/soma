/**
 * Button Interaction Handlers
 * 
 * Handles all button click interactions
 */

import {
  type ButtonInteraction,
  type Client,
  type GuildMemberRoleManager,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getBalance, transferBalance, getEffectiveRegenRateWithRole } from '../../services/balance.js'
import { checkTransferLimits, recordTransfer, getDailyTransferStatus } from '../../services/transfer-limits.js'
import { getAllBotCosts, getUserKnownServersCosts } from '../../services/cost.js'
import { getOrCreateUser, getOrCreateServer, extractDiscordUserInfo } from '../../services/user.js'
import { updateUserServerRoles } from '../../services/roles.js'
import { getUserRewardStatus } from './reactions.js'
import {
  createBalanceEmbed,
  createBalanceButtons,
  createHistoryEmbed,
  createPaginationButtons,
  createCostsEmbed,
  createAllServersCostsEmbed,
  createTransferSuccessEmbed,
  createTransferReceivedEmbed,
  Emoji,
} from '../embeds/builders.js'
import { getHistoryPage } from '../commands/history.js'
import { sendDM } from '../notifications/dm.js'
import { handleSettingsButton } from '../commands/settings.js'
import { handleNotificationsButton } from '../commands/notifications.js'
import { handleHelpButton } from '../commands/help.js'
import { handleWelcomeButton } from '../handlers/welcome.js'
import { isDmOptedIn } from '../../services/preferences.js'
import { notifyTransferReceived } from '../../services/notifications.js'
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

  // Balance view (from insufficient funds DM)
  if (customId === 'balance_view') {
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

  // Settings buttons
  if (await handleSettingsButton(customId, interaction, db)) {
    return
  }

  // Notifications buttons
  if (await handleNotificationsButton(customId, interaction, db)) {
    return
  }

  // Help navigation buttons
  if (await handleHelpButton(customId, interaction, db)) {
    return
  }

  // Welcome buttons
  if (await handleWelcomeButton(customId, interaction, db)) {
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
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
  const serverId = interaction.guildId

  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  // Cache user's roles for this server (for global regen rate calculation)
  if (serverId && userRoles.length > 0) {
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)
    updateUserServerRoles(db, user.id, server.id, userRoles)
  }

  const balanceData = getBalance(db, user.id, serverId ?? undefined, userRoles)

  // Check for role bonus and look up the role name
  let roleBonus: { multiplier: number; roleName?: string } | undefined = undefined
  if (balanceData.effectiveRegenRate > balanceData.regenRate && serverId) {
    const regenInfo = getEffectiveRegenRateWithRole(db, serverId, userRoles)
    if (regenInfo.roleId && regenInfo.multiplier > 1) {
      // Look up the role name from Discord
      let roleName: string | undefined = undefined
      const memberRoles = interaction.member?.roles
      if (memberRoles && 'cache' in memberRoles) {
        const role = (memberRoles as GuildMemberRoleManager).cache.get(regenInfo.roleId)
        roleName = role?.name
      }
      roleBonus = {
        multiplier: regenInfo.multiplier,
        roleName,
      }
    }
  }

  // Get reward status info
  const rewardStatus = getUserRewardStatus(interaction.user.id)

  const embed = createBalanceEmbed({
    balance: balanceData.balance,
    maxBalance: balanceData.maxBalance,
    regenRate: balanceData.regenRate,
    effectiveRegenRate: balanceData.effectiveRegenRate,
    roleBonus,
    rewardStatus: {
      rewardsRemaining: rewardStatus.rewardsRemaining,
      maxDailyRewards: rewardStatus.maxDailyRewards,
      cooldownRemainingSeconds: rewardStatus.cooldownRemainingSeconds,
      nextRewardAt: rewardStatus.nextRewardAt,
    },
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
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
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
  db: Database
): Promise<void> {
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
  const serverId = interaction.guildId

  // In DMs: show costs only from servers the user is known to be in
  if (!serverId) {
    const knownServersCosts = getUserKnownServersCosts(db, user.id)
    const balanceData = getBalance(db, user.id)

    if (knownServersCosts.length === 0) {
      await interaction.update({
        content: '❌ No bot costs found. Use `/costs` in a server first to see costs there.',
        embeds: [],
        components: [],
      })
      return
    }

    const embed = createAllServersCostsEmbed(knownServersCosts, balanceData.balance)

    await interaction.update({
      embeds: [embed],
      components: [], // Remove buttons after showing costs
    })
    return
  }

  // In server: show this server's costs with role discounts
  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  // Ensure server exists
  getOrCreateServer(db, serverId)

  // Get balance and costs
  const balanceData = getBalance(db, user.id, serverId, userRoles)
  const costs = getAllBotCosts(db, serverId)

  // Apply cost multiplier and check affordability
  const bots = costs.map(c => {
    const effectiveCost = Math.round(c.baseCost * balanceData.effectiveCostMultiplier * 100) / 100
    return {
      name: c.description || c.botDiscordId,
      cost: effectiveCost,
      description: null, // Don't duplicate - it's already in the name
      canAfford: balanceData.balance >= effectiveCost,
    }
  })

  // Calculate discount percentage if applicable
  const discountPercent = balanceData.effectiveCostMultiplier < 1
    ? Math.round((1 - balanceData.effectiveCostMultiplier) * 100)
    : undefined

  const embed = createCostsEmbed(bots, balanceData.balance, discountPercent)

  await interaction.update({
    embeds: [embed],
    components: [], // Remove buttons after showing costs
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

  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
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

  const sender = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
  // Recipient info will be updated when they interact with the bot
  const recipient = getOrCreateUser(db, recipientId)
  const guildId = interaction.guildId

  if (!guildId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This action can only be performed in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Check daily transfer limits
  const limitCheck = checkTransferLimits(db, interaction.user.id, recipientId, amount)
  if (!limitCheck.allowed) {
    if (limitCheck.reason === 'sender_limit') {
      const status = getDailyTransferStatus(db, interaction.user.id)
      await interaction.update({
        content: `${Emoji.CROSS} **Daily send limit reached.**\nYou can send up to **${status.maxDailySent} ichor** per day.\nYou've sent **${status.sentToday.toFixed(1)}** today (**${status.sentRemaining.toFixed(1)}** remaining).`,
        embeds: [],
        components: [],
      })
    } else {
      const status = getDailyTransferStatus(db, recipientId)
      await interaction.update({
        content: `${Emoji.CROSS} **Recipient's daily receive limit reached.**\nUsers can receive up to **${status.maxDailyReceived} ichor** per day.\nThey've received **${status.receivedToday.toFixed(1)}** today (**${status.receivedRemaining.toFixed(1)}** remaining).`,
        embeds: [],
        components: [],
      })
    }
    return
  }

  // Get internal server ID for transaction logging
  const server = getOrCreateServer(db, guildId)

  try {
    const result = transferBalance(
      db,
      sender.id,
      recipient.id,
      amount,
      server.id,  // Use internal server UUID, not Discord guild ID
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

    // Record the transfer against daily limits
    recordTransfer(db, interaction.user.id, recipientId, amount)

    await interaction.update({
      embeds: [successEmbed],
      components: [],
    })

    // Check if recipient has opted into DMs
    const dmOptedIn = isDmOptedIn(db, recipient.id)
    let dmSent = false

    if (dmOptedIn) {
      // DM recipient
      const dmEmbed = createTransferReceivedEmbed(
        interaction.user.tag,
        amount,
        result.toBalanceAfter,
        note
      )

      dmSent = await sendDM(recipientDiscord, { embeds: [dmEmbed] })

      if (dmSent) {
        logger.debug({
          recipientId,
          amount,
        }, 'Sent transfer received DM')
      }
    }

    // If DMs not enabled or failed, store notification in inbox
    if (!dmSent) {
      notifyTransferReceived(
        db,
        recipient.id,
        interaction.user.tag,
        amount,
        result.toBalanceAfter,
        note
      )
      
      logger.debug({
        recipientId: recipient.id,
        dmOptedIn,
      }, 'Stored transfer notification in inbox')
    }

    logger.info({
      senderId: sender.id,
      recipientId: recipient.id,
      amount,
      note,
      fromBalance: result.fromBalanceAfter,
      toBalance: result.toBalanceAfter,
      notificationMethod: dmSent ? 'dm' : 'inbox',
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

