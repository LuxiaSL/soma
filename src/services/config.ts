/**
 * Global Configuration Service
 * Provides access to global config values (regen rate, max balance, etc.)
 * 
 * Configuration sources:
 * - Database (primary): All settings are runtime-configurable via global_config table
 * - Environment variables (fallback): Used as initial values if DB has defaults
 * 
 * Priority: DB value > ENV value > hardcoded default
 */

import type { Database } from 'better-sqlite3'
import type { GlobalConfig, ServerConfig } from '../types/index.js'
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_SERVER_CONFIG } from '../types/index.js'
import { logger } from '../utils/logger.js'

/** Cached full config (loaded from database, can be updated) */
let cachedConfig: GlobalConfig | null = null

/** Database reference for runtime config */
let configDb: Database | null = null

/**
 * Set the database reference for runtime config operations
 */
export function setConfigDatabase(db: Database): void {
  configDb = db
  cachedConfig = null  // Clear cache to reload from DB
}

/**
 * Clear the config cache (call after updates)
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

/**
 * Get environment variable fallbacks (used when DB has default values)
 */
function getEnvFallbacks(): Partial<GlobalConfig> {
  const baseRegenRate = parseFloat(process.env.SOMA_BASE_REGEN_RATE || '')
  const maxBalance = parseFloat(process.env.SOMA_MAX_BALANCE || '')
  const startingBalance = parseFloat(process.env.SOMA_STARTING_BALANCE || '')

  return {
    baseRegenRate: !isNaN(baseRegenRate) && baseRegenRate > 0 ? baseRegenRate : undefined,
    maxBalance: !isNaN(maxBalance) && maxBalance > 0 ? maxBalance : undefined,
    startingBalance: !isNaN(startingBalance) && startingBalance >= 0 ? startingBalance : undefined,
  }
}

/**
 * Load full config from database
 * Falls back to env vars, then hardcoded defaults
 */
function loadConfig(): GlobalConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const envFallbacks = getEnvFallbacks()

  if (!configDb) {
    // Return defaults with env overrides if no database connection
    cachedConfig = {
      ...DEFAULT_GLOBAL_CONFIG,
      ...envFallbacks,
    }
    return cachedConfig
  }

  try {
    // Check which columns exist (handles pre-migration databases)
    const tableInfo = configDb.prepare(`PRAGMA table_info(global_config)`).all() as Array<{ name: string }>
    const columns = new Set(tableInfo.map(c => c.name))

    // Build query based on available columns
    const selectCols: string[] = []
    
    // Base economy settings (new in migration 007)
    if (columns.has('base_regen_rate')) {
      selectCols.push('base_regen_rate')
    }
    if (columns.has('max_balance')) {
      selectCols.push('max_balance')
    }
    if (columns.has('starting_balance')) {
      selectCols.push('starting_balance')
    }
    
    // Runtime settings
    if (columns.has('reward_cooldown_minutes')) {
      selectCols.push('reward_cooldown_minutes')
    } else if (columns.has('reward_cooldown_seconds')) {
      // Fallback: convert seconds to minutes
      selectCols.push('CAST(reward_cooldown_seconds / 60.0 AS INTEGER) as reward_cooldown_minutes')
    }
    if (columns.has('max_daily_rewards')) {
      selectCols.push('max_daily_rewards')
    }
    if (columns.has('global_cost_multiplier')) {
      selectCols.push('global_cost_multiplier')
    }

    if (selectCols.length === 0) {
      throw new Error('global_config table has no recognized columns')
    }

    const row = configDb.prepare(`
      SELECT ${selectCols.join(', ')}
      FROM global_config WHERE id = 'global'
    `).get() as {
      base_regen_rate?: number
      max_balance?: number
      starting_balance?: number
      reward_cooldown_minutes?: number
      max_daily_rewards?: number
      global_cost_multiplier?: number
    } | undefined

    // Build config with priority: DB value > ENV fallback > hardcoded default
    // DB values always win if present (even if they match the default - admin may have explicitly set them)
    // ENV is only used for initial bootstrap before any admin changes
    cachedConfig = {
      // Base economy settings: DB > ENV > default
      baseRegenRate: row?.base_regen_rate ?? envFallbacks.baseRegenRate ?? DEFAULT_GLOBAL_CONFIG.baseRegenRate,
      maxBalance: row?.max_balance ?? envFallbacks.maxBalance ?? DEFAULT_GLOBAL_CONFIG.maxBalance,
      startingBalance: row?.starting_balance ?? envFallbacks.startingBalance ?? DEFAULT_GLOBAL_CONFIG.startingBalance,
      // Runtime settings: DB > default
      rewardCooldownMinutes: row?.reward_cooldown_minutes ?? DEFAULT_GLOBAL_CONFIG.rewardCooldownMinutes,
      maxDailyRewards: row?.max_daily_rewards ?? DEFAULT_GLOBAL_CONFIG.maxDailyRewards,
      globalCostMultiplier: row?.global_cost_multiplier ?? DEFAULT_GLOBAL_CONFIG.globalCostMultiplier,
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load config from database, using defaults')
    cachedConfig = {
      ...DEFAULT_GLOBAL_CONFIG,
      ...envFallbacks,
    }
  }

  return cachedConfig
}

/**
 * Get global configuration
 * All settings are now runtime-configurable via database
 */
export function getGlobalConfig(): GlobalConfig {
  return loadConfig()
}

/**
 * Update global config (stores in database)
 * Now supports all settings including base economy values
 */
export function updateGlobalConfig(
  db: Database,
  updates: Partial<GlobalConfig>,
  modifiedBy?: string
): GlobalConfig {
  const fields: string[] = []
  const values: (number | string)[] = []

  // Base economy settings
  if (updates.baseRegenRate !== undefined) {
    fields.push('base_regen_rate = ?')
    values.push(updates.baseRegenRate)
  }

  if (updates.maxBalance !== undefined) {
    fields.push('max_balance = ?')
    values.push(updates.maxBalance)
  }

  if (updates.startingBalance !== undefined) {
    fields.push('starting_balance = ?')
    values.push(updates.startingBalance)
  }

  // Runtime settings
  if (updates.rewardCooldownMinutes !== undefined) {
    fields.push('reward_cooldown_minutes = ?')
    values.push(updates.rewardCooldownMinutes)
  }

  if (updates.maxDailyRewards !== undefined) {
    fields.push('max_daily_rewards = ?')
    values.push(updates.maxDailyRewards)
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
  clearConfigCache()

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
  try {
    const row = db.prepare(`
      SELECT modified_by, modified_at
      FROM global_config WHERE id = 'global'
    `).get() as {
      modified_by: string | null
      modified_at: string | null
    } | undefined

    return {
      config: getGlobalConfig(),
      modifiedBy: row?.modified_by || null,
      modifiedAt: row?.modified_at || null,
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to get global config info')
    return {
      config: getGlobalConfig(),
      modifiedBy: null,
      modifiedAt: null,
    }
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
