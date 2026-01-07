/**
 * User Service
 * Handles user and server auto-creation
 */

import type { Database } from 'better-sqlite3'
import type { User, Server, UserRow, ServerRow } from '../types/index.js'
import { generateId } from '../db/connection.js'
import { getDefaultServerConfig, parseServerConfig } from './config.js'
import { getGlobalConfig } from './config.js'
import { logger } from '../utils/logger.js'

/**
 * Get or create a user by Discord ID
 */
export function getOrCreateUser(db: Database, discordId: string): User {
  // Try to find existing user
  const existing = db.prepare(`
    SELECT id, discord_id, created_at FROM users WHERE discord_id = ?
  `).get(discordId) as UserRow | undefined

  if (existing) {
    return {
      id: existing.id,
      discordId: existing.discord_id,
      createdAt: new Date(existing.created_at),
    }
  }

  // Create new user
  const id = generateId()
  const globalConfig = getGlobalConfig()

  db.prepare(`
    INSERT INTO users (id, discord_id) VALUES (?, ?)
  `).run(id, discordId)

  // Create initial balance
  db.prepare(`
    INSERT INTO balances (user_id, amount) VALUES (?, ?)
  `).run(id, globalConfig.startingBalance)

  logger.info({ discordId, id, startingBalance: globalConfig.startingBalance }, 'Created new user')

  return {
    id,
    discordId,
    createdAt: new Date(),
  }
}

/**
 * Get user by Discord ID (returns null if not found)
 */
export function getUserByDiscordId(db: Database, discordId: string): User | null {
  const row = db.prepare(`
    SELECT id, discord_id, created_at FROM users WHERE discord_id = ?
  `).get(discordId) as UserRow | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    discordId: row.discord_id,
    createdAt: new Date(row.created_at),
  }
}

/**
 * Get user by internal ID
 */
export function getUserById(db: Database, id: string): User | null {
  const row = db.prepare(`
    SELECT id, discord_id, created_at FROM users WHERE id = ?
  `).get(id) as UserRow | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    discordId: row.discord_id,
    createdAt: new Date(row.created_at),
  }
}

/**
 * Get or create a server by Discord ID
 * Optionally updates the server name in config if provided
 */
export function getOrCreateServer(db: Database, discordId: string, serverName?: string): Server {
  // Try to find existing server
  const existing = db.prepare(`
    SELECT id, discord_id, config, created_at FROM servers WHERE discord_id = ?
  `).get(discordId) as ServerRow | undefined

  if (existing) {
    const config = parseServerConfig(existing.config)
    
    // Update server name if provided and different
    if (serverName && config.name !== serverName) {
      const updatedConfig = { ...config, name: serverName }
      db.prepare(`
        UPDATE servers SET config = ? WHERE id = ?
      `).run(JSON.stringify(updatedConfig), existing.id)
      
      return {
        id: existing.id,
        discordId: existing.discord_id,
        config: updatedConfig,
        createdAt: new Date(existing.created_at),
      }
    }
    
    return {
      id: existing.id,
      discordId: existing.discord_id,
      config,
      createdAt: new Date(existing.created_at),
    }
  }

  // Create new server
  const id = generateId()
  const config = { ...getDefaultServerConfig(), name: serverName }

  db.prepare(`
    INSERT INTO servers (id, discord_id, config) VALUES (?, ?, ?)
  `).run(id, discordId, JSON.stringify(config))

  logger.info({ discordId, id, name: serverName }, 'Created new server')

  return {
    id,
    discordId,
    config,
    createdAt: new Date(),
  }
}

/**
 * Get server by Discord ID (returns null if not found)
 */
export function getServerByDiscordId(db: Database, discordId: string): Server | null {
  const row = db.prepare(`
    SELECT id, discord_id, config, created_at FROM servers WHERE discord_id = ?
  `).get(discordId) as ServerRow | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    discordId: row.discord_id,
    config: parseServerConfig(row.config),
    createdAt: new Date(row.created_at),
  }
}

/**
 * Update server configuration
 * @param modifiedBy Discord user ID who made the change (optional, for tracking)
 */
export function updateServerConfig(
  db: Database,
  serverId: string,
  config: Partial<import('../types/index.js').ServerConfig>,
  modifiedBy?: string
): void {
  const existing = db.prepare(`
    SELECT config FROM servers WHERE id = ?
  `).get(serverId) as { config: string } | undefined

  if (!existing) {
    throw new Error(`Server ${serverId} not found`)
  }

  const currentConfig = parseServerConfig(existing.config)
  const newConfig = { 
    ...currentConfig, 
    ...config,
    // Track who modified and when
    lastModifiedBy: modifiedBy || currentConfig.lastModifiedBy,
    lastModifiedAt: modifiedBy ? new Date().toISOString() : currentConfig.lastModifiedAt,
  }

  db.prepare(`
    UPDATE servers SET config = ? WHERE id = ?
  `).run(JSON.stringify(newConfig), serverId)

  logger.info({ serverId, config: newConfig, modifiedBy }, 'Updated server config')
}

/**
 * Get server configuration (returns null if server not found)
 */
export function getServerConfig(
  db: Database,
  serverDiscordId: string
): import('../types/index.js').ServerConfig | null {
  const server = getServerByDiscordId(db, serverDiscordId)
  return server?.config || null
}
