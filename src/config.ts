/**
 * Configuration loading from environment variables
 */

import type { ApiConfig } from './types/index.js'

/**
 * Extended config including Discord bot settings
 */
export interface SomaConfig extends ApiConfig {
  discordToken: string | null
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): SomaConfig {
  const port = parseInt(process.env.SOMA_PORT || '3100', 10)
  const databasePath = process.env.SOMA_DATABASE_PATH || './data/soma.db'

  // Service tokens are comma-separated
  const tokensRaw = process.env.SOMA_SERVICE_TOKENS || ''
  const serviceTokens = tokensRaw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)

  if (serviceTokens.length === 0) {
    throw new Error(
      'SOMA_SERVICE_TOKENS environment variable is required. ' +
      'Set it to a comma-separated list of valid API tokens.'
    )
  }

  // Discord token for the Soma bot (optional - bot won't start without it)
  const discordToken = process.env.SOMA_DISCORD_TOKEN || null

  return {
    port,
    databasePath,
    serviceTokens,
    discordToken,
  }
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Get log level from environment
 */
export function getLogLevel(): string {
  return process.env.LOG_LEVEL || (isDevelopment() ? 'debug' : 'info')
}
