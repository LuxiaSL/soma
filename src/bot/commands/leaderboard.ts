/**
 * /leaderboard Command
 * 
 * Shows top community contributors by ichor earned from tips/reactions
 * Includes a "racing game style" view: top N + gap + context around user's rank
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { Colors, Emoji } from '../embeds/builders.js'
import { getOrCreateUser, extractDiscordUserInfo } from '../../services/user.js'
import { logger } from '../../utils/logger.js'

export const leaderboardCommand = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View top community contributors')
  .addIntegerOption(opt =>
    opt
      .setName('limit')
      .setDescription('Number of users to show (5-25)')
      .setMinValue(5)
      .setMaxValue(25)
  )

interface LeaderboardEntry {
  rank: number
  discordId: string
  reactionCount: number
  totalEarned: number
}

/**
 * Get top N leaderboard entries
 */
function getTopLeaderboard(
  db: Database,
  limit: number
): LeaderboardEntry[] {
  const rows = db.prepare(`
    SELECT 
      u.discord_id,
      COUNT(*) as reaction_count,
      SUM(t.amount) as total_earned,
      ROW_NUMBER() OVER (ORDER BY SUM(t.amount) DESC) as rank
    FROM transactions t
    JOIN users u ON t.to_user_id = u.id
    WHERE t.type IN ('reward', 'transfer')
      AND t.to_user_id IS NOT NULL
    GROUP BY t.to_user_id
    ORDER BY total_earned DESC
    LIMIT ?
  `).all(limit) as Array<{ discord_id: string; reaction_count: number; total_earned: number; rank: number }>

  return rows.map(r => ({
    rank: r.rank,
    discordId: r.discord_id,
    reactionCount: r.reaction_count,
    totalEarned: r.total_earned,
  }))
}

/**
 * Get entries around a specific rank (for showing user context)
 * Returns entries from (rank - 1) to (rank + 1)
 */
function getEntriesAroundRank(
  db: Database,
  targetRank: number
): LeaderboardEntry[] {
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT 
        u.discord_id,
        COUNT(*) as reaction_count,
        SUM(t.amount) as total_earned,
        ROW_NUMBER() OVER (ORDER BY SUM(t.amount) DESC) as rank
      FROM transactions t
      JOIN users u ON t.to_user_id = u.id
      WHERE t.type IN ('reward', 'transfer')
        AND t.to_user_id IS NOT NULL
      GROUP BY t.to_user_id
    ) WHERE rank BETWEEN ? AND ?
  `).all(targetRank - 1, targetRank + 1) as Array<{ discord_id: string; reaction_count: number; total_earned: number; rank: number }>

  return rows.map(r => ({
    rank: r.rank,
    discordId: r.discord_id,
    reactionCount: r.reaction_count,
    totalEarned: r.total_earned,
  }))
}

/**
 * Get a user's rank on the leaderboard (by ichor earned)
 */
function getUserRank(db: Database, userDiscordId: string): number | null {
  const result = db.prepare(`
    SELECT rank FROM (
      SELECT 
        u.discord_id, 
        ROW_NUMBER() OVER (ORDER BY SUM(t.amount) DESC) as rank
      FROM transactions t
      JOIN users u ON t.to_user_id = u.id
      WHERE t.type IN ('reward', 'transfer')
        AND t.to_user_id IS NOT NULL
      GROUP BY t.to_user_id
    ) WHERE discord_id = ?
  `).get(userDiscordId) as { rank: number } | undefined

  return result?.rank ?? null
}

/**
 * Format a single leaderboard entry line
 */
function formatEntry(
  entry: LeaderboardEntry,
  isCurrentUser: boolean
): string {
  // Medal for top 3, numbers for rest
  let prefix: string
  if (entry.rank === 1) prefix = '🥇'
  else if (entry.rank === 2) prefix = '🥈'
  else if (entry.rank === 3) prefix = '🥉'
  else prefix = `${entry.rank}.`

  const userMention = `<@${entry.discordId}>`
  const reactionText = entry.reactionCount === 1 ? 'reaction' : 'reactions'
  const statsText = `${entry.reactionCount} ${reactionText}, ${entry.totalEarned.toFixed(1)} ichor earned`
  
  if (isCurrentUser) {
    return `${prefix} **${userMention}** — ${statsText} ← You`
  }
  return `${prefix} ${userMention} — ${statsText}`
}

export async function executeLeaderboard(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? 10

  // Cache the user's profile info
  getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))

  try {
    const topEntries = getTopLeaderboard(db, limit)
    const userRank = getUserRank(db, interaction.user.id)

    if (topEntries.length === 0) {
      await interaction.reply({
        content: `${Emoji.STATS} No community contributions yet! React to messages to start the leaderboard.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Check if user is already in the top list
    const userInTopList = topEntries.some(e => e.discordId === interaction.user.id)

    // Build leaderboard entries
    const lines: string[] = []
    
    // Add top entries
    for (const entry of topEntries) {
      const isCurrentUser = entry.discordId === interaction.user.id
      lines.push(formatEntry(entry, isCurrentUser))
    }

    // If user is not in top list but has a rank, show gap + context around their rank
    if (!userInTopList && userRank !== null && userRank > limit) {
      const contextEntries = getEntriesAroundRank(db, userRank)
      
      // Filter out any entries already shown in top list
      const newEntries = contextEntries.filter(e => e.rank > limit)
      
      if (newEntries.length > 0) {
        // Add visual gap
        lines.push('⋮')
        
        // Add context entries
        for (const entry of newEntries) {
          const isCurrentUser = entry.discordId === interaction.user.id
          lines.push(formatEntry(entry, isCurrentUser))
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.ICHOR_PURPLE)
      .setTitle('🏆 Community Contributors')
      .setDescription(lines.join('\n'))
      .setTimestamp()

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })

    logger.debug({
      userId: interaction.user.id,
      limit,
      userRank,
      entriesShown: lines.length,
    }, 'Leaderboard displayed')

  } catch (error) {
    logger.error({ error }, 'Failed to execute leaderboard command')
    await interaction.reply({
      content: `${Emoji.CROSS} Failed to load leaderboard. Please try again.`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

