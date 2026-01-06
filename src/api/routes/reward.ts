/**
 * Reward Route
 * POST /reward
 *
 * Handles reaction rewards and tips
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { RewardRequest, RewardResponse } from '../../types/api.js'
import { addBalance, deductBalance, getBalance } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { ValidationError, InsufficientBalanceError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export function createRewardRouter(db: Database): Router {
  const router = Router()

  router.post('/reward', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RewardRequest

      // Validate required fields
      if (!body.serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (!body.originUserId) {
        throw new ValidationError('Missing required field: originUserId', 'originUserId')
      }
      if (!body.reactorUserId) {
        throw new ValidationError('Missing required field: reactorUserId', 'reactorUserId')
      }
      if (!body.emoji) {
        throw new ValidationError('Missing required field: emoji', 'emoji')
      }

      // Ensure users and server exist
      const originUser = getOrCreateUser(db, body.originUserId)
      const reactorUser = getOrCreateUser(db, body.reactorUserId)
      const server = getOrCreateServer(db, body.serverId)

      // Get server config for reward/tip amounts
      const config = server.config
      let amount: number

      if (body.isTip) {
        // Tips: reactor pays to origin
        if (body.emoji !== config.tipEmoji) {
          throw new ValidationError(`Invalid tip emoji. Expected: ${config.tipEmoji}`, 'emoji')
        }

        amount = config.tipAmount

        // Check reactor can afford
        const reactorBalance = getBalance(db, reactorUser.id, body.serverId, [])
        if (reactorBalance.balance < amount) {
          throw new InsufficientBalanceError(amount, reactorBalance.balance)
        }

        // Deduct from reactor - use internal server ID for transaction
        const deductResult = deductBalance(
          db,
          reactorUser.id,
          amount,
          server.id,      // Internal server ID for transaction
          body.serverId,  // Discord server ID for role lookups
          [],
          '', // No bot
          body.messageId || ''
        )

        // Add to origin - use internal server ID for transaction
        const addResult = addBalance(
          db,
          originUser.id,
          amount,
          server.id,  // Internal server ID for transaction
          'tip',
          { messageId: body.messageId, fromUserId: body.reactorUserId }
        )

        const response: RewardResponse = {
          success: true,
          amount,
          originBalanceAfter: Math.round(addResult.balanceAfter * 100) / 100,
          reactorBalanceAfter: Math.round(deductResult.balanceAfter * 100) / 100,
        }

        logger.info({
          originUserId: body.originUserId,
          reactorUserId: body.reactorUserId,
          amount,
          type: 'tip',
        }, 'Tip processed')

        res.json(response)
      } else {
        // Rewards: just add to origin (free ichor)
        if (!config.rewardEmoji.includes(body.emoji)) {
          throw new ValidationError(
            `Invalid reward emoji. Expected one of: ${config.rewardEmoji.join(', ')}`,
            'emoji'
          )
        }

        amount = config.rewardAmount

        const addResult = addBalance(
          db,
          originUser.id,
          amount,
          server.id,  // Internal server ID for transaction
          'reward',
          { messageId: body.messageId, reactorUserId: body.reactorUserId, emoji: body.emoji }
        )

        const response: RewardResponse = {
          success: true,
          amount,
          originBalanceAfter: Math.round(addResult.balanceAfter * 100) / 100,
        }

        logger.info({
          originUserId: body.originUserId,
          reactorUserId: body.reactorUserId,
          amount,
          emoji: body.emoji,
          type: 'reward',
        }, 'Reward processed')

        res.json(response)
      }
    } catch (error) {
      next(error)
    }
  })

  return router
}
