/**
 * Role Cache Service
 * Tracks user roles across servers for global regen rate calculation
 * 
 * Architecture:
 * - Regen rate: highest role multiplier wins globally (best membership follows you)
 * - Cost discounts: per-server only (discount applies where you have the role)
 */

import type { Database } from 'better-sqlite3'
import { getGlobalConfig } from './config.js'
import { logger } from '../utils/logger.js'

interface CachedServerRoles {
  odId: string  // server internal ID
  serverDiscordId: string
  roleIds: string[]
  lastSeen: Date
}

/**
 * Update or insert a user's roles for a specific server
 * Called when we see a user in a Discord interaction or API request
 */
export function updateUserServerRoles(
  db: Database,
  userId: string,  // Internal user ID
  serverId: string,  // Internal server ID
  roleIds: string[]  // Discord role IDs
): void {
  const roleIdsJson = JSON.stringify(roleIds)

  db.prepare(`
    INSERT INTO user_server_roles (user_id, server_id, role_ids, last_seen)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT (user_id, server_id) DO UPDATE SET
      role_ids = excluded.role_ids,
      last_seen = datetime('now')
  `).run(userId, serverId, roleIdsJson)

  logger.debug({
    userId,
    serverId,
    roleCount: roleIds.length,
  }, 'Updated user server roles cache')
}

/**
 * Get all cached role data for a user across all servers
 */
export function getUserAllServerRoles(
  db: Database,
  userId: string  // Internal user ID
): CachedServerRoles[] {
  const rows = db.prepare(`
    SELECT 
      usr.server_id,
      s.discord_id as server_discord_id,
      usr.role_ids,
      usr.last_seen
    FROM user_server_roles usr
    JOIN servers s ON s.id = usr.server_id
    WHERE usr.user_id = ?
  `).all(userId) as Array<{
    server_id: string
    server_discord_id: string
    role_ids: string
    last_seen: string
  }>

  return rows.map(row => ({
    odId: row.server_id,
    serverDiscordId: row.server_discord_id,
    roleIds: JSON.parse(row.role_ids) as string[],
    lastSeen: new Date(row.last_seen.replace(' ', 'T') + 'Z'),
  }))
}

/**
 * Get the global effective regen rate for a user
 * Looks across ALL cached servers to find the highest multiplier
 * 
 * This is the key function that makes "best role follows you everywhere" work
 */
export function getGlobalEffectiveRegenRate(
  db: Database,
  userId: string  // Internal user ID
): { rate: number; multiplier: number; bestRoleId: string | null; bestServerId: string | null } {
  const globalConfig = getGlobalConfig()
  let bestMultiplier = 1.0
  let bestRoleId: string | null = null
  let bestServerId: string | null = null

  // Get all cached server roles for this user
  const cachedServers = getUserAllServerRoles(db, userId)

  for (const serverCache of cachedServers) {
    if (serverCache.roleIds.length === 0) continue

    // Get role configs for this server
    const placeholders = serverCache.roleIds.map(() => '?').join(',')
    const roleConfigs = db.prepare(`
      SELECT role_discord_id, regen_multiplier 
      FROM role_configs
      WHERE server_id = ?
      AND role_discord_id IN (${placeholders})
    `).all(serverCache.odId, ...serverCache.roleIds) as Array<{
      role_discord_id: string
      regen_multiplier: number
    }>

    // Find the highest multiplier from this server
    for (const config of roleConfigs) {
      if (config.regen_multiplier > bestMultiplier) {
        bestMultiplier = config.regen_multiplier
        bestRoleId = config.role_discord_id
        bestServerId = serverCache.serverDiscordId
      }
    }
  }

  return {
    rate: globalConfig.baseRegenRate * bestMultiplier,
    multiplier: bestMultiplier,
    bestRoleId,
    bestServerId,
  }
}

/**
 * Validate a Discord user ID (snowflake format)
 * Discord snowflakes are numeric strings, typically 17-19 digits
 */
export function isValidDiscordUserId(id: string): boolean {
  return /^\d{17,20}$/.test(id)
}

