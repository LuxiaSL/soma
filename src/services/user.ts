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
 * Discord user profile info for caching
 */
export interface DiscordUserInfo {
  username: string
  displayName?: string
  avatarHash?: string | null
}

/**
 * Extract user info from a Discord.js User object
 */
export function extractDiscordUserInfo(discordUser: { 
  username: string
  displayName?: string
  globalName?: string | null
  avatar?: string | null 
}): DiscordUserInfo {
  return {
    username: discordUser.username,
    displayName: discordUser.displayName ?? discordUser.globalName ?? undefined,
    avatarHash: discordUser.avatar ?? null,
  }
}

/**
 * Parse a UserRow into a User domain object
 */
function parseUserRow(row: UserRow): User {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    displayName: row.display_name,
    avatarHash: row.avatar_hash,
    lastSeen: row.last_seen ? new Date(row.last_seen) : null,
    createdAt: new Date(row.created_at),
  }
}

/**
 * Get or create a user by Discord ID
 * Optionally updates cached profile info if provided
 */
export function getOrCreateUser(db: Database, discordId: string, userInfo?: DiscordUserInfo): User {
  // Try to find existing user
  const existing = db.prepare(`
    SELECT id, discord_id, username, display_name, avatar_hash, last_seen, created_at 
    FROM users WHERE discord_id = ?
  `).get(discordId) as UserRow | undefined

  if (existing) {
    // Update cached profile info if provided
    if (userInfo) {
      db.prepare(`
        UPDATE users SET 
          username = ?,
          display_name = ?,
          avatar_hash = ?,
          last_seen = datetime('now')
        WHERE id = ?
      `).run(
        userInfo.username,
        userInfo.displayName ?? null,
        userInfo.avatarHash ?? null,
        existing.id
      )
      
      return {
        ...parseUserRow(existing),
        username: userInfo.username,
        displayName: userInfo.displayName ?? null,
        avatarHash: userInfo.avatarHash ?? null,
        lastSeen: new Date(),
      }
    }
    
    return parseUserRow(existing)
  }

  // Create new user
  const id = generateId()
  const globalConfig = getGlobalConfig()

  db.prepare(`
    INSERT INTO users (id, discord_id, username, display_name, avatar_hash, last_seen) 
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, 
    discordId, 
    userInfo?.username ?? null,
    userInfo?.displayName ?? null,
    userInfo?.avatarHash ?? null
  )

  // Create initial balance
  db.prepare(`
    INSERT INTO balances (user_id, amount) VALUES (?, ?)
  `).run(id, globalConfig.startingBalance)

  logger.info({ discordId, id, username: userInfo?.username, startingBalance: globalConfig.startingBalance }, 'Created new user')

  return {
    id,
    discordId,
    username: userInfo?.username ?? null,
    displayName: userInfo?.displayName ?? null,
    avatarHash: userInfo?.avatarHash ?? null,
    lastSeen: new Date(),
    createdAt: new Date(),
  }
}

/**
 * Update a user's cached profile info
 */
export function updateUserProfile(db: Database, discordId: string, userInfo: DiscordUserInfo): void {
  db.prepare(`
    UPDATE users SET 
      username = ?,
      display_name = ?,
      avatar_hash = ?,
      last_seen = datetime('now')
    WHERE discord_id = ?
  `).run(
    userInfo.username,
    userInfo.displayName ?? null,
    userInfo.avatarHash ?? null,
    discordId
  )
}

/**
 * Get user by Discord ID (returns null if not found)
 */
export function getUserByDiscordId(db: Database, discordId: string): User | null {
  const row = db.prepare(`
    SELECT id, discord_id, username, display_name, avatar_hash, last_seen, created_at 
    FROM users WHERE discord_id = ?
  `).get(discordId) as UserRow | undefined

  if (!row) {
    return null
  }

  return parseUserRow(row)
}

/**
 * Get user by internal ID
 */
export function getUserById(db: Database, id: string): User | null {
  const row = db.prepare(`
    SELECT id, discord_id, username, display_name, avatar_hash, last_seen, created_at 
    FROM users WHERE id = ?
  `).get(id) as UserRow | undefined

  if (!row) {
    return null
  }

  return parseUserRow(row)
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
 * Get server by internal ID (returns null if not found)
 */
export function getServerById(db: Database, id: string): Server | null {
  const row = db.prepare(`
    SELECT id, discord_id, config, created_at FROM servers WHERE id = ?
  `).get(id) as ServerRow | undefined

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
