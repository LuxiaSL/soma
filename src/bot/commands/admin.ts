/**
 * /soma Admin Commands
 * 
 * Administrative commands for managing the ichor economy
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { addBalance } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer, updateServerConfig } from '../../services/user.js'
import { updateUserServerRoles, getGlobalEffectiveRegenRate, hasGlobalAdminRole, isAdminUserId } from '../../services/roles.js'
import { generateId } from '../../db/connection.js'
import { createGrantEmbed, Emoji, Colors } from '../embeds/builders.js'
import { EmbedBuilder } from 'discord.js'
import { logger } from '../../utils/logger.js'
import { getGlobalConfig, getDefaultServerConfig } from '../../services/config.js'
import { DEFAULT_SERVER_CONFIG } from '../../types/index.js'

export const somaAdminCommand = new SlashCommandBuilder()
  .setName('soma')
  .setDescription('Soma administration commands')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('grant')
      .setDescription('Grant ichor to a user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to grant ichor to').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('amount').setDescription('Amount of ichor to grant').setRequired(true).setMinValue(1))
      .addStringOption(opt =>
        opt.setName('reason').setDescription('Reason for the grant').setMaxLength(200)))
  .addSubcommand(sub =>
    sub
      .setName('set-cost')
      .setDescription('Set bot activation cost for this server')
      .addUserOption(opt =>
        opt.setName('bot').setDescription('The bot to set cost for').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('cost').setDescription('New cost in ichor').setRequired(true).setMinValue(0))
      .addStringOption(opt =>
        opt.setName('description').setDescription('Bot description for display')))
  .addSubcommand(sub =>
    sub
      .setName('revoke')
      .setDescription('Revoke ichor from a user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to revoke ichor from').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('amount').setDescription('Amount of ichor to revoke').setRequired(true).setMinValue(1))
      .addStringOption(opt =>
        opt.setName('reason').setDescription('Reason for the revocation').setMaxLength(200)))
  .addSubcommand(sub =>
    sub
      .setName('set-role')
      .setDescription('Configure role multipliers')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('Role to configure').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('regen_multiplier').setDescription('Regeneration multiplier (e.g., 2.0 for 2x)').setMinValue(0.1).setMaxValue(10))
      .addNumberOption(opt =>
        opt.setName('cost_multiplier').setDescription('Cost multiplier (e.g., 0.5 for 50% off)').setMinValue(0).setMaxValue(2)))
  .addSubcommand(sub =>
    sub
      .setName('stats')
      .setDescription('View server-wide statistics'))
  .addSubcommand(sub =>
    sub
      .setName('update-user')
      .setDescription('Force refresh a user\'s role cache')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to refresh roles for').setRequired(true)))
  // Config subcommands
  .addSubcommand(sub =>
    sub
      .setName('config-view')
      .setDescription('View current server configuration'))
  .addSubcommand(sub =>
    sub
      .setName('config-rewards-emoji')
      .setDescription('Set reward emoji (one or more emoji that give ichor)')
      .addStringOption(opt =>
        opt.setName('emoji')
          .setDescription('Emoji to use for rewards (space-separated for multiple, e.g. "⭐ 🔥 :custom:")')
          .setRequired(true)))
  .addSubcommand(sub =>
    sub
      .setName('config-rewards-amount')
      .setDescription('Set ichor amount per reward reaction')
      .addNumberOption(opt =>
        opt.setName('amount')
          .setDescription('Ichor per reward reaction')
          .setRequired(true)
          .setMinValue(0.1)
          .setMaxValue(100)))
  .addSubcommand(sub =>
    sub
      .setName('config-tip-emoji')
      .setDescription('Set tip emoji (single emoji for tipping)')
      .addStringOption(opt =>
        opt.setName('emoji')
          .setDescription('Single emoji to use for tips (can be custom server emoji)')
          .setRequired(true)))
  .addSubcommand(sub =>
    sub
      .setName('config-tip-amount')
      .setDescription('Set ichor amount per tip')
      .addNumberOption(opt =>
        opt.setName('amount')
          .setDescription('Ichor transferred per tip')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)))
  .addSubcommand(sub =>
    sub
      .setName('config-reset')
      .setDescription('Reset server configuration to defaults'))

/**
 * Check if user has admin access
 * Checks: SOMA_ADMIN_USERS (user IDs), then SOMA_ADMIN_ROLES (role IDs)
 * Works in both server context (checks current roles) and DMs (checks cached roles)
 */
