/**
 * Global Configuration Service
 * Provides access to global config values (regen rate, max balance, etc.)
 */

import type { GlobalConfig, ServerConfig } from '../types/index.js'
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_SERVER_CONFIG } from '../types/index.js'

/**
 * Get global configuration
 * For now, returns defaults. Later could be loaded from database.
 */
export function getGlobalConfig(): GlobalConfig {
  return { ...DEFAULT_GLOBAL_CONFIG }
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
