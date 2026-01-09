/**
 * Leaderboard API Routes
 * 
 * GET /api/v1/leaderboard - Get top contributors by ichor earned
 */

import { Router } from 'express'
import type { Database } from 'better-sqlite3'

export function createLeaderboardRoutes(db: Database): Router {
  const router = Router()

  /**
   * GET /leaderboard
   * Get top contributors ranked by ichor earned from tips and reactions
   * 
   * Query params:
   * - limit: number (default: 10, max: 100)
   */
  router.get('/', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100)

      const entries = db.prepare(`
        SELECT 
          u.discord_id,
          u.username,
          u.display_name,
          u.avatar_hash,
          COUNT(*) as contribution_count,
          SUM(t.amount) as total_earned,
          ROW_NUMBER() OVER (ORDER BY SUM(t.amount) DESC) as rank
        FROM transactions t
        JOIN users u ON t.to_user_id = u.id
        WHERE t.type IN ('reward', 'transfer', 'tip')
          AND t.to_user_id IS NOT NULL
        GROUP BY t.to_user_id
        ORDER BY total_earned DESC
        LIMIT ?
      `).all(limit) as Array<{
        discord_id: string
        username: string | null
        display_name: string | null
        avatar_hash: string | null
        contribution_count: number
        total_earned: number
        rank: number
      }>

      res.json({
        entries: entries.map(e => ({
          rank: e.rank,
          discordId: e.discord_id,
          username: e.username,
          displayName: e.display_name,
          avatarHash: e.avatar_hash,
          contributionCount: e.contribution_count,
          totalEarned: e.total_earned,
        })),
        limit,
      })
    } catch (error) {
      console.error('Leaderboard error:', error)
      res.status(500).json({ error: 'Failed to fetch leaderboard' })
    }
  })

  return router
}