function hasAdminRole(interaction: ChatInputCommandInteraction, db: Database): boolean {
  // First check if user ID is in admin users list
  if (isAdminUserId(interaction.user.id)) {
    return true
  }

  const adminRoleIds = process.env.SOMA_ADMIN_ROLES?.split(',').map(r => r.trim()).filter(Boolean) || []
  
  // If no admin roles configured, fall back to Discord's Administrator permission
  if (adminRoleIds.length === 0) {
    return true // Let Discord's setDefaultMemberPermissions handle it
  }

  // In server context, check current roles
  const memberRoles = interaction.member?.roles
  if (memberRoles) {
    // Handle both GuildMemberRoleManager (has cache) and string[] (API response)
    if ('cache' in memberRoles) {
      if (memberRoles.cache.some(role => adminRoleIds.includes(role.id))) {
        return true
      }
    } else if (Array.isArray(memberRoles)) {
      if (memberRoles.some(roleId => adminRoleIds.includes(roleId))) {
        return true
      }
    }
  }

  // In DMs or as fallback, check global cached roles
  const user = getOrCreateUser(db, interaction.user.id)
  return hasGlobalAdminRole(db, user.id)
}

export async function executeSomaAdmin(
  interaction: ChatInputCommandInteraction,
  db: Database,
  _client: Client
): Promise<void> {
  // Check for admin role if SOMA_ADMIN_ROLES is configured
  if (!hasAdminRole(interaction, db)) {
    logger.warn({
      userId: interaction.user.id,
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(),
    }, 'Unauthorized admin command attempt')
    
    await interaction.reply({
      content: `${Emoji.CROSS} You don't have permission to use this command.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const subcommand = interaction.options.getSubcommand()

  switch (subcommand) {
    case 'grant':
      await executeGrant(interaction, db)
      break
    case 'revoke':
      await executeRevoke(interaction, db)
      break
    case 'set-cost':
      await executeSetCost(interaction, db)
      break
    case 'set-role':
      await executeSetRole(interaction, db)
      break
    case 'stats':
      await executeStats(interaction, db)
      break
    case 'update-user':
      await executeUpdateUser(interaction, db)
      break
    case 'config-view':
      await executeConfigView(interaction, db)
      break
    case 'config-rewards-emoji':
      await executeConfigRewardsEmoji(interaction, db)
      break
    case 'config-rewards-amount':
      await executeConfigRewardsAmount(interaction, db)
      break
    case 'config-tip-emoji':
      await executeConfigTipEmoji(interaction, db)
      break
    case 'config-tip-amount':
      await executeConfigTipAmount(interaction, db)
      break
    case 'config-reset':
      await executeConfigReset(interaction, db)
      break
    default:
      await interaction.reply({
        content: `${Emoji.CROSS} Unknown subcommand.`,
        flags: MessageFlags.Ephemeral,
      })
  }
}

async function executeGrant(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true)
  const amount = interaction.options.getNumber('amount', true)
  const reason = interaction.options.getString('reason')
  const serverId = interaction.guildId

  // Ensure user exists
  const user = getOrCreateUser(db, targetUser.id)
  
  // Get server if in guild context, otherwise null (for DM grants)
  const server = serverId 
    ? getOrCreateServer(db, serverId, interaction.guild?.name)
    : null

  // Add balance
  const result = addBalance(db, user.id, amount, server?.id ?? null, 'grant', {
    reason,
    grantedBy: interaction.user.id,
  })

  const embed = createGrantEmbed(targetUser.tag, amount, result.balanceAfter, reason ?? undefined)

  logger.info({
    grantedBy: interaction.user.id,
    targetUser: targetUser.id,
    amount,
    reason,
    newBalance: result.balanceAfter,
    fromDM: !serverId,
  }, 'Admin grant executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeRevoke(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true)
  const amount = interaction.options.getNumber('amount', true)
  const reason = interaction.options.getString('reason')
  const serverId = interaction.guildId

  // Ensure user exists
  const user = getOrCreateUser(db, targetUser.id)
  
  // Get server if in guild context, otherwise null (for DM revokes)
  const server = serverId 
    ? getOrCreateServer(db, serverId, interaction.guild?.name)
    : null

  // Revoke balance (use addBalance with negative amount and 'revoke' type)
  const result = addBalance(db, user.id, -amount, server?.id ?? null, 'revoke', {
    reason,
    revokedBy: interaction.user.id,
  })

  const embed = new EmbedBuilder()
    .setColor(Colors.WARNING_ORANGE)
    .setTitle(`${Emoji.REVOKE} Ichor Revoked`)
    .setDescription(`Revoked **${amount} ichor** from **${targetUser.tag}**`)
    .addFields({
      name: 'New balance',
      value: `**${result.balanceAfter.toFixed(1)} ichor**`,
    })
    .setTimestamp()

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason })
  }

  logger.info({
    revokedBy: interaction.user.id,
    targetUser: targetUser.id,
    amount,
    reason,
    newBalance: result.balanceAfter,
    fromDM: !serverId,
  }, 'Admin revoke executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeSetCost(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const botUser = interaction.options.getUser('bot', true)
  const cost = interaction.options.getNumber('cost', true)
  const description = interaction.options.getString('description')
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate that the selected user is a bot
  if (!botUser.bot) {
    await interaction.reply({
      content: `${Emoji.CROSS} **${botUser.tag}** is not a bot. Please select a bot user.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const botId = botUser.id
  const botName = description || botUser.username
  const server = getOrCreateServer(db, serverId, interaction.guild?.name)

  // Check for existing cost
  const existing = db.prepare(`
    SELECT id, base_cost FROM bot_costs
    WHERE bot_discord_id = ? AND server_id = ?
  `).get(botId, server.id) as { id: string; base_cost: number } | undefined

  let previousCost: number | null = null

  if (existing) {
    previousCost = existing.base_cost
    db.prepare(`
      UPDATE bot_costs SET base_cost = ?, description = ?
      WHERE id = ?
    `).run(cost, botName, existing.id)
  } else {
    db.prepare(`
      INSERT INTO bot_costs (id, bot_discord_id, server_id, base_cost, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), botId, server.id, cost, botName)
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Bot Cost Updated`)
    .setDescription(`Set **${botName}** cost to **${cost} ichor** for this server`)
    .setTimestamp()

  if (previousCost !== null) {
    embed.addFields({ name: 'Previous cost', value: `${previousCost} ichor` })
  }

  logger.info({
    setBy: interaction.user.id,
    botId,
    botName,
    cost,
    previousCost,
    serverId: server.id,
  }, 'Admin set-cost executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeSetRole(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const role = interaction.options.getRole('role', true)
  const regenMultiplier = interaction.options.getNumber('regen_multiplier')
  const costMultiplier = interaction.options.getNumber('cost_multiplier')
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (regenMultiplier === null && costMultiplier === null) {
    await interaction.reply({
      content: `${Emoji.CROSS} Please provide at least one multiplier to set.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)

  // Check for existing role config
  const existing = db.prepare(`
    SELECT id FROM role_configs
    WHERE server_id = ? AND role_discord_id = ?
  `).get(server.id, role.id) as { id: string } | undefined

  if (existing) {
    // Update existing
    if (regenMultiplier !== null) {
      db.prepare(`
        UPDATE role_configs SET regen_multiplier = ? WHERE id = ?
      `).run(regenMultiplier, existing.id)
    }
    if (costMultiplier !== null) {
      db.prepare(`
        UPDATE role_configs SET cost_multiplier = ? WHERE id = ?
      `).run(costMultiplier, existing.id)
    }
  } else {
    // Create new
    db.prepare(`
      INSERT INTO role_configs (id, server_id, role_discord_id, regen_multiplier, cost_multiplier)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      generateId(),
      server.id,
      role.id,
      regenMultiplier ?? 1.0,
      costMultiplier ?? 1.0
    )
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Role Configured`)
    .setDescription(`Configured **${role.name}** role:`)
    .setTimestamp()

  if (regenMultiplier !== null) {
    embed.addFields({ name: 'Regeneration', value: `**${regenMultiplier}x** faster`, inline: true })
  }
  if (costMultiplier !== null) {
    const discount = costMultiplier < 1 ? `${Math.round((1 - costMultiplier) * 100)}% off` : `${costMultiplier}x cost`
    embed.addFields({ name: 'Costs', value: `**${discount}**`, inline: true })
  }

  logger.info({
    setBy: interaction.user.id,
    roleId: role.id,
    roleName: role.name,
    regenMultiplier,
    costMultiplier,
    serverId: server.id,
  }, 'Admin set-role executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeStats(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  getOrCreateServer(db, serverId, interaction.guild?.name)

  // Get total users
  const totalUsers = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }

  // Get total ichor in circulation
  const totalIchor = db.prepare(`SELECT SUM(amount) as total FROM balances`).get() as { total: number | null }

  // Get average balance
  const avgBalance = db.prepare(`SELECT AVG(amount) as avg FROM balances`).get() as { avg: number | null }

  // Get 24h activity
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Get active users in last 24h (users who made any transaction)
  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT from_user_id) as count 
    FROM transactions 
    WHERE timestamp >= ?
  `).get(dayAgo) as { count: number }

  const spendCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE type = 'spend' AND timestamp >= ?
  `).get(dayAgo) as { count: number }

  const transferCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE type = 'transfer' AND timestamp >= ?
  `).get(dayAgo) as { count: number }

  const tipCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE type = 'tip' AND timestamp >= ?
  `).get(dayAgo) as { count: number }

  const rewardCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE type = 'reward' AND timestamp >= ?
  `).get(dayAgo) as { count: number }

  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`${Emoji.STATS} Server Statistics`)
    .addFields(
      {
        name: 'Users',
        value: `Total: **${totalUsers.count.toLocaleString()}** | Active (24h): **${activeUsers.count}**`,
      },
      {
        name: 'Ichor Economy',
        value: `Total in circulation: **${(totalIchor.total || 0).toLocaleString()} ichor**\nAverage balance: **${(avgBalance.avg || 0).toFixed(1)} ichor**`,
      },
      {
        name: 'Activity (24h)',
        value: [
          `Bot activations: **${spendCount.count}**`,
          `Transfers: **${transferCount.count}**`,
          `Tips: **${tipCount.count}**`,
          `Rewards: **${rewardCount.count}**`,
        ].join('\n'),
      }
    )
    .setTimestamp()

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeUpdateUser(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true)
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    // Fetch the member to get their current roles
    const guild = interaction.guild!
    const member = await guild.members.fetch(targetUser.id)
    
    // Get role IDs
    const roleIds = Array.from(member.roles.cache.keys())

    // Ensure user and server exist
    const user = getOrCreateUser(db, targetUser.id)
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)

    // Update the role cache
    updateUserServerRoles(db, user.id, server.id, roleIds)

    // Get their new effective regen rate
    const globalRegen = getGlobalEffectiveRegenRate(db, user.id)

    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS_GREEN)
      .setTitle(`${Emoji.CHECK} Role Cache Updated`)
      .setDescription(`Updated role cache for **${targetUser.tag}**`)
      .addFields(
        {
          name: 'Roles cached',
          value: `${roleIds.length} roles in this server`,
          inline: true,
        },
        {
          name: 'Global regen rate',
          value: `**${globalRegen.rate}**/hour (${globalRegen.multiplier}x)`,
          inline: true,
        }
      )
      .setTimestamp()

    if (globalRegen.bestRoleId) {
      const bestRole = member.roles.cache.get(globalRegen.bestRoleId)
      embed.addFields({
        name: 'Best role',
        value: bestRole ? `**${bestRole.name}**` : `Role ID: ${globalRegen.bestRoleId}`,
      })
    }

    logger.info({
      updatedBy: interaction.user.id,
      targetUser: targetUser.id,
      roleCount: roleIds.length,
      effectiveMultiplier: globalRegen.multiplier,
    }, 'Admin update-user executed')

    await interaction.editReply({
      embeds: [embed],
    })

  } catch (error: any) {
    logger.error({ error, targetUser: targetUser.id }, 'Failed to update user roles')
    
    await interaction.editReply({
      content: `${Emoji.CROSS} Failed to fetch user roles: ${error.message || 'Unknown error'}`,
    })
  }
}

