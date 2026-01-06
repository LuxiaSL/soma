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
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { generateId } from '../../db/connection.js'
import { createGrantEmbed, Emoji, Colors } from '../embeds/builders.js'
import { EmbedBuilder } from 'discord.js'
import { logger } from '../../utils/logger.js'

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
      .addStringOption(opt =>
        opt.setName('bot').setDescription('Bot ID or name').setRequired(true))
      .addNumberOption(opt =>
        opt.setName('cost').setDescription('New cost in ichor').setRequired(true).setMinValue(0))
      .addStringOption(opt =>
        opt.setName('description').setDescription('Bot description for display')))
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

export async function executeSomaAdmin(
  interaction: ChatInputCommandInteraction,
  db: Database,
  _client: Client
): Promise<void> {
  const subcommand = interaction.options.getSubcommand()

  switch (subcommand) {
    case 'grant':
      await executeGrant(interaction, db)
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

  if (!serverId) {
    await interaction.reply({
      content: `${Emoji.CROSS} This command can only be used in a server.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Ensure user and server exist
  const user = getOrCreateUser(db, targetUser.id)
  const server = getOrCreateServer(db, serverId)

  // Add balance
  const result = addBalance(db, user.id, amount, server.id, 'grant', {
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
  }, 'Admin grant executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function executeSetCost(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const botId = interaction.options.getString('bot', true)
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

  const server = getOrCreateServer(db, serverId)

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
    `).run(cost, description, existing.id)
  } else {
    db.prepare(`
      INSERT INTO bot_costs (id, bot_discord_id, server_id, base_cost, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), botId, server.id, cost, description)
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS_GREEN)
    .setTitle(`${Emoji.CHECK} Bot Cost Updated`)
    .setDescription(`Set **${description || botId}** cost to **${cost} ichor** for this server`)
    .setTimestamp()

  if (previousCost !== null) {
    embed.addFields({ name: 'Previous cost', value: `${previousCost} ichor` })
  }

  logger.info({
    setBy: interaction.user.id,
    botId,
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

  const server = getOrCreateServer(db, serverId)

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

  getOrCreateServer(db, serverId)

  // Get total users
  const userCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }

  // Get total ichor in circulation
  const totalIchor = db.prepare(`SELECT SUM(amount) as total FROM balances`).get() as { total: number | null }

  // Get average balance
  const avgBalance = db.prepare(`SELECT AVG(amount) as avg FROM balances`).get() as { avg: number | null }

  // Get 24h activity
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

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
        value: `Total: **${userCount.count.toLocaleString()}**`,
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

