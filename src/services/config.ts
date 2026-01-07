/**
 * Global Configuration Service
 * Provides access to global config values (regen rate, max balance, etc.)
 */

import type { GlobalConfig, ServerConfig } from '../types/index.js'
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_SERVER_CONFIG } from '../types/index.js'

/** Cached global config loaded from environment */
let cachedGlobalConfig: GlobalConfig | null = null

/**
 * Get global configuration
 * Loads from environment variables, falling back to defaults
 */
export function getGlobalConfig(): GlobalConfig {
  if (cachedGlobalConfig) {
    return { ...cachedGlobalConfig }
  }

  const baseRegenRate = parseFloat(process.env.SOMA_BASE_REGEN_RATE || '') 
  const maxBalance = parseFloat(process.env.SOMA_MAX_BALANCE || '')
  const startingBalance = parseFloat(process.env.SOMA_STARTING_BALANCE || '')

  cachedGlobalConfig = {
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

  return { ...cachedGlobalConfig }
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
