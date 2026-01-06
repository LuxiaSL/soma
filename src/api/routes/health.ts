/**
 * Health Check Route
 */

import { Router, type Request, type Response } from 'express'
import type { HealthResponse } from '../../types/api.js'

const VERSION = '0.1.0'

export function createHealthRouter(getUptime: () => number): Router {
  const router = Router()

  router.get('/health', (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: 'ok',
      version: VERSION,
      uptime: getUptime(),
    }
    res.json(response)
  })

  return router
}
