/**
 * Balance Routes
 * GET /balance/:userId
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { GetBalanceResponse } from '../../types/api.js'
import { getBalance } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { getGlobalConfig } from '../../services/config.js'
import { updateUserServerRoles } from '../../services/roles.js'

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

      // Cache user roles if server context is provided
      if (serverId && userRoles.length > 0) {
        const server = getOrCreateServer(db, serverId)
        updateUserServerRoles(db, user.id, server.id, userRoles)
      }

      // Get balance with regen (uses cached roles globally if no server context)
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
        // Always include effective regen rate (uses cached roles globally)
        effectiveRegenRate: balanceInfo.effectiveRegenRate,
        // Cost multiplier only makes sense in server context
        effectiveCostMultiplier: serverId ? balanceInfo.effectiveCostMultiplier : 1.0,
      }

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}
