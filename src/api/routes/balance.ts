/**
 * Balance Routes
 * GET /balance/:userId
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { GetBalanceResponse } from '../../types/api.js'
import { getBalance } from '../../services/balance.js'
import { getOrCreateUser } from '../../services/user.js'
import { getGlobalConfig } from '../../services/config.js'

export function createBalanceRouter(db: Database): Router {
  const router = Router()

  router.get('/balance/:userId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params
      const serverId = req.query.serverId as string | undefined
      const userRolesParam = req.query.userRoles as string | undefined
      const userRoles = userRolesParam ? userRolesParam.split(',') : []

      // Ensure user exists
      const user = getOrCreateUser(db, userId)

      // Get balance with regen
      const balanceInfo = getBalance(db, user.id, serverId, userRoles)
      const globalConfig = getGlobalConfig()

      // Calculate next regen time (when will balance increase by 1)
      // If at max balance, regen is paused - use null to indicate this
      const isAtMax = balanceInfo.balance >= balanceInfo.maxBalance
      const hoursUntilNextRegen = isAtMax ? 0 : 1 / balanceInfo.effectiveRegenRate
      const nextRegenAt = isAtMax
        ? null
        : new Date(Date.now() + hoursUntilNextRegen * 60 * 60 * 1000)

      const response: GetBalanceResponse = {
        balance: Math.round(balanceInfo.balance * 100) / 100,
        maxBalance: balanceInfo.maxBalance,
        regenRate: globalConfig.baseRegenRate,
        nextRegenAt: nextRegenAt?.toISOString() ?? null,
      }

      // Include effective rates if server context provided
      if (serverId) {
        response.effectiveRegenRate = balanceInfo.effectiveRegenRate
        response.effectiveCostMultiplier = balanceInfo.effectiveCostMultiplier
      }

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}
