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
  name?: string              // Discord server name (for display)
  rewardEmoji: string[]      // Emoji that give rewards (can be multiple)
  rewardAmount: number       // Ichor per reward reaction
  tipEmoji: string           // Single emoji for tipping
  tipAmount: number          // Ichor transferred per tip
  lastModifiedBy?: string    // Discord user ID who last modified config
  lastModifiedAt?: string    // ISO timestamp of last modification
}

/**
 * Global configuration values (applies to all users)
 * Some values come from environment (env), others are runtime configurable (db)
 */
export interface GlobalConfig {
  // Environment-configured (defaults, set at startup)
  baseRegenRate: number      // Ichor per hour (default: 5)
  maxBalance: number         // Maximum storable ichor (default: 100)
  startingBalance: number    // Initial ichor for new users (default: 50)
  
  // Runtime-configurable (stored in database, changeable by admins)
  rewardCooldownMinutes: number  // Cooldown between free rewards in minutes (default: 5)
  maxDailyRewards: number        // Max free rewards per user per day (default: 3)
  globalCostMultiplier: number   // Multiplier applied to all bot costs (default: 1.0)
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
  rewardCooldownMinutes: 5,
  maxDailyRewards: 3,
  globalCostMultiplier: 1.0,
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