/**
 * Check if a Discord user ID is in the admin users list
 * Uses SOMA_ADMIN_USERS env var
 */
export function isAdminUserId(discordUserId: string): boolean {
  const adminUserIds = process.env.SOMA_ADMIN_USERS?.split(',').map(u => u.trim()).filter(Boolean) || []
  
  // Validate all configured IDs and warn about invalid ones
  for (const id of adminUserIds) {
    if (!isValidDiscordUserId(id)) {
      logger.warn({ invalidId: id }, 'Invalid Discord user ID in SOMA_ADMIN_USERS (should be 17-20 digits)')
    }
  }
  
  const isAdmin = adminUserIds.includes(discordUserId)
  if (isAdmin) {
    logger.debug({ discordUserId }, 'Admin access granted via SOMA_ADMIN_USERS')
  }
  return isAdmin
}

/**
 * Check if a user has admin role in any cached server
 * Uses SOMA_ADMIN_ROLES env var
 */
export function hasGlobalAdminRole(
  db: Database,
  userId: string  // Internal user ID
): boolean {
  const adminRoleIds = process.env.SOMA_ADMIN_ROLES?.split(',').map(r => r.trim()).filter(Boolean) || []
  
  if (adminRoleIds.length === 0) {
    return false
  }

  const cachedServers = getUserAllServerRoles(db, userId)

  for (const serverCache of cachedServers) {
    const matchingRole = serverCache.roleIds.find(r => adminRoleIds.includes(r))
    if (matchingRole) {
      logger.debug({ 
        userId, 
        roleId: matchingRole,
        serverDiscordId: serverCache.serverDiscordId,
      }, 'Admin access granted via SOMA_ADMIN_ROLES (cached)')
      return true
    }
  }

  return false
}

/**
 * Log admin configuration at startup for verification
 */
export function logAdminConfig(): void {
  const adminUserIds = process.env.SOMA_ADMIN_USERS?.split(',').map(u => u.trim()).filter(Boolean) || []
  const adminRoleIds = process.env.SOMA_ADMIN_ROLES?.split(',').map(r => r.trim()).filter(Boolean) || []

  logger.info({
    adminUsers: adminUserIds.length > 0 ? adminUserIds : '(none configured)',
    adminRoles: adminRoleIds.length > 0 ? adminRoleIds : '(none configured)',
  }, 'Admin access configuration loaded')

  // Validate user IDs
  for (const id of adminUserIds) {
    if (!isValidDiscordUserId(id)) {
      logger.warn({ invalidId: id }, 'Invalid Discord user ID in SOMA_ADMIN_USERS')
    }
  }

  // Validate role IDs  
  for (const id of adminRoleIds) {
    if (!isValidDiscordUserId(id)) { // Role IDs have same format as user IDs
      logger.warn({ invalidId: id }, 'Invalid Discord role ID in SOMA_ADMIN_ROLES')
    }
  }
}


/**
 * Get cache age in hours for a specific user/server combo
 * Returns null if no cache exists
 */
export function getCacheAge(
  db: Database,
  userId: string,
  serverId: string
): number | null {
  const row = db.prepare(`
    SELECT last_seen FROM user_server_roles
    WHERE user_id = ? AND server_id = ?
  `).get(userId, serverId) as { last_seen: string } | undefined

  if (!row) return null

  const lastSeen = new Date(row.last_seen.replace(' ', 'T') + 'Z')
  const hoursAgo = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60)
  return hoursAgo
}

/**
 * Delete stale cache entries (older than specified hours)
 */
export function cleanupStaleRoleCache(
  db: Database,
  maxAgeHours: number = 168  // Default 1 week
): number {
  const result = db.prepare(`
    DELETE FROM user_server_roles
    WHERE datetime(last_seen) < datetime('now', ?)
  `).run(`-${maxAgeHours} hours`)

  if (result.changes > 0) {
    logger.info({ deleted: result.changes, maxAgeHours }, 'Cleaned up stale role cache entries')
  }

  return result.changes
}

