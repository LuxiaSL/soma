/**
 * Transfer Route
 * POST /transfer
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { TransferRequest, TransferResponse } from '../../types/api.js'
import { transferBalance } from '../../services/balance.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'
import { ValidationError, InvalidTransferError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export function createTransferRouter(db: Database): Router {
  const router = Router()

  router.post('/transfer', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as TransferRequest

      // Validate required fields
      if (!body.fromUserId) {
        throw new ValidationError('Missing required field: fromUserId', 'fromUserId')
      }
      if (!body.toUserId) {
        throw new ValidationError('Missing required field: toUserId', 'toUserId')
      }
      if (!body.serverId) {
        throw new ValidationError('Missing required field: serverId', 'serverId')
      }
      if (body.amount === undefined || body.amount === null) {
        throw new ValidationError('Missing required field: amount', 'amount')
      }

      // Validate amount
      if (body.amount <= 0) {
        throw new InvalidTransferError('Amount must be positive')
      }
      if (body.fromUserId === body.toUserId) {
        throw new InvalidTransferError('Cannot transfer to yourself')
      }

      // Ensure users and server exist
      const fromUser = getOrCreateUser(db, body.fromUserId)
      const toUser = getOrCreateUser(db, body.toUserId)
      const server = getOrCreateServer(db, body.serverId)

      // Perform transfer - use internal server ID for transaction
      const result = transferBalance(
        db,
        fromUser.id,
        toUser.id,
        body.amount,
        server.id,  // Internal server ID for transaction
        body.note
      )

      const response: TransferResponse = {
        success: true,
        transactionId: result.transactionId,
        fromBalanceAfter: Math.round(result.fromBalanceAfter * 100) / 100,
        toBalanceAfter: Math.round(result.toBalanceAfter * 100) / 100,
      }

      logger.info({
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount,
        transactionId: result.transactionId,
      }, 'Transfer completed')

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}
