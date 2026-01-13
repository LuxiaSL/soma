/**
 * Global Configuration Service
 * Provides access to global config values (regen rate, max balance, etc.)
 * 
 * Configuration sources:
 * - Environment variables: base regen rate, max balance, starting balance (startup-only)
 * - Database: reward cooldown, global cost multiplier (runtime-configurable)
 */

import type { Database } from 'better-sqlite3'
import type { GlobalConfig, ServerConfig } from '../types/index.js'
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_SERVER_CONFIG } from '../types/index.js'
import { logger } from '../utils/logger.js'

/** Cached environment config (loaded once at startup) */
let cachedEnvConfig: Pick<GlobalConfig, 'baseRegenRate' | 'maxBalance' | 'startingBalance'> | null = null

/** Cached runtime config (loaded from database, can be updated) */
let cachedRuntimeConfig: Pick<GlobalConfig, 'rewardCooldownSeconds' | 'globalCostMultiplier'> | null = null

/** Database reference for runtime config */
let configDb: Database | null = null

/**
 * Set the database reference for runtime config operations
 */
export function setConfigDatabase(db: Database): void {
  configDb = db
  cachedRuntimeConfig = null  // Clear cache to reload from DB
}

/**
 * Load environment-based config (called once at startup)
 */
function loadEnvConfig(): Pick<GlobalConfig, 'baseRegenRate' | 'maxBalance' | 'startingBalance'> {
  if (cachedEnvConfig) {
    return cachedEnvConfig
  }

  const baseRegenRate = parseFloat(process.env.SOMA_BASE_REGEN_RATE || '') 
  const maxBalance = parseFloat(process.env.SOMA_MAX_BALANCE || '')
  const startingBalance = parseFloat(process.env.SOMA_STARTING_BALANCE || '')

  cachedEnvConfig = {
    baseRegenRate: !isNaN(baseRegenRate) && baseRegenRate > 0 
      ? baseRegenRate 
      : DEFAULT_GLOBAL_CONFIG.baseRegenRate,
    maxBalance: !isNaN(maxBalance) && maxBalance > 0 
      ? maxBalance 
      : DEFAULT_GLOBAL_CONFIG.maxBalance,
    startingBalance: !isNaN(startingBalance) && startingBalance >= 0 
      ? startingBalance 
      : DEFAULT_GLOBAL_CONFIG.startingBalance,
  }

  return cachedEnvConfig
}

/**
 * Load runtime config from database
 */
function loadRuntimeConfig(): Pick<GlobalConfig, 'rewardCooldownSeconds' | 'globalCostMultiplier'> {
  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig
  }

  if (!configDb) {
    // Return defaults if no database connection
    return {
      rewardCooldownSeconds: DEFAULT_GLOBAL_CONFIG.rewardCooldownSeconds,
      globalCostMultiplier: DEFAULT_GLOBAL_CONFIG.globalCostMultiplier,
    }
  }

  try {
    const row = configDb.prepare(`
      SELECT reward_cooldown_seconds, global_cost_multiplier
      FROM global_config WHERE id = 'global'
    `).get() as { reward_cooldown_seconds: number; global_cost_multiplier: number } | undefined

    cachedRuntimeConfig = {
      rewardCooldownSeconds: row?.reward_cooldown_seconds ?? DEFAULT_GLOBAL_CONFIG.rewardCooldownSeconds,
      globalCostMultiplier: row?.global_cost_multiplier ?? DEFAULT_GLOBAL_CONFIG.globalCostMultiplier,
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load runtime config from database, using defaults')
    cachedRuntimeConfig = {
      rewardCooldownSeconds: DEFAULT_GLOBAL_CONFIG.rewardCooldownSeconds,
      globalCostMultiplier: DEFAULT_GLOBAL_CONFIG.globalCostMultiplier,
    }
  }

  return cachedRuntimeConfig
}

/**
 * Get global configuration
 * Combines environment config with runtime config from database
 */
export function getGlobalConfig(): GlobalConfig {
  const envConfig = loadEnvConfig()
  const runtimeConfig = loadRuntimeConfig()

  return {
    ...envConfig,
    ...runtimeConfig,
  }
}

/**
 * Update runtime global config (stores in database)
 */
export function updateGlobalConfig(
  db: Database,
  updates: Partial<Pick<GlobalConfig, 'rewardCooldownSeconds' | 'globalCostMultiplier'>>,
  modifiedBy?: string
): GlobalConfig {
  const fields: string[] = []
  const values: (number | string)[] = []

  if (updates.rewardCooldownSeconds !== undefined) {
    fields.push('reward_cooldown_seconds = ?')
    values.push(updates.rewardCooldownSeconds)
  }

  if (updates.globalCostMultiplier !== undefined) {
    fields.push('global_cost_multiplier = ?')
    values.push(updates.globalCostMultiplier)
  }

  if (fields.length === 0) {
    return getGlobalConfig()
  }

  // Add modification tracking
  fields.push('modified_by = ?')
  values.push(modifiedBy || 'unknown')
  fields.push("modified_at = datetime('now')")

  db.prepare(`
    UPDATE global_config SET ${fields.join(', ')} WHERE id = 'global'
  `).run(...values)

  // Clear cache to reload fresh values
  cachedRuntimeConfig = null

  logger.info({ updates, modifiedBy }, 'Updated global config')

  return getGlobalConfig()
}

/**
 * Get runtime config modification info
 */
export function getGlobalConfigInfo(db: Database): {
  config: GlobalConfig
  modifiedBy: string | null
  modifiedAt: string | null
} {
  const row = db.prepare(`
    SELECT reward_cooldown_seconds, global_cost_multiplier, modified_by, modified_at
    FROM global_config WHERE id = 'global'
  `).get() as {
    reward_cooldown_seconds: number
    global_cost_multiplier: number
    modified_by: string | null
    modified_at: string | null
  } | undefined

  return {
    config: getGlobalConfig(),
    modifiedBy: row?.modified_by || null,
    modifiedAt: row?.modified_at || null,
  }
}

/**
 * Get default server configuration
 */
export function getDefaultServerConfig(): ServerConfig {
  return { ...DEFAULT_SERVER_CONFIG }
}

/**
 * Parse server config from JSON string
 */
export function parseServerConfig(jsonStr: string): ServerConfig {
  try {
    const parsed = JSON.parse(jsonStr) as Partial<ServerConfig>
    return {
      ...DEFAULT_SERVER_CONFIG,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_SERVER_CONFIG }
  }
}
