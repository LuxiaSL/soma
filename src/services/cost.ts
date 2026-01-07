/**
 * Cost Service
 * Handles bot cost lookups with role multipliers
 */

import type { Database } from 'better-sqlite3'
import type { BotCost, BotCostRow } from '../types/index.js'
import { generateId } from '../db/connection.js'
import { getEffectiveCostMultiplier } from './balance.js'
import { BotNotConfiguredError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

/**
 * Get the cost for a bot activation (with role multipliers)
 */
export function getBotCost(
  db: Database,
  botDiscordId: string,
  serverId: string,
  userRoles: string[]
): { cost: number; baseCost: number; multiplier: number } {
  // First try server-specific cost
  let row = db.prepare(`
    SELECT base_cost FROM bot_costs
    WHERE bot_discord_id = ?
    AND server_id = (SELECT id FROM servers WHERE discord_id = ?)
  `).get(botDiscordId, serverId) as Pick<BotCostRow, 'base_cost'> | undefined

  // Fall back to global cost
  if (!row) {
    row = db.prepare(`
      SELECT base_cost FROM bot_costs
      WHERE bot_discord_id = ? AND server_id IS NULL
    `).get(botDiscordId) as Pick<BotCostRow, 'base_cost'> | undefined
  }

  if (!row) {
    throw new BotNotConfiguredError(botDiscordId, serverId)
  }

  const baseCost = row.base_cost
  const multiplier = getEffectiveCostMultiplier(db, serverId, userRoles)
  const cost = Math.max(0, Math.round(baseCost * multiplier * 100) / 100)

  return { cost, baseCost, multiplier }
}

/**
 * Get all bot costs for a server
 */
export function getAllBotCosts(
  db: Database,
  serverId: string
): BotCost[] {
  // Get server-specific and global costs
  const rows = db.prepare(`
    SELECT bc.id, bc.bot_discord_id, bc.server_id, bc.base_cost, bc.description
    FROM bot_costs bc
    WHERE bc.server_id = (SELECT id FROM servers WHERE discord_id = ?)
    OR bc.server_id IS NULL
    ORDER BY bc.base_cost ASC
  `).all(serverId) as BotCostRow[]

  // Dedupe: server-specific overrides global
  const costMap = new Map<string, BotCost>()

  for (const row of rows) {
    const existing = costMap.get(row.bot_discord_id)
    // If we already have a server-specific cost, don't override with global
    if (existing && row.server_id === null) {
      continue
    }

    costMap.set(row.bot_discord_id, {
      id: row.id,
      botDiscordId: row.bot_discord_id,
      serverId: row.server_id,
      baseCost: row.base_cost,
      description: row.description,
    })
  }

  return Array.from(costMap.values())
}

/**
 * Get cheaper alternatives to a bot
 */
export function getCheaperAlternatives(
  db: Database,
  botDiscordId: string,
  serverId: string,
  currentCost: number
): Array<{ botId: string; name: string; cost: number }> {
  const allCosts = getAllBotCosts(db, serverId)

  return allCosts
    .filter(c => c.botDiscordId !== botDiscordId && c.baseCost < currentCost)
    .map(c => ({
      botId: c.botDiscordId,
      name: c.description || c.botDiscordId,
      cost: c.baseCost,
    }))
    .sort((a, b) => a.cost - b.cost)
}

/**
 * Get a bot's description/name for display
 */
export function getBotDescription(
  db: Database,
  botDiscordId: string,
  serverId: string
): string | null {
  // First try server-specific cost
  let row = db.prepare(`
    SELECT description FROM bot_costs
    WHERE bot_discord_id = ?
    AND server_id = (SELECT id FROM servers WHERE discord_id = ?)
  `).get(botDiscordId, serverId) as { description: string | null } | undefined

  // Fall back to global cost
  if (!row) {
    row = db.prepare(`
      SELECT description FROM bot_costs
      WHERE bot_discord_id = ? AND server_id IS NULL
    `).get(botDiscordId) as { description: string | null } | undefined
  }

  return row?.description || null
}

/**
 * Get all bot costs across all servers (for DM view)
 */
export function getAllServersCosts(
  db: Database
): Array<{
  serverDiscordId: string
  serverName: string
  bots: Array<{ botId: string; name: string; cost: number }>
}> {
  // Get all servers with bot costs configured
  const servers = db.prepare(`
    SELECT DISTINCT s.id, s.discord_id, s.config
    FROM servers s
    INNER JOIN bot_costs bc ON bc.server_id = s.id
  `).all() as Array<{ id: string; discord_id: string; config: string }>

  const result: Array<{
    serverDiscordId: string
    serverName: string
    bots: Array<{ botId: string; name: string; cost: number }>
  }> = []

  for (const server of servers) {
    const config = JSON.parse(server.config || '{}')
    const serverName = config.name || `Server (ID ...${server.discord_id.slice(-4)})`

    // Get costs for this server (deduped)
    const costs = db.prepare(`
      SELECT bot_discord_id, base_cost, description
      FROM bot_costs
      WHERE server_id = ?
      ORDER BY base_cost ASC
    `).all(server.id) as Array<{ bot_discord_id: string; base_cost: number; description: string | null }>

    if (costs.length > 0) {
      result.push({
        serverDiscordId: server.discord_id,
        serverName,
        bots: costs.map(c => ({
          botId: c.bot_discord_id,
          name: c.description || c.bot_discord_id,
          cost: c.base_cost,
        })),
      })
    }
  }

  return result
}

/**
 * Get bot costs only from servers the user is known to be in
 * Uses the user_server_roles cache to determine membership
 */
export function getUserKnownServersCosts(
  db: Database,
  userId: string  // Internal user ID
): Array<{
  serverName: string
  bots: Array<{ name: string; cost: number }>
}> {
  // Get servers the user has been seen in (from role cache)
  const knownServers = db.prepare(`
    SELECT DISTINCT usr.server_id, s.discord_id, s.config
    FROM user_server_roles usr
    INNER JOIN servers s ON s.id = usr.server_id
    INNER JOIN bot_costs bc ON bc.server_id = s.id
    WHERE usr.user_id = ?
  `).all(userId) as Array<{ server_id: string; discord_id: string; config: string }>

  const result: Array<{
    serverName: string
    bots: Array<{ name: string; cost: number }>
  }> = []

  for (const server of knownServers) {
    const config = JSON.parse(server.config || '{}')
    const serverName = config.name || `Server (ID ...${server.discord_id.slice(-4)})`

    // Get costs for this server
    const costs = db.prepare(`
      SELECT bot_discord_id, base_cost, description
      FROM bot_costs
      WHERE server_id = ?
      ORDER BY base_cost ASC
    `).all(server.server_id) as Array<{ bot_discord_id: string; base_cost: number; description: string | null }>

    if (costs.length > 0) {
      result.push({
        serverName,
        bots: costs.map(c => ({
          name: c.description || c.bot_discord_id,
          cost: c.base_cost,
        })),
      })
    }
  }

  return result
}

/**
 * Set or update a bot's cost
 */
export function setBotCost(
  db: Database,
  botDiscordId: string,
  serverId: string | null,
  cost: number,
  description?: string
): { previousCost: number | null } {
  // Get server internal ID if server-specific
  let serverInternalId: string | null = null
  if (serverId) {
    const server = db.prepare(`
      SELECT id FROM servers WHERE discord_id = ?
    `).get(serverId) as { id: string } | undefined

    if (server) {
      serverInternalId = server.id
    }
  }

  // Check for existing cost
  const existing = db.prepare(`
    SELECT id, base_cost FROM bot_costs
    WHERE bot_discord_id = ? AND (server_id = ? OR (server_id IS NULL AND ? IS NULL))
  `).get(botDiscordId, serverInternalId, serverInternalId) as Pick<BotCostRow, 'id' | 'base_cost'> | undefined

  let previousCost: number | null = null

  if (existing) {
    previousCost = existing.base_cost
    db.prepare(`
      UPDATE bot_costs SET base_cost = ?, description = ? WHERE id = ?
    `).run(cost, description || null, existing.id)

    logger.info({ botDiscordId, serverId, cost, previousCost }, 'Updated bot cost')
  } else {
    const id = generateId()
    db.prepare(`
      INSERT INTO bot_costs (id, bot_discord_id, server_id, base_cost, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, botDiscordId, serverInternalId, cost, description || null)

    logger.info({ botDiscordId, serverId, cost }, 'Created bot cost')
  }

  return { previousCost }
}

/**
 * Set a role's multipliers
 */
export function setRoleConfig(
  db: Database,
  serverId: string,
  roleDiscordId: string,
  config: {
    regenMultiplier?: number
    maxBalanceOverride?: number | null
    costMultiplier?: number
  }
): void {
  // Get server internal ID
  const server = db.prepare(`
    SELECT id FROM servers WHERE discord_id = ?
  `).get(serverId) as { id: string } | undefined

  if (!server) {
    throw new Error(`Server ${serverId} not found`)
  }

  // Check for existing config
  const existing = db.prepare(`
    SELECT id FROM role_configs WHERE server_id = ? AND role_discord_id = ?
  `).get(server.id, roleDiscordId) as { id: string } | undefined

  if (existing) {
    const updates: string[] = []
    const values: (number | null)[] = []

    if (config.regenMultiplier !== undefined) {
      updates.push('regen_multiplier = ?')
      values.push(config.regenMultiplier)
    }
    if (config.maxBalanceOverride !== undefined) {
      updates.push('max_balance_override = ?')
      values.push(config.maxBalanceOverride)
    }
    if (config.costMultiplier !== undefined) {
      updates.push('cost_multiplier = ?')
      values.push(config.costMultiplier)
    }

    if (updates.length > 0) {
      db.prepare(`
        UPDATE role_configs SET ${updates.join(', ')} WHERE id = ?
      `).run(...values, existing.id)
    }

    logger.info({ serverId, roleDiscordId, config }, 'Updated role config')
  } else {
    const id = generateId()
    db.prepare(`
      INSERT INTO role_configs (id, server_id, role_discord_id, regen_multiplier, max_balance_override, cost_multiplier)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      server.id,
      roleDiscordId,
      config.regenMultiplier ?? 1.0,
      config.maxBalanceOverride ?? null,
      config.costMultiplier ?? 1.0
    )

    logger.info({ serverId, roleDiscordId, config }, 'Created role config')
  }
}
