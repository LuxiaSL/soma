/**
 * /transfer Command
 * 
 * Send ichor to another user with confirmation flow
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getBalance } from '../../services/balance.js'
import { getOrCreateUser } from '../../services/user.js'
import { createTransferConfirmEmbed, Emoji } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

export const transferCommand = new SlashCommandBuilder()
  .setName('transfer')
  .setDescription('Send ichor to another user')
  .addUserOption(option =>
    option
      .setName('recipient')
      .setDescription('User to send ichor to')
      .setRequired(true))
  .addNumberOption(option =>
    option
      .setName('amount')
      .setDescription('Amount of ichor to send')
      .setRequired(true)
      .setMinValue(1))
  .addStringOption(option =>
    option
      .setName('note')
      .setDescription('Optional note for the transfer')
      .setMaxLength(200))

export async function executeTransfer(
  interaction: ChatInputCommandInteraction,
  db: Database,
  _client: Client
): Promise<void> {
  const recipient = interaction.options.getUser('recipient', true)
  const amount = interaction.options.getNumber('amount', true)
  const note = interaction.options.getString('note')

  // Validation: Can't transfer to yourself
  if (recipient.id === interaction.user.id) {
    await interaction.reply({
      content: `${Emoji.CROSS} You cannot transfer ichor to yourself.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validation: Can't transfer to a bot
  if (recipient.bot) {
    await interaction.reply({
      content: `${Emoji.CROSS} You cannot transfer ichor to a bot.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Ensure sender exists
  const sender = getOrCreateUser(db, interaction.user.id)

  // Check sender balance
  const balanceData = getBalance(db, sender.id)

  if (balanceData.balance < amount) {
    await interaction.reply({
      content: `${Emoji.CROSS} Insufficient balance. You have **${balanceData.balance.toFixed(1)} ichor** but tried to send **${amount}**.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Show confirmation
  const embed = createTransferConfirmEmbed(
    recipient.tag,
    amount,
    balanceData.balance,
    note ?? undefined
  )

  // Encode transfer details in button custom ID
  // Format: transfer_confirm_{recipientId}_{amount}_{note}
  const confirmId = note
    ? `transfer_confirm_${recipient.id}_${amount}_${encodeURIComponent(note)}`
    : `transfer_confirm_${recipient.id}_${amount}`

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(`${Emoji.CHECK} Confirm`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('transfer_cancel')
        .setLabel(`${Emoji.CROSS} Cancel`)
        .setStyle(ButtonStyle.Secondary),
    )

  logger.debug({
    senderId: sender.id,
    recipientId: recipient.id,
    amount,
    hasNote: !!note,
  }, 'Transfer confirmation shown')

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  })
}

