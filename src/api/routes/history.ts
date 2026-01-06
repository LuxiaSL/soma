/**
 * History Route
 * GET /history/:userId/:serverId
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { GetHistoryResponse, TransactionHistoryItem } from '../../types/api.js'
import { getTransactionsForUser } from '../../services/transaction.js'
import { getOrCreateUser, getOrCreateServer } from '../../services/user.js'

export function createHistoryRouter(db: Database): Router {
  const router = Router()

  router.get('/history/:userId/:serverId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, serverId } = req.params
      const limit = parseInt(req.query.limit as string || '20', 10)

      // Ensure user and server exist
      const user = getOrCreateUser(db, userId)
      const server = getOrCreateServer(db, serverId)

      // Get transactions - use internal server ID
      const transactions = getTransactionsForUser(db, user.id, server.id, limit)

      const response: GetHistoryResponse = {
        transactions: transactions.map((tx): TransactionHistoryItem => ({
          id: tx.id,
          timestamp: tx.timestamp.toISOString(),
          type: tx.type,
          amount: tx.amount,
          balanceAfter: Math.round(tx.balanceAfter * 100) / 100,
          botName: tx.botDiscordId || undefined,
          messageId: tx.metadata.messageId as string | undefined,
          otherUserId: tx.fromUserId === user.id ? tx.toUserId || undefined : tx.fromUserId || undefined,
          note: tx.metadata.note as string | undefined,
        })),
      }

      res.json(response)
    } catch (error) {
      next(error)
    }
  })

  return router
}
