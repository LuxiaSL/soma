/**
 * Embed Builders
 * 
 * Helpers for creating consistent, beautiful embeds
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

/** Soma color palette */
export const Colors = {
  ICHOR_PURPLE: 0x9B59B6,    // Primary embed color
  SUCCESS_GREEN: 0x2ECC71,   // Positive transactions
  WARNING_ORANGE: 0xE67E22,  // Low balance, warnings
  DANGER_RED: 0xE74C3C,      // Insufficient funds, errors
  NEUTRAL_GREY: 0x95A5A6,    // Secondary info
}

/** Emoji vocabulary */
export const Emoji = {
  ICHOR: '💫',
  REGEN: '⏳',
  STATS: '📊',
  HISTORY: '📜',
  COSTS: '💰',
  SPEND: '🔴',
  CREDIT: '🟢',
  TRANSFER_OUT: '🔵',
  TRANSFER_IN: '💜',
  REWARD: '⭐',
  TIP: '🫀',
  GRANT: '🎁',
  REVOKE: '⚠️',
  INSUFFICIENT: '💸',
  DM_FAILED: '📭',
  QUICK: '⚡',
  REFRESH: '🔄',
  CHECK: '✅',
  CROSS: '❌',
}

/**
 * Create a balance embed
 */
export function createBalanceEmbed(data: {
  balance: number
  maxBalance: number
  regenRate: number
  effectiveRegenRate: number
  nextRegenAt: Date | null
  roleBonus?: { multiplier: number; roleName?: string }
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.ICHOR} Your Ichor Balance`)
    .setDescription(`You have **${data.balance.toFixed(1)} ichor**`)
    .addFields(
      {
        name: `${Emoji.REGEN} Regeneration`,
        value: `**${data.effectiveRegenRate}**/hour`,
        inline: true,
      },
      {
        name: `${Emoji.STATS} Maximum`,
        value: `**${data.maxBalance}**`,
        inline: true,
      },
      {
        name: '⏱️ Next Regen',
        value: data.nextRegenAt && data.balance < data.maxBalance
          ? `<t:${Math.floor(data.nextRegenAt.getTime() / 1000)}:R>`
          : 'At maximum',
        inline: true,
      }
    )
    .setFooter({ text: 'Soma Credit System' })
    .setTimestamp()

  // Add role bonus note if applicable
  if (data.roleBonus && data.roleBonus.multiplier > 1) {
    const roleName = data.roleBonus.roleName || 'your role'
    embed.addFields({
      name: '\u200B',
      value: `💡 As a **${roleName}** member, you regenerate ${data.roleBonus.multiplier}x faster!`,
    })
  }

  return embed
}

/**
 * Create balance action buttons
 */
export function createBalanceButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('balance_refresh')
        .setLabel(`${Emoji.REFRESH} Refresh`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('history_view')
        .setLabel(`${Emoji.HISTORY} History`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('costs_view')
        .setLabel(`${Emoji.COSTS} View Costs`)
        .setStyle(ButtonStyle.Primary),
    )
}

/**
 * Create a transaction history embed
 */
export function createHistoryEmbed(
  transactions: Array<{
    type: string
    amount: number
    timestamp: Date
    description: string
  }>,
  page: number,
  totalPages: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.HISTORY} Transaction History`)
    .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
    .setTimestamp()

  if (transactions.length === 0) {
    embed.setDescription('No transactions yet.')
    return embed
  }

  const lines = transactions.map(t => {
    const emoji = getTransactionEmoji(t.type, t.amount)
    const sign = t.amount > 0 ? '+' : ''
    const timestamp = `<t:${Math.floor(t.timestamp.getTime() / 1000)}:R>`
    return `${emoji} **${sign}${t.amount.toFixed(1)}** ${t.description} ${timestamp}`
  })

  embed.setDescription(lines.join('\n'))
  return embed
}

/**
 * Create pagination buttons for history
 */
export function createPaginationButtons(
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`history_prev_${page}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`history_page_${page}`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`history_next_${page}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    )
}

/**
 * Create a costs embed
 */
export function createCostsEmbed(
  bots: Array<{
    name: string
    cost: number
    description: string | null
    canAfford: boolean
  }>,
  userBalance: number,
  discountPercent?: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.COSTS} Bot Activation Costs`)
    .setTimestamp()

  let description = ''
  for (const bot of bots) {
    const affordIcon = bot.canAfford ? Emoji.CHECK : Emoji.CROSS
    description += `**${bot.name}** • ${bot.cost.toFixed(1)} ichor ${affordIcon}\n`
    // Only show description if it's different from the name
    if (bot.description && bot.description !== bot.name) {
      description += `${bot.description}\n`
    }
    description += '\n'
  }

  embed.setDescription(description)

  // Footer with balance info
  let footerText = `${Emoji.ICHOR} Your balance: ${userBalance.toFixed(1)} ichor`
  if (discountPercent && discountPercent > 0) {
    footerText += `\n💎 Role discount: ${discountPercent}% off all bots`
  }
  embed.addFields({ name: '\u200B', value: footerText })

  return embed
}

/**
 * Create costs embed for all servers (DM view)
 */
export function createAllServersCostsEmbed(
  serverCosts: Array<{
    serverName: string
    bots: Array<{ name: string; cost: number }>
  }>,
  userBalance: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.COSTS} Bot Costs Across All Servers`)
    .setTimestamp()

  if (serverCosts.length === 0) {
    embed.setDescription('No bots have been configured in any servers yet.')
    return embed
  }

  for (const server of serverCosts.slice(0, 25)) { // Discord max 25 fields
    const botList = server.bots
      .slice(0, 10) // Limit bots per server
      .map(b => {
        const affordIcon = userBalance >= b.cost ? Emoji.CHECK : Emoji.CROSS
        return `• **${b.name}** • ${b.cost.toFixed(1)} ichor ${affordIcon}`
      })
      .join('\n')

    const moreText = server.bots.length > 10
      ? `\n_...and ${server.bots.length - 10} more_`
      : ''

    embed.addFields({
      name: server.serverName,
      value: botList + moreText || 'No bots configured',
      inline: false,
    })
  }

  embed.setFooter({ text: `${Emoji.ICHOR} Your balance: ${userBalance.toFixed(1)} ichor` })

  return embed
}

