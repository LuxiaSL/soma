/**
 * Admin Routes
 * POST /admin/grant
 * POST /admin/set-cost
 * POST /admin/configure
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type {
  AdminGrantRequest,
  AdminGrantResponse,
  AdminSetCostRequest,
  AdminSetCostResponse,
  AdminConfigureRequest,
  AdminConfigureResponse,
} from '../../types/api.js'
import { addBalance } from '../../services/balance.js'
import { setBotCost, setRoleConfig } from '../../services/cost.js'
import { getOrCreateUser, getOrCreateServer, updateServerConfig } from '../../services/user.js'
import { ValidationError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export function createAdminRouter(db: Database): Router {
  const router = Router()

  // Grant credits to a user
  router.post('/admin/grant', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as AdminGrantRequest

      if (!body.userId) {
        throw new ValidationError('Missing required field: userId', 'userId')
      }
      if (!body.serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (body.amount === undefined || body.amount === null) {
        throw new ValidationError('Missing required field: amount', 'amount')
      }
      if (body.amount <= 0) {
        throw new ValidationError('Amount must be positive', 'amount')
      }

      // Ensure user and server exist
      const user = getOrCreateUser(db, body.userId)
      const server = getOrCreateServer(db, body.serverId)

      // Grant credits - use internal server ID for transaction
      const result = addBalance(
        db,
        user.id,
        body.amount,
        server.id,  // Internal server ID for transaction
        'grant',
        body.reason ? { reason: body.reason } : {}
      )

      const response: AdminGrantResponse = {
        success: true,
        transactionId: result.transactionId,
        balanceAfter: Math.round(result.balanceAfter * 100) / 100,
      }

      logger.info({
        userId: body.userId,
        amount: body.amount,
        reason: body.reason,
        transactionId: result.transactionId,
      }, 'Admin grant completed')

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  // Set bot cost
  router.post('/admin/set-cost', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as AdminSetCostRequest

      if (!body.botId) {
        throw new ValidationError('Missing required field: botId', 'botId')
      }
      if (body.cost === undefined || body.cost === null) {
        throw new ValidationError('Missing required field: cost', 'cost')
      }
      if (body.cost < 0) {
        throw new ValidationError('Cost cannot be negative', 'cost')
      }

      // Ensure server exists if server-specific
      if (body.serverId) {
        getOrCreateServer(db, body.serverId)
      }

      const result = setBotCost(db, body.botId, body.serverId || null, body.cost, body.description)

      const response: AdminSetCostResponse = {
        success: true,
        previousCost: result.previousCost,
      }

      logger.info({
        botId: body.botId,
        serverId: body.serverId,
        cost: body.cost,
        previousCost: result.previousCost,
      }, 'Bot cost set')

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  // Configure server
  router.post('/admin/configure', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as AdminConfigureRequest

      if (!body.serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (!body.config || Object.keys(body.config).length === 0) {
        throw new ValidationError('Missing required field: config', 'config')
      }

      // Ensure server exists
      const server = getOrCreateServer(db, body.serverId)

      // Update config
      updateServerConfig(db, server.id, body.config)

      const response: AdminConfigureResponse = {
        success: true,
      }

      logger.info({
        serverId: body.serverId,
        config: body.config,
      }, 'Server configured')

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  // Set balance directly (for testing/admin purposes)
  router.post('/admin/set-balance', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, balance } = req.body

      if (!userId) {
        throw new ValidationError('Missing required field: userId', 'userId')
      }
      if (balance === undefined || balance === null) {
        throw new ValidationError('Missing required field: balance', 'balance')
      }
      if (balance < 0) {
        throw new ValidationError('Balance cannot be negative', 'balance')
      }

      // Ensure user exists
      const user = getOrCreateUser(db, userId)

      // Set balance directly
      db.prepare(`UPDATE balances SET amount = ? WHERE user_id = ?`).run(balance, user.id)

      logger.info({
        userId,
        balance,
      }, 'Admin set balance')

      res.json({ success: true, balance })
    } catch (error) {
      next(error)
    }
  })

  // Set role configuration
  router.post('/admin/set-role', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { serverId, roleId, regenMultiplier, maxBalanceOverride, costMultiplier } = req.body

      if (!serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (!roleId) {
        throw new ValidationError('Missing required field: roleId', 'roleId')
      }

      // Ensure server exists
      getOrCreateServer(db, serverId)

      // Set role config
      setRoleConfig(db, serverId, roleId, {
        regenMultiplier,
        maxBalanceOverride,
        costMultiplier,
      })

      logger.info({
        serverId,
        roleId,
        regenMultiplier,
        maxBalanceOverride,
        costMultiplier,
      }, 'Role config set')

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
