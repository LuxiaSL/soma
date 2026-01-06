/**
 * Refund Route
 * POST /refund
 *
 * Refunds a previous transaction when inference fails
 * This ensures users aren't charged for failed bot activations
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { RefundRequest, RefundResponse } from '../../types/api.js'
import { getTransactionById, createTransaction } from '../../services/transaction.js'
import { ValidationError, NotFoundError, ConflictError } from '../../utils/errors.js'
import { logger } from '../../utils/logger.js'

export function createRefundRouter(db: Database): Router {
  const router = Router()

  router.post('/refund', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RefundRequest

      // Validate required fields
      if (!body.transactionId) {
        throw new ValidationError('Missing required field: transactionId', 'transactionId')
      }

      // Get the original transaction
      const originalTx = getTransactionById(db, body.transactionId)
      if (!originalTx) {
        throw new NotFoundError('Transaction not found', 'transaction')
      }

      // Verify it's a spend transaction (bot activation)
      if (originalTx.type !== 'spend') {
        throw new ValidationError(
          `Cannot refund transaction of type '${originalTx.type}'. Only 'spend' transactions can be refunded.`,
          'transactionId'
        )
      }

      // Check if already refunded (look for a refund tx referencing this one)
      const existingRefund = db.prepare(`
        SELECT id FROM transactions 
        WHERE type = 'refund' 
        AND metadata LIKE ?
      `).get(`%"originalTransactionId":"${body.transactionId}"%`)

      if (existingRefund) {
        throw new ConflictError('Transaction has already been refunded')
      }

      // Get the user's current balance
      const userBalance = db.prepare(`
        SELECT amount FROM balances WHERE user_id = ?
      `).get(originalTx.fromUserId) as { amount: number } | undefined

      if (!userBalance) {
        throw new NotFoundError('User balance not found', 'user')
      }

      // Refund the amount (add back to balance)
      // Original transaction amount is negative (deduction), so we use absolute value
      const refundAmount = Math.abs(originalTx.amount)
      const newBalance = userBalance.amount + refundAmount

      db.prepare(`
        UPDATE balances SET amount = ? WHERE user_id = ?
      `).run(newBalance, originalTx.fromUserId)

      // Create refund transaction
      const refundTx = createTransaction(db, {
        serverId: originalTx.serverId,
        type: 'refund',
        fromUserId: null,  // System refund
        toUserId: originalTx.fromUserId,
        botDiscordId: originalTx.botDiscordId || undefined,
        amount: refundAmount,
        balanceAfter: newBalance,
        metadata: {
          originalTransactionId: body.transactionId,
          reason: body.reason || 'inference_failed',
        },
      })

      logger.info({
        originalTransactionId: body.transactionId,
        refundTransactionId: refundTx.id,
        userId: originalTx.fromUserId,
        amount: refundAmount,
        reason: body.reason,
      }, 'Transaction refunded')

      const response: RefundResponse = {
        success: true,
        refundTransactionId: refundTx.id,
        amount: refundAmount,
        balanceAfter: Math.round(newBalance * 100) / 100,
      }

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}