/**
 * Create a transfer confirmation embed
 */
export function createTransferConfirmEmbed(
  recipientTag: string,
  amount: number,
  currentBalance: number,
  note?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.ICHOR} Confirm Transfer`)
    .setDescription(`Send **${amount} ichor** to **${recipientTag}**?`)
    .addFields({
      name: 'Your balance',
      value: `${currentBalance.toFixed(1)} → **${(currentBalance - amount).toFixed(1)} ichor**`,
    })

  if (note) {
    embed.addFields({ name: `${Emoji.HISTORY} Note`, value: `"${note}"` })
  }

  return embed
}

/**
 * Create transfer success embed
 */
export function createTransferSuccessEmbed(
  recipientTag: string,
  amount: number,
  newBalance: number
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Transfer Complete`)
    .setDescription(`Sent **${amount} ichor** to **${recipientTag}**`)
    .addFields({
      name: 'Your new balance',
      value: `**${newBalance.toFixed(1)} ichor**`,
    })
    .setTimestamp()
}

/**
 * Create transfer received DM embed
 */
export function createTransferReceivedEmbed(
  senderTag: string,
  amount: number,
  newBalance: number,
  note?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.ICHOR} You Received Ichor!`)
    .setDescription(`**${senderTag}** sent you **${amount} ichor**`)
    .addFields({
      name: 'Your new balance',
      value: `**${newBalance.toFixed(1)} ichor**`,
    })
    .setTimestamp()

  if (note) {
    embed.addFields({ name: `${Emoji.HISTORY} Note`, value: `"${note}"` })
  }

  return embed
}

/**
 * Create tip received DM embed
 */
export function createTipReceivedEmbed(
  tipperTag: string,
  amount: number,
  channelName: string,
  newBalance: number,
  _messageUrl: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.TIP} You Received a Tip!`)
    .setDescription(
      `**${tipperTag}** tipped you **${amount} ichor**\n` +
      `for your message in **#${channelName}**`
    )
    .addFields({
      name: 'Your new balance',
      value: `**${newBalance.toFixed(1)} ichor**`,
    })
    .setTimestamp()
}

/**
 * Create insufficient funds embed (for DMs)
 */
export function createInsufficientFundsEmbed(
  botName: string,
  cost: number,
  currentBalance: number,
  regenRate: number
): EmbedBuilder {
  const timeToAfford = Math.ceil((cost - currentBalance) / regenRate * 60)

  const embed = new EmbedBuilder()
    .setColor(Colors.DANGER_RED)
    .setTitle(`${Emoji.ICHOR} Insufficient Ichor`)
    .setDescription(
      `You tried to summon **${botName}** but you only have ` +
      `**${currentBalance.toFixed(1)} ichor** (costs **${cost}**)`
    )
    .addFields({
      name: `${Emoji.REGEN} Time to afford`,
      value: `~${timeToAfford} minutes`,
      inline: true,
    })
    .setTimestamp()

  return embed
}

/**
 * Create low balance warning embed (for DMs)
 */
export function createLowBalanceEmbed(
  balance: number,
  regenRate: number,
  maxBalance: number,
  affordableBots: Array<{ name: string; cost: number }>
): EmbedBuilder {
  const hoursToFull = Math.ceil((maxBalance - balance) / regenRate)

  const embed = new EmbedBuilder()
    .setColor(Colors.WARNING_ORANGE)
    .setTitle(`${Emoji.REVOKE} Low Ichor Balance`)
    .setDescription(
      `Your ichor balance is running low!\n\n` +
      `Current balance: **${balance.toFixed(1)} ichor**`
    )
    .addFields(
      {
        name: 'You can afford',
        value: affordableBots.length > 0
          ? affordableBots.map(b => `• ${b.name} (${b.cost} ichor)`).join('\n')
          : 'No bots right now',
      },
      {
        name: `${Emoji.REGEN} Regeneration`,
        value: `${regenRate}/hour — full recovery in ~${hoursToFull} hours`,
      }
    )
    .setTimestamp()

  return embed
}

/**
 * Create admin grant success embed
 */
export function createGrantEmbed(
  recipientTag: string,
  amount: number,
  newBalance: number,
  reason?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.GRANT} Ichor Granted`)
    .setDescription(`Granted **${amount} ichor** to **${recipientTag}**`)
    .addFields({
      name: 'New balance',
      value: `**${newBalance.toFixed(1)} ichor**`,
    })
    .setTimestamp()

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason })
  }

  return embed
}

/**
 * Get transaction emoji based on type and amount
 */
function getTransactionEmoji(type: string, amount: number): string {
  switch (type) {
    case 'spend':
      return Emoji.SPEND
    case 'regen':
      return Emoji.CREDIT
    case 'reward':
      return Emoji.REWARD
    case 'tip':
      return Emoji.TIP
    case 'transfer':
      return amount > 0 ? Emoji.TRANSFER_IN : Emoji.TRANSFER_OUT
    case 'grant':
      return Emoji.GRANT
    case 'revoke':
      return Emoji.REVOKE
    case 'refund':
      return Emoji.CREDIT
    default:
      return amount > 0 ? Emoji.CREDIT : Emoji.SPEND
  }
}

