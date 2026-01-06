/**
 * Authentication Middleware
 * Bearer token validation for API requests
 */

import type { Request, Response, NextFunction } from 'express'
import { logger } from '../../utils/logger.js'

/**
 * Create auth middleware with configured tokens
 */
export function createAuthMiddleware(validTokens: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for health check and OPTIONS
    if (req.path === '/health' || req.method === 'OPTIONS') {
      return next()
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({ path: req.path, method: req.method }, 'Missing authorization header')
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      })
      return
    }

    const token = authHeader.substring(7)
    if (!validTokens.includes(token)) {
      logger.warn({ path: req.path, method: req.method }, 'Invalid bearer token')
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Invalid bearer token',
      })
      return
    }

    next()
  }
}
