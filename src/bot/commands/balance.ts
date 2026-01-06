/**
 * /balance Command
 * 
 * Shows the user's ichor balance, regeneration info, and role bonuses
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getBalance } from '../../services/balance.js'
import { getOrCreateUser } from '../../services/user.js'
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

  // Ensure user exists
  const user = getOrCreateUser(db, userId)

  // Get user's roles for multipliers
  const userRoles: string[] = interaction.member
    ? Array.from((interaction.member.roles as any).cache?.keys?.() || []).map(String)
    : []

  // Fetch balance
  const balanceData = getBalance(db, user.id, serverId ?? undefined, userRoles)

  // Calculate next regen time
  const nextRegenAt = balanceData.balance < balanceData.maxBalance
    ? new Date(Date.now() + (1 / balanceData.effectiveRegenRate) * 60 * 60 * 1000)
    : null

  // Check for role bonus
  const roleBonus = balanceData.effectiveRegenRate > balanceData.regenRate
    ? {
        multiplier: balanceData.effectiveRegenRate / balanceData.regenRate,
      }
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

