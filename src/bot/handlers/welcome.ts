/**
 * Welcome Message Handler
 * 
 * Shows an ephemeral welcome message to users on their first interaction
 */

import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getOrCreateUser, getOrCreateServer, extractDiscordUserInfo } from '../../services/user.js'
import { hasBeenWelcomed, markWelcomed, setDmOptIn } from '../../services/preferences.js'
import { getGlobalConfig, getDefaultServerConfig } from '../../services/config.js'
import { Colors, Emoji, formatRegenRate } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

/**
 * Check if we should show the welcome message and show it if needed
 * Returns true if the welcome message was shown (caller should not continue with their response)
 */
export async function maybeShowWelcome(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<boolean> {
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))
  
  // Check if user has already been welcomed
  if (hasBeenWelcomed(db, user.id)) {
    return false
  }

  // Show welcome message
  await showWelcomeMessage(interaction, db, user.id)
  return true
}

/**
 * Show the welcome message
 */
async function showWelcomeMessage(
  interaction: ChatInputCommandInteraction,
  db: Database,
  userId: string
): Promise<void> {
  const serverId = interaction.guildId
  
  // Get configs
  const globalConfig = getGlobalConfig()
  let serverConfig = getDefaultServerConfig()
  if (serverId) {
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)
    serverConfig = server.config
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.ICHOR} Welcome to Soma!`)
    .setDescription(
      'Soma manages **ichor**, a shared currency for AI bot activations.\n\n' +
      'This is a quick overview to get you started!'
    )
    .addFields(
      {
        name: '💫 What is Ichor?',
        value:
          `• You have **${globalConfig.startingBalance} ichor** to start\n` +
          `• Mentioning AI bots costs ichor\n` +
          `• Ichor regenerates at ${formatRegenRate(globalConfig.baseRegenRate)}\n` +
          `• Max balance: **${globalConfig.maxBalance}** ichor`,
      },
      {
        name: '⚡ Key Commands',
        value:
          '`/balance` — Check your ichor\n' +
          '`/costs` — See bot activation costs\n' +
          '`/help` — Full system guide\n' +
          '`/settings` — Your preferences',
      },
      {
        name: '😀 Emoji Reactions',
        value:
          `**Tip** ${serverConfig.tipEmoji} — Give ${serverConfig.tipAmount} ichor to message author\n` +
          `**Reward** ${serverConfig.rewardEmoji.slice(0, 3).join(' ')} — Free ${serverConfig.rewardAmount} ichor reward`,
      },
      {
        name: '📬 Notifications',
        value:
          'By default, important updates go to your **inbox** (`/notifications`).\n' +
          'You can opt-in to **DMs** if you prefer direct messages.',
      }
    )
    .setFooter({ text: 'This message only appears once. Use /help anytime!' })

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('welcome_continue')
        .setLabel('✨ Got it!')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('welcome_enable_dms')
        .setLabel('🔔 Enable DMs')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('welcome_help')
        .setLabel('📖 Full Guide')
        .setStyle(ButtonStyle.Secondary),
    )

  logger.info({
    userId,
    discordId: interaction.user.id,
  }, 'Showing welcome message to new user')

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Handle welcome message button interactions
 */
export async function handleWelcomeButton(
  customId: string,
  interaction: ButtonInteraction,
  db: Database
): Promise<boolean> {
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))

  if (customId === 'welcome_continue') {
    // Mark as welcomed and dismiss
    markWelcomed(db, user.id)
    
    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS_GREEN)
      .setTitle(`${Emoji.CHECK} You're all set!`)
      .setDescription(
        'Use `/balance` to check your ichor anytime.\n' +
        'Use `/help` if you need a refresher.'
      )

    await interaction.update({
      embeds: [embed],
      components: [],
    })
    return true
  }

  if (customId === 'welcome_enable_dms') {
    // Enable DMs and mark as welcomed
    markWelcomed(db, user.id)
    setDmOptIn(db, user.id, true)

    logger.info({
      userId: user.id,
    }, 'User opted into DMs from welcome screen')

    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS_GREEN)
      .setTitle('🔔 DMs Enabled!')
      .setDescription(
        'You\'ll receive DM notifications for tips, transfers, and alerts.\n\n' +
        'Use `/settings dm` anytime to change this.'
      )

    await interaction.update({
      embeds: [embed],
      components: [],
    })
    return true
  }

  if (customId === 'welcome_help') {
    // Mark as welcomed but redirect to help
    markWelcomed(db, user.id)

    const embed = new EmbedBuilder()
      .setColor(Colors.ICHOR_PURPLE)
      .setTitle(`${Emoji.CHECK} Welcome complete!`)
      .setDescription(
        'Use `/help` to see the full guide anytime.\n\n' +
        '_Tip: `/help topic:commands` shows all available commands!_'
      )

    await interaction.update({
      embeds: [embed],
      components: [],
    })
    return true
  }

  return false
}

