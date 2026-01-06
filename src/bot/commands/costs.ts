/**
 * /costs Command
 * 
 * View bot activation costs for the server
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import type { BotCostRow } from '../../types/index.js'
import { getBalance, getEffectiveCostMultiplier } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { createCostsEmbed } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

export const costsCommand = new SlashCommandBuilder()
  .setName('costs')
  .setDescription('View bot activation costs')
  .addStringOption(option =>
    option
      .setName('bot')
      .setDescription('Specific bot to show')
      .setAutocomplete(true))

export async function executeCosts(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const serverId = interaction.guildId
  const specificBot = interaction.options.getString('bot')

  if (!serverId) {
    await interaction.reply({
      content: '❌ This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Ensure user and server exist
  const user = getOrCreateUser(db, interaction.user.id)
  const server = getOrCreateServer(db, serverId)

  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  // Get balance and cost multiplier
  const balanceData = getBalance(db, user.id, serverId, userRoles)
  const costMultiplier = getEffectiveCostMultiplier(db, serverId, userRoles)

  // Get bot costs for this server
  let query = `
    SELECT 
      bc.bot_discord_id,
      bc.base_cost,
      bc.description,
      COALESCE(bc.description, bc.bot_discord_id) as name
    FROM bot_costs bc
    WHERE bc.server_id = ? OR bc.server_id IS NULL
    ORDER BY bc.base_cost ASC
  `
  const params: any[] = [server.id]

  if (specificBot) {
    query = `
      SELECT 
        bc.bot_discord_id,
        bc.base_cost,
        bc.description,
        COALESCE(bc.description, bc.bot_discord_id) as name
      FROM bot_costs bc
      WHERE (bc.server_id = ? OR bc.server_id IS NULL)
      AND (bc.bot_discord_id = ? OR bc.description LIKE ?)
      ORDER BY bc.base_cost ASC
    `
    params.push(specificBot, `%${specificBot}%`)
  }

  const costs = db.prepare(query).all(...params) as (BotCostRow & { name: string })[]

  if (costs.length === 0) {
    await interaction.reply({
      content: specificBot
        ? `❌ No bot found matching "${specificBot}".`
        : '❌ No bots have been configured for this server yet. Ask an admin to run `/soma set-cost`.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Calculate effective costs and affordability
  const bots = costs.map(bot => {
    const effectiveCost = bot.base_cost * costMultiplier
    return {
      name: bot.name || bot.bot_discord_id,
      cost: effectiveCost,
      description: bot.description,
      canAfford: balanceData.balance >= effectiveCost,
    }
  })

  // Calculate discount percentage
  const discountPercent = costMultiplier < 1
    ? Math.round((1 - costMultiplier) * 100)
    : undefined

  const embed = createCostsEmbed(bots, balanceData.balance, discountPercent)

  logger.debug({
    userId: user.id,
    serverId: server.id,
    botCount: bots.length,
    costMultiplier,
  }, 'Costs command executed')

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

