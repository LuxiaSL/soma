/**
 * /balance Command
 * 
 * Shows the user's ichor balance, regeneration info, and role bonuses
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMemberRoleManager,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getBalance, getEffectiveRegenRateWithRole } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer, extractDiscordUserInfo } from '../../services/user.js'
import { updateUserServerRoles } from '../../services/roles.js'
import { createBalanceEmbed, createBalanceButtons } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

export const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your ichor balance')

export async function executeBalance(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const userId = interaction.user.id
  const serverId = interaction.guildId

  // Ensure user exists and cache their profile info
  const user = getOrCreateUser(db, userId, extractDiscordUserInfo(interaction.user))

  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  // Cache user's roles for this server (for global regen rate calculation)
  if (serverId && userRoles.length > 0) {
    const server = getOrCreateServer(db, serverId, interaction.guild?.name)
    updateUserServerRoles(db, user.id, server.id, userRoles)
  }

  // Fetch balance
  const balanceData = getBalance(db, user.id, serverId ?? undefined, userRoles)

  // Calculate next regen time
  const nextRegenAt = balanceData.balance < balanceData.maxBalance
    ? new Date(Date.now() + (1 / balanceData.effectiveRegenRate) * 60 * 60 * 1000)
    : null

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

  const embed = createBalanceEmbed({
    balance: balanceData.balance,
    maxBalance: balanceData.maxBalance,
    regenRate: balanceData.regenRate,
    effectiveRegenRate: balanceData.effectiveRegenRate,
    nextRegenAt,
    roleBonus,
  })

  const buttons = createBalanceButtons()

  logger.debug({
    userId: user.id,
    balance: balanceData.balance,
    effectiveRegenRate: balanceData.effectiveRegenRate,
  }, 'Balance command executed')

  await interaction.reply({
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  })
}

