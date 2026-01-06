/**
 * Soma Core Type Definitions
 */

// Re-export all types
export * from './db.js'
export * from './api.js'

/**
 * Transaction types for the ledger
 */
export type TransactionType =
  | 'spend'    // Bot activation (mention, reply, m-continue)
  | 'regen'    // Regeneration tick
  | 'transfer' // User-to-user
  | 'reward'   // Reaction reward
  | 'tip'      // Direct tip
  | 'grant'    // Admin grant
  | 'revoke'   // Admin revoke
  | 'refund'   // Failed inference refund

/**
 * Trigger types for bot activations
 */
export type TriggerType = 'mention' | 'reply' | 'm_continue'

/**
 * Server-specific configuration (rewards, tips)
 */
export interface ServerConfig {
  rewardEmoji: string[]
  rewardAmount: number
  tipEmoji: string
  tipAmount: number
}

/**
 * Global configuration values (applies to all users)
 */
export interface GlobalConfig {
  baseRegenRate: number   // Ichor per hour (default: 5)
  maxBalance: number      // Maximum storable ichor (default: 100)
  startingBalance: number // Initial ichor for new users (default: 50)
}

/**
 * API server configuration
 */
export interface ApiConfig {
  port: number
  serviceTokens: string[]
  databasePath: string
}

/**
 * Default global configuration values
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  baseRegenRate: 5,
  maxBalance: 100,
  startingBalance: 50,
}

/**
 * Default server configuration values
 */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  rewardEmoji: ['⭐', '🔥', '💯', '👏'],
  rewardAmount: 1,
  tipEmoji: '🫀',
  tipAmount: 5,
}
