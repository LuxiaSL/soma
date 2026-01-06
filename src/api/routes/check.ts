/**
 * Check and Deduct Route
 * POST /check-and-deduct
 *
 * The primary endpoint for ChapterX integration
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { CheckAndDeductRequest, CheckAndDeductResponse } from '../../types/api.js'
import { getBalance, deductBalance } from '../../services/balance.js'
import { getBotCost, getCheaperAlternatives } from '../../services/cost.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { ValidationError, InsufficientBalanceError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export function createCheckRouter(db: Database): Router {
  const router = Router()

  router.post('/check-and-deduct', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CheckAndDeductRequest

      // Validate required fields
      if (!body.userId) {
        throw new ValidationError('Missing required field: userId', 'userId')
      }
      if (!body.serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (!body.botId) {
        throw new ValidationError('Missing required field: botId', 'botId')
      }
      if (!body.triggerType) {
        throw new ValidationError('Missing required field: triggerType', 'triggerType')
      }

      const userRoles = body.userRoles || []

      // Ensure user and server exist
      const user = getOrCreateUser(db, body.userId)
      const server = getOrCreateServer(db, body.serverId)

      // Get bot cost (with role multipliers) - uses Discord IDs for lookups
      const { cost } = getBotCost(db, body.botId, body.serverId, userRoles)

      // Get current balance - uses internal user ID but Discord server ID for role lookups
      const balanceInfo = getBalance(db, user.id, body.serverId, userRoles)

      // Check if user can afford
      if (balanceInfo.balance < cost) {
        // Calculate time to afford
        const deficit = cost - balanceInfo.balance
        const minutesToAfford = Math.ceil((deficit / balanceInfo.effectiveRegenRate) * 60)

        // Get cheaper alternatives
        const alternatives = getCheaperAlternatives(db, body.botId, body.serverId, cost)

        const response: CheckAndDeductResponse = {
          allowed: false,
          cost,
          currentBalance: Math.round(balanceInfo.balance * 100) / 100,
          regenRate: balanceInfo.effectiveRegenRate,
          timeToAfford: minutesToAfford,
          cheaperAlternatives: alternatives,
        }

        logger.info({
          userId: body.userId,
          botId: body.botId,
          cost,
          balance: balanceInfo.balance,
          triggerType: body.triggerType,
        }, 'Insufficient balance - activation denied')

        // Return 200 with allowed: false (not an error, just insufficient funds)
        res.json(response)
        return
      }

      // Deduct balance - use internal server ID for transaction logging
      try {
        const result = deductBalance(
          db,
          user.id,
          cost,
          server.id,  // Use internal server ID, not Discord ID
          body.serverId,  // Pass Discord ID for role lookups
          userRoles,
          body.botId,
          body.messageId || ''
        )

        const response: CheckAndDeductResponse = {
          allowed: true,
          cost,
          balanceAfter: Math.round(result.balanceAfter * 100) / 100,
          transactionId: result.transactionId,
        }

        logger.info({
          userId: body.userId,
          botId: body.botId,
          cost,
          balanceAfter: result.balanceAfter,
          triggerType: body.triggerType,
          transactionId: result.transactionId,
        }, 'Balance deducted - activation allowed')

        res.json(response)
      } catch (error) {
        if (error instanceof InsufficientBalanceError) {
          // Race condition: balance changed between check and deduct
          // Return insufficient balance response
          const alternatives = getCheaperAlternatives(db, body.botId, body.serverId, cost)
          const response: CheckAndDeductResponse = {
            allowed: false,
            cost,
            currentBalance: error.details?.available as number ?? 0,
            regenRate: balanceInfo.effectiveRegenRate,
            timeToAfford: 60, // Estimate
            cheaperAlternatives: alternatives,
          }
          res.json(response)
          return
        }
        throw error
      }
    } catch (error) {
      next(error)
    }
  })

  return router
}
