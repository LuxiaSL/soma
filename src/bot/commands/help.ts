/**
 * /help Command
 * 
 * Comprehensive help and system overview
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getOrCreateServer } from '../../services/user.js'
import { getGlobalConfig, getDefaultServerConfig } from '../../services/config.js'
import { Colors, Emoji } from '../embeds/builders.js'

export const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Learn how to use Soma')
  .addStringOption(opt =>
    opt
      .setName('topic')
      .setDescription('Specific topic to learn about')
      .addChoices(
        { name: '📖 Overview', value: 'overview' },
        { name: '⚡ Commands', value: 'commands' },
        { name: '😀 Emoji Reactions', value: 'reactions' },
        { name: '💰 Ichor Economy', value: 'economy' },
        { name: '⚙️ Settings', value: 'settings' },
      ))

export async function executeHelp(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const topic = interaction.options.getString('topic') ?? 'overview'

  // Get server config for emoji info
  const serverId = interaction.guildId
  let serverConfig = getDefaultServerConfig()
  if (serverId) {
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)
    serverConfig = server.config
  }

  const globalConfig = getGlobalConfig()

  let embed: EmbedBuilder
  let components: ActionRowBuilder<ButtonBuilder>[] = []

  switch (topic) {
    case 'overview':
      embed = createOverviewEmbed(globalConfig, serverConfig)
      components = [createHelpNavButtons('overview')]
      break
    case 'commands':
      embed = createCommandsEmbed()
      components = [createHelpNavButtons('commands')]
      break
    case 'reactions':
      embed = createReactionsEmbed(serverConfig)
      components = [createHelpNavButtons('reactions')]
      break
    case 'economy':
      embed = createEconomyEmbed(globalConfig)
      components = [createHelpNavButtons('economy')]
      break
    case 'settings':
      embed = createSettingsEmbed()
      components = [createHelpNavButtons('settings')]
      break
    default:
      embed = createOverviewEmbed(globalConfig, serverConfig)
      components = [createHelpNavButtons('overview')]
  }

  await interaction.reply({
    embeds: [embed],
    components,
    flags: MessageFlags.Ephemeral,
  })
}

function createOverviewEmbed(globalConfig: any, serverConfig: any): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.ICHOR} Welcome to Soma`)
    .setDescription(
      'Soma is an **ichor economy system** that manages AI bot activations across servers.\n\n' +
      '**How it works:**\n' +
      '• You have a balance of **ichor** (a shared currency)\n' +
      '• Mentioning or replying to AI bots costs ichor\n' +
      '• Ichor regenerates over time automatically\n' +
      '• You can earn extra ichor through tips and rewards'
    )
    .addFields(
      {
        name: '🚀 Quick Start',
        value: 
          '`/balance` — Check your ichor\n' +
          '`/costs` — See bot activation costs\n' +
          '`/help commands` — All available commands',
      },
      {
        name: '📊 Your Economy',
        value:
          `Regeneration: **${globalConfig.baseRegenRate}/hour**\n` +
          `Maximum balance: **${globalConfig.maxBalance}** ichor\n` +
          `Starting balance: **${globalConfig.startingBalance}** ichor`,
        inline: true,
      },
      {
        name: '😀 This Server',
        value:
          `Reward emoji: ${serverConfig.rewardEmoji.join(' ')}\n` +
          `Tip emoji: ${serverConfig.tipEmoji}\n` +
          `Tip amount: ${serverConfig.tipAmount} ichor`,
        inline: true,
      }
    )
    .setFooter({ text: 'Use the buttons below to learn more about specific topics' })
}

function createCommandsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle('⚡ Soma Commands')
    .setDescription('All available slash commands:')
    .addFields(
      {
        name: '📊 Information',
        value:
          '`/balance` — View ichor balance, regen rate, and free rewards remaining\n' +
          '`/costs` — See what each bot costs to activate\n' +
          '`/history` — View your transaction history\n' +
          '`/leaderboard` — See top ichor holders',
      },
      {
        name: '💸 Transactions',
        value:
          '`/transfer @user amount` — Send ichor to another user\n' +
          '_You can also tip users by reacting to their bot messages!_',
      },
      {
        name: '⚙️ Settings & Notifications',
        value:
          '`/settings view` — View your current preferences\n' +
          '`/settings dm` — Toggle DM notifications on/off\n' +
          '`/notifications` — View your notification inbox\n' +
          '`/notifications unread:True` — Show only unread notifications\n' +
          '`/help [topic]` — Get help on a specific topic',
      },
      {
        name: '🔧 Admin Commands (`/soma`)',
        value:
          '**User Management:**\n' +
          '`grant` / `revoke` — Add or remove ichor from users\n' +
          '`update-user` — Refresh a user\'s role cache\n' +
          '`stats` — View server-wide statistics\n\n' +
          '**Bot & Role Config:**\n' +
          '`set-cost` — Set bot activation costs\n' +
          '`set-role` — Configure role multipliers\n\n' +
          '**Server Config:**\n' +
          '`config-view` — View current server settings\n' +
          '`config-rewards-emoji` / `config-rewards-amount`\n' +
          '`config-tip-emoji` / `config-tip-amount`\n' +
          '`config-reset` — Reset to defaults\n\n' +
          '**Global Config:**\n' +
          '`global-view` — View global settings\n' +
          '`global-cost-multiplier` — Adjust all bot costs\n' +
          '`global-reward-cooldown` / `global-max-daily-rewards`',
      }
    )
}

function createReactionsEmbed(serverConfig: any): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle('😀 Emoji Reactions')
    .setDescription(
      'Soma watches for special emoji reactions on **bot messages** to enable tipping and rewards.'
    )
    .addFields(
      {
        name: `${Emoji.TIP} Tipping (${serverConfig.tipEmoji})`,
        value:
          `React with ${serverConfig.tipEmoji} to a bot's message to **tip the person who triggered it**.\n\n` +
          `• Costs you **${serverConfig.tipAmount} ichor**\n` +
          `• That ichor goes directly to the message author\n` +
          `• They'll be notified via DM or their inbox`,
      },
      {
        name: `${Emoji.REWARD} Free Rewards (${serverConfig.rewardEmoji.join(' ')})`,
        value:
          `React with any of these emoji to **give a free reward**:\n` +
          `${serverConfig.rewardEmoji.join(' ')}\n\n` +
          `• Costs you nothing!\n` +
          `• Gives **${serverConfig.rewardAmount} ichor** to the message author\n` +
          `• One reward per message per person\n` +
          `• Subject to daily limits and cooldowns`,
      },
      {
        name: '⏳ Reward Limits',
        value:
          'Free rewards have daily limits and cooldowns to prevent spam.\n' +
          'Check `/balance` to see your remaining rewards and cooldown status.\n' +
          '_Admins can adjust these with `/soma global-*` commands._',
      },
      {
        name: '💡 Other Reactions You Might See',
        value:
          `${Emoji.INSUFFICIENT} **Insufficient funds** — You tried to activate a bot but ran out of ichor\n` +
          `${Emoji.DM_FAILED} **DM unavailable** — Soma couldn't send you a DM (check \`/notifications\` instead)`,
      }
    )
    .setFooter({ text: 'Server admins can customize emoji with /soma config-* commands' })
}

function createEconomyEmbed(globalConfig: any): EmbedBuilder {
  // Format daily rewards display
  const dailyRewardsStr = globalConfig.maxDailyRewards === 0 
    ? 'unlimited' 
    : `**${globalConfig.maxDailyRewards}**`
  
  // Format cooldown display
  const cooldownStr = globalConfig.rewardCooldownMinutes === 0
    ? 'No cooldown between rewards.'
    : globalConfig.rewardCooldownMinutes === 1
      ? 'There\'s a **1 minute** cooldown between rewards.'
      : `There's a **${globalConfig.rewardCooldownMinutes} minute** cooldown between rewards.`

  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle('💰 Ichor Economy')
    .setDescription(
      '**Ichor** is the currency that powers AI bot interactions. ' +
      'Here\'s everything you need to know:'
    )
    .addFields(
      {
        name: '⏳ Regeneration',
        value:
          `Your ichor regenerates automatically at **${globalConfig.baseRegenRate}/hour**.\n` +
          `Maximum balance: **${globalConfig.maxBalance}** ichor\n\n` +
          `_Some roles may have faster regeneration rates!_`,
      },
      {
        name: '💸 Spending',
        value:
          'Ichor is spent when you:\n' +
          '• **Mention** a bot (@BotName)\n' +
          '• **Reply** to a bot\'s message\n' +
          '• **Continue** a conversation (m-continue)\n\n' +
          'Each bot can have different costs. Use `/costs` to check.',
      },
      {
        name: '📈 Earning',
        value:
          'Ways to get more ichor:\n' +
          '• **Wait** for regeneration\n' +
          '• **Receive tips** from other users (costs them ichor)\n' +
          '• **Get rewards** when people react to your bot messages\n' +
          '• **Receive transfers** from generous users\n' +
          '• **Admin grants** for special occasions',
      },
      {
        name: `${Emoji.REWARD} Free Rewards`,
        value:
          `You can give ${dailyRewardsStr} free rewards per day.\n` +
          `${cooldownStr}\n` +
          `One reward per message per person (permanent).\n\n` +
          `_Check your remaining rewards with_ \`/balance\``,
      },
      {
        name: '🎭 Role Benefits',
        value:
          'Server admins can configure special roles that provide:\n' +
          '• Faster ichor regeneration\n' +
          '• Discounts on bot activation costs\n\n' +
          '_Check `/balance` to see if you have any role bonuses!_',
      }
    )

  // Show global cost multiplier if it's not 1.0
  if (globalConfig.globalCostMultiplier !== 1.0) {
    const mult = globalConfig.globalCostMultiplier
    const discountOrSurcharge = mult < 1 
      ? `🎉 **Global Discount Active!** All bots cost **${Math.round((1 - mult) * 100)}% less** right now!`
      : `⚠️ **Global Surcharge Active!** All bots cost **${Math.round((mult - 1) * 100)}% more** right now.`
    embed.addFields({
      name: '🌐 Current Global Pricing',
      value: discountOrSurcharge,
    })
  }

  return embed
}

function createSettingsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle('⚙️ Settings & Notifications')
    .setDescription('Customize how Soma interacts with you.')
    .addFields(
      {
        name: '📬 DM Notifications',
        value:
          'By default, Soma **does not send DMs**. All notifications go to your inbox.\n\n' +
          'If you prefer DM notifications, you can enable them:\n' +
          '`/settings dm` — Toggle DMs on/off\n' +
          '`/settings view` — See your current preferences\n\n' +
          'When DMs are enabled, you\'ll receive messages for:\n' +
          '• Tips received\n' +
          '• Transfers received\n' +
          '• Insufficient funds alerts',
      },
      {
        name: '📥 Notification Inbox',
        value:
          'When DMs are disabled (default), notifications are stored in your inbox.\n\n' +
          '`/notifications` — View your inbox\n' +
          '`/notifications unread:True` — Show only unread\n\n' +
          'Features:\n' +
          '• Pagination for long histories\n' +
          '• Mark all as read button\n' +
          '• Filter toggle between all/unread\n' +
          '• Action hints to guide next steps',
      },
      {
        name: '🔔 Notification Types',
        value:
          '💸 **Insufficient funds** — You tried to activate a bot without enough ichor\n' +
          '💜 **Transfer received** — Someone sent you ichor\n' +
          '🫀 **Tip received** — Someone tipped your bot message\n' +
          '⭐ **Reward received** — Someone rewarded your bot message\n' +
          '🎁 **Grant received** — An admin granted you ichor',
      },
      {
        name: '💡 Tips',
        value:
          '• Emoji reactions on your messages still work regardless of DM settings\n' +
          `• The ${Emoji.INSUFFICIENT} reaction on your message means you were out of ichor\n` +
          '• Check your balance regularly with `/balance`',
      }
    )
}

function createHelpNavButtons(current: string): ActionRowBuilder<ButtonBuilder> {
  const topics = [
    { id: 'overview', label: '📖 Overview', emoji: null },
    { id: 'commands', label: '⚡ Commands', emoji: null },
    { id: 'reactions', label: '😀 Emoji', emoji: null },
    { id: 'economy', label: '💰 Economy', emoji: null },
    { id: 'settings', label: '⚙️ Settings', emoji: null },
  ]

  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      topics.map(topic =>
        new ButtonBuilder()
          .setCustomId(`help_${topic.id}`)
          .setLabel(topic.label)
          .setStyle(topic.id === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(topic.id === current)
      )
    )
}

/**
 * Handle help button navigation
 */
export async function handleHelpButton(
  customId: string,
  interaction: any,
  db: Database
): Promise<boolean> {
  if (!customId.startsWith('help_')) {
    return false
  }

  const topic = customId.replace('help_', '')
  
  // Get server config for emoji info
  const serverId = interaction.guildId
  let serverConfig = getDefaultServerConfig()
  if (serverId) {
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)
    serverConfig = server.config
  }

  const globalConfig = getGlobalConfig()

  let embed: EmbedBuilder

  switch (topic) {
    case 'overview':
      embed = createOverviewEmbed(globalConfig, serverConfig)
      break
    case 'commands':
      embed = createCommandsEmbed()
      break
    case 'reactions':
      embed = createReactionsEmbed(serverConfig)
      break
    case 'economy':
      embed = createEconomyEmbed(globalConfig)
      break
    case 'settings':
      embed = createSettingsEmbed()
      break
    default:
      embed = createOverviewEmbed(globalConfig, serverConfig)
  }

  await interaction.update({
    embeds: [embed],
    components: [createHelpNavButtons(topic)],
  })

  return true
}