// ============================================================================
// Config Subcommands
// ============================================================================

/**
 * Parse emoji from a string (handles both standard and custom Discord emoji)
 * Custom emoji format: <:name:id> or <a:name:id> for animated
 */
function parseEmoji(input: string): string[] {
  const emoji: string[] = []
  
  // Match custom Discord emoji: <:name:id> or <a:name:id>
  const customEmojiRegex = /<a?:\w+:\d+>/g
  const customMatches = input.match(customEmojiRegex) || []
  emoji.push(...customMatches)
  
  // Remove custom emoji from input to find standard emoji
  let remaining = input.replace(customEmojiRegex, ' ')
  
  // Match standard emoji (unicode emoji) - split by whitespace and filter
  const parts = remaining.split(/\s+/).filter(Boolean)
  for (const part of parts) {
    // Basic validation: standard emoji are usually 1-8 characters
    // and don't contain typical text characters
    if (part.length <= 8 && !/^[a-zA-Z0-9_]+$/.test(part)) {
      emoji.push(part)
    }
  }
  
  return emoji
}

/**
 * Format emoji for display (handles both standard and custom)
 */
function formatEmojiList(emoji: string[]): string {
  return emoji.join(' ')
}

async function executeConfigView(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const config = server.config
  const globalConfig = getGlobalConfig()

  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`⚙️ Server Configuration`)
    .setDescription(`Configuration for **${interaction.guild?.name || 'this server'}**`)
    .addFields(
      {
        name: `${Emoji.REWARD} Reward Emoji`,
        value: config.rewardEmoji.length > 0 
          ? formatEmojiList(config.rewardEmoji)
          : '_Not configured_',
        inline: true,
      },
      {
        name: `${Emoji.ICHOR} Reward Amount`,
        value: `**${config.rewardAmount} ichor** per reaction`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: `${Emoji.TIP} Tip Emoji`,
        value: config.tipEmoji || '_Not configured_',
        inline: true,
      },
      {
        name: `${Emoji.ICHOR} Tip Amount`,
        value: `**${config.tipAmount} ichor** per tip`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: '📊 Global Settings (from environment)',
        value: [
          `Base Regen Rate: **${globalConfig.baseRegenRate}**/hour`,
          `Max Balance: **${globalConfig.maxBalance}** ichor`,
          `Starting Balance: **${globalConfig.startingBalance}** ichor`,
        ].join('\n'),
      }
    )
    .setTimestamp()

  // Add modification info if available
  if (config.lastModifiedBy) {
    const modifiedAt = config.lastModifiedAt 
      ? `<t:${Math.floor(new Date(config.lastModifiedAt).getTime() / 1000)}:R>`
      : 'Unknown'
    embed.setFooter({ 
      text: `Last modified by ${config.lastModifiedBy}`,
    })
    embed.addFields({
      name: '📝 Last Modified',
      value: `By <@${config.lastModifiedBy}> ${modifiedAt}`,
    })
  }

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeConfigRewardsEmoji(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId
  const emojiInput = interaction.options.getString('emoji', true)

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const parsedEmoji = parseEmoji(emojiInput)

  if (parsedEmoji.length === 0) {
    await interaction.reply({
      content: `${Emoji.CROSS} No valid emoji found. Please provide at least one emoji (e.g., \`⭐\` or \`:custom_emoji:\`).`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (parsedEmoji.length > 10) {
    await interaction.reply({
      content: `${Emoji.CROSS} Too many emoji! Maximum is 10 reward emoji.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const previousEmoji = server.config.rewardEmoji

  updateServerConfig(db, server.id, { rewardEmoji: parsedEmoji }, interaction.user.id)

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Reward Emoji Updated`)
    .setDescription(`Set reward emoji to: ${formatEmojiList(parsedEmoji)}`)
    .addFields({
      name: 'Previous',
      value: previousEmoji.length > 0 ? formatEmojiList(previousEmoji) : '_Default_',
    })
    .setTimestamp()

  logger.info({
    setBy: interaction.user.id,
    serverId: server.id,
    emoji: parsedEmoji,
    previousEmoji,
  }, 'Config rewards emoji updated')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeConfigRewardsAmount(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId
  const amount = interaction.options.getNumber('amount', true)

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const previousAmount = server.config.rewardAmount

  updateServerConfig(db, server.id, { rewardAmount: amount }, interaction.user.id)

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Reward Amount Updated`)
    .setDescription(`Set reward amount to **${amount} ichor** per reaction`)
    .addFields({
      name: 'Previous',
      value: `${previousAmount} ichor`,
    })
    .setTimestamp()

  logger.info({
    setBy: interaction.user.id,
    serverId: server.id,
    amount,
    previousAmount,
  }, 'Config rewards amount updated')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeConfigTipEmoji(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId
  const emojiInput = interaction.options.getString('emoji', true)

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const parsedEmoji = parseEmoji(emojiInput)

  if (parsedEmoji.length === 0) {
    await interaction.reply({
      content: `${Emoji.CROSS} No valid emoji found. Please provide a single emoji (e.g., \`🫀\` or \`:custom_emoji:\`).`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (parsedEmoji.length > 1) {
    await interaction.reply({
      content: `${Emoji.CROSS} Only one tip emoji is allowed. You provided: ${formatEmojiList(parsedEmoji)}`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const tipEmoji = parsedEmoji[0]
  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const previousEmoji = server.config.tipEmoji

  updateServerConfig(db, server.id, { tipEmoji }, interaction.user.id)

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Tip Emoji Updated`)
    .setDescription(`Set tip emoji to: ${tipEmoji}`)
    .addFields({
      name: 'Previous',
      value: previousEmoji || '_Default_',
    })
    .setTimestamp()

  logger.info({
    setBy: interaction.user.id,
    serverId: server.id,
    emoji: tipEmoji,
    previousEmoji,
  }, 'Config tip emoji updated')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeConfigTipAmount(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId
  const amount = interaction.options.getNumber('amount', true)

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const previousAmount = server.config.tipAmount

  updateServerConfig(db, server.id, { tipAmount: amount }, interaction.user.id)

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Tip Amount Updated`)
    .setDescription(`Set tip amount to **${amount} ichor** per tip`)
    .addFields({
      name: 'Previous',
      value: `${previousAmount} ichor`,
    })
    .setTimestamp()

  logger.info({
    setBy: interaction.user.id,
    serverId: server.id,
    amount,
    previousAmount,
  }, 'Config tip amount updated')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeConfigReset(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const server = getOrCreateServer(db, serverId, interaction.guild?.name)
  const defaults = getDefaultServerConfig()

  // Reset to defaults but preserve server name and add modification tracking
  updateServerConfig(db, server.id, {
    rewardEmoji: defaults.rewardEmoji,
    rewardAmount: defaults.rewardAmount,
    tipEmoji: defaults.tipEmoji,
    tipAmount: defaults.tipAmount,
  }, interaction.user.id)

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Configuration Reset`)
    .setDescription(`Reset server configuration to defaults:`)
    .addFields(
      {
        name: 'Reward Emoji',
        value: formatEmojiList(DEFAULT_SERVER_CONFIG.rewardEmoji),
        inline: true,
      },
      {
        name: 'Reward Amount',
        value: `${DEFAULT_SERVER_CONFIG.rewardAmount} ichor`,
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: 'Tip Emoji',
        value: DEFAULT_SERVER_CONFIG.tipEmoji,
        inline: true,
      },
      {
        name: 'Tip Amount',
        value: `${DEFAULT_SERVER_CONFIG.tipAmount} ichor`,
        inline: true,
      },
    )
    .setTimestamp()

  logger.info({
    resetBy: interaction.user.id,
    serverId: server.id,
  }, 'Config reset to defaults')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

