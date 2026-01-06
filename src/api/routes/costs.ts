/**
 * Costs Route
 * GET /costs/:serverId
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { GetCostsResponse } from '../../types/api.js'
import { getAllBotCosts } from '../../services/cost.js'
import { getOrCreateServer } from '../../services/user.js'

export function createCostsRouter(db: Database): Router {
  const router = Router()

  router.get('/costs/:serverId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { serverId } = req.params

      // Ensure server exists
      getOrCreateServer(db, serverId)

      // Get all bot costs for this server
      const botCosts = getAllBotCosts(db, serverId)

      const response: GetCostsResponse = {
        bots: botCosts.map(c => ({
          botId: c.botDiscordId,
          name: c.description || c.botDiscordId,
          cost: c.baseCost,
          description: c.description,
        })),
      }

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}
