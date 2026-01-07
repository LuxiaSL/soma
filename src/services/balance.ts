/**
 * Balance Service
 * Core balance operations including regeneration calculation
 */

import type { Database } from 'better-sqlite3'
import type { BalanceRow, RoleConfigRow } from '../types/index.js'
import { getGlobalConfig } from './config.js'
import { createTransaction } from './transaction.js'
import { withTransaction } from '../db/connection.js'
import { InsufficientBalanceError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { getGlobalEffectiveRegenRate } from './roles.js'

/**
 * Calculate regenerated balance based on time elapsed
 */
export function calculateRegenBalance(
  storedAmount: number,
  lastRegenAt: Date,
  regenRate: number,
  maxBalance: number
): { currentBalance: number; regenAmount: number } {
  const now = new Date()
  const hoursSinceRegen = (now.getTime() - lastRegenAt.getTime()) / (1000 * 60 * 60)
  const regenAmount = Math.max(0, hoursSinceRegen * regenRate)
  const currentBalance = Math.min(maxBalance, storedAmount + regenAmount)

  return {
    currentBalance,
    regenAmount: currentBalance - storedAmount,
  }
}

/**
 * Get the effective regen rate for a user in a server (with role multipliers)
 */
export function getEffectiveRegenRate(
  db: Database,
  serverId: string,
  userRoles: string[]
): number {
  const { rate } = getEffectiveRegenRateWithRole(db, serverId, userRoles)
  return rate
}

/**
 * Get the effective regen rate along with the role ID that provides it
 */
export function getEffectiveRegenRateWithRole(
  db: Database,
  serverId: string,
  userRoles: string[]
): { rate: number; roleId: string | null; multiplier: number } {
  const globalConfig = getGlobalConfig()
  let multiplier = 1.0
  let bestRoleId: string | null = null

  if (userRoles.length > 0) {
    // Get all role configs for this server that match user's roles
    const placeholders = userRoles.map(() => '?').join(',')
    const roleConfigs = db.prepare(`
      SELECT role_discord_id, regen_multiplier FROM role_configs
      WHERE server_id = (SELECT id FROM servers WHERE discord_id = ?)
      AND role_discord_id IN (${placeholders})
    `).all(serverId, ...userRoles) as { role_discord_id: string; regen_multiplier: number }[]

    // Use highest multiplier and track which role provides it
    for (const config of roleConfigs) {
      if (config.regen_multiplier > multiplier) {
        multiplier = config.regen_multiplier
        bestRoleId = config.role_discord_id
      }
    }
  }

  return {
    rate: globalConfig.baseRegenRate * multiplier,
    roleId: bestRoleId,
    multiplier,
  }
}

/**
 * Get the effective cost multiplier for a user in a server
 */
export function getEffectiveCostMultiplier(
  db: Database,
  serverId: string,
  userRoles: string[]
): number {
  let multiplier = 1.0

  if (userRoles.length > 0) {
    const placeholders = userRoles.map(() => '?').join(',')
    const roleConfigs = db.prepare(`
      SELECT cost_multiplier FROM role_configs
      WHERE server_id = (SELECT id FROM servers WHERE discord_id = ?)
      AND role_discord_id IN (${placeholders})
    `).all(serverId, ...userRoles) as Pick<RoleConfigRow, 'cost_multiplier'>[]

    // Use lowest cost multiplier (best discount)
    for (const config of roleConfigs) {
      if (config.cost_multiplier < multiplier) {
        multiplier = config.cost_multiplier
      }
    }
  }

  return multiplier
}

/**
 * Get the effective max balance for a user in a server
 */
export function getEffectiveMaxBalance(
  db: Database,
  serverId: string,
  userRoles: string[]
): number {
  const globalConfig = getGlobalConfig()
  let maxBalance = globalConfig.maxBalance

  if (userRoles.length > 0) {
    const placeholders = userRoles.map(() => '?').join(',')
    const roleConfigs = db.prepare(`
      SELECT max_balance_override FROM role_configs
      WHERE server_id = (SELECT id FROM servers WHERE discord_id = ?)
      AND role_discord_id IN (${placeholders})
      AND max_balance_override IS NOT NULL
    `).all(serverId, ...userRoles) as Pick<RoleConfigRow, 'max_balance_override'>[]

    // Use highest max balance override
    for (const config of roleConfigs) {
      if (config.max_balance_override !== null && config.max_balance_override > maxBalance) {
        maxBalance = config.max_balance_override
      }
    }
  }

  return maxBalance
}

/**
 * Get balance with lazy regen applied
 */
export function getBalance(
  db: Database,
  userId: string,
  serverId?: string,
  userRoles: string[] = []
): {
  balance: number
  maxBalance: number
  regenRate: number
  effectiveRegenRate: number
  effectiveCostMultiplier: number
  lastRegenAt: Date
} {
  const globalConfig = getGlobalConfig()

  const row = db.prepare(`
    SELECT amount, last_regen_at FROM balances WHERE user_id = ?
  `).get(userId) as BalanceRow | undefined

  if (!row) {
    // Return defaults for non-existent user (they'll be created on first interaction)
    return {
      balance: globalConfig.startingBalance,
      maxBalance: globalConfig.maxBalance,
      regenRate: globalConfig.baseRegenRate,
      effectiveRegenRate: globalConfig.baseRegenRate,
      effectiveCostMultiplier: 1.0,
      lastRegenAt: new Date(),
    }
  }

  const lastRegenAt = new Date(row.last_regen_at)
  
  // For regen rate: use server context if available, otherwise check global cached roles
  // This implements "best role follows you everywhere"
  let effectiveRegenRate: number
  if (serverId) {
    effectiveRegenRate = getEffectiveRegenRate(db, serverId, userRoles)
  } else {
    // No server context (DMs, API) - use global cached roles
    const globalRegen = getGlobalEffectiveRegenRate(db, userId)
    effectiveRegenRate = globalRegen.rate
  }

  // Max balance and cost multiplier remain server-specific
  const effectiveMaxBalance = serverId
    ? getEffectiveMaxBalance(db, serverId, userRoles)
    : globalConfig.maxBalance
  const effectiveCostMultiplier = serverId
    ? getEffectiveCostMultiplier(db, serverId, userRoles)
    : 1.0

  const { currentBalance } = calculateRegenBalance(
    row.amount,
    lastRegenAt,
    effectiveRegenRate,
    effectiveMaxBalance
  )

  return {
    balance: currentBalance,
    maxBalance: effectiveMaxBalance,
    regenRate: globalConfig.baseRegenRate,
    effectiveRegenRate,
    effectiveCostMultiplier,
    lastRegenAt,
  }
}

/**
 * Apply regeneration to stored balance (call before deduction)
 */
function applyRegen(
  db: Database,
  userId: string,
  regenRate: number,
  maxBalance: number
): number {
  const row = db.prepare(`
    SELECT amount, last_regen_at FROM balances WHERE user_id = ?
  `).get(userId) as BalanceRow | undefined

  if (!row) {
    throw new Error(`Balance not found for user ${userId}`)
  }

  const lastRegenAt = new Date(row.last_regen_at)
  const { currentBalance, regenAmount } = calculateRegenBalance(
    row.amount,
    lastRegenAt,
    regenRate,
    maxBalance
  )

  // Update stored balance and reset regen timer
  db.prepare(`
    UPDATE balances SET amount = ?, last_regen_at = datetime('now') WHERE user_id = ?
  `).run(currentBalance, userId)

  if (regenAmount > 0) {
    logger.debug({ userId, regenAmount, newBalance: currentBalance }, 'Applied regen')
  }

  return currentBalance
}

/**
 * Deduct credits from a user (atomic operation)
 * Returns the new balance and transaction ID
 *
 * @param serverId - Internal server UUID for transaction logging
 * @param serverDiscordId - Discord server ID for role lookups
 */
export function deductBalance(
  db: Database,
  userId: string,
  amount: number,
  serverId: string,
  serverDiscordId: string,
  userRoles: string[],
  botDiscordId: string,
  messageId: string
): { balanceAfter: number; transactionId: string } {
  return withTransaction(db, () => {
    const effectiveRegenRate = getEffectiveRegenRate(db, serverDiscordId, userRoles)
    const effectiveMaxBalance = getEffectiveMaxBalance(db, serverDiscordId, userRoles)

    // Apply regen first
    const currentBalance = applyRegen(db, userId, effectiveRegenRate, effectiveMaxBalance)

    if (currentBalance < amount) {
      throw new InsufficientBalanceError(amount, currentBalance)
    }

    const newBalance = currentBalance - amount

    // Update balance
    db.prepare(`
      UPDATE balances SET amount = ? WHERE user_id = ?
    `).run(newBalance, userId)

    // Log transaction
    const transaction = createTransaction(db, {
      serverId,
      type: 'spend',
      fromUserId: userId,
      toUserId: null,
      botDiscordId,
      amount: -amount,
      balanceAfter: newBalance,
      metadata: { messageId },
    })

    logger.info({
      userId,
      amount,
      balanceAfter: newBalance,
      botDiscordId,
    }, 'Deducted balance')

    return {
      balanceAfter: newBalance,
      transactionId: transaction.id,
    }
  })
}

/**
 * Add credits to a user (for grants, rewards, transfers)
 */
export function addBalance(
  db: Database,
  userId: string,
  amount: number,
  serverId: string | null,
  type: 'grant' | 'reward' | 'tip' | 'transfer' | 'revoke',
  metadata?: Record<string, unknown>
): { balanceAfter: number; transactionId: string } {
  return withTransaction(db, () => {
    const globalConfig = getGlobalConfig()

    // Apply regen first (use global rates since we might not have server context)
    const currentBalance = applyRegen(
      db,
      userId,
      globalConfig.baseRegenRate,
      globalConfig.maxBalance
    )

    const newBalance = Math.min(globalConfig.maxBalance, currentBalance + amount)

    // Update balance
    db.prepare(`
      UPDATE balances SET amount = ? WHERE user_id = ?
    `).run(newBalance, userId)

    // Log transaction
    const transaction = createTransaction(db, {
      serverId,
      type,
      fromUserId: null,
      toUserId: userId,
      amount: amount,
      balanceAfter: newBalance,
      metadata,
    })

    logger.info({
      userId,
      amount,
      balanceAfter: newBalance,
      type,
    }, 'Added balance')

    return {
      balanceAfter: newBalance,
      transactionId: transaction.id,
    }
  })
}

/**
 * Transfer credits between users
 */
export function transferBalance(
  db: Database,
  fromUserId: string,
  toUserId: string,
  amount: number,
  serverId: string,
  note?: string
): {
  fromBalanceAfter: number
  toBalanceAfter: number
  transactionId: string
} {
  return withTransaction(db, () => {
    const globalConfig = getGlobalConfig()

    // Apply regen to sender
    const fromCurrentBalance = applyRegen(
      db,
      fromUserId,
      globalConfig.baseRegenRate,
      globalConfig.maxBalance
    )

    if (fromCurrentBalance < amount) {
      throw new InsufficientBalanceError(amount, fromCurrentBalance)
    }

    // Apply regen to receiver
    const toCurrentBalance = applyRegen(
      db,
      toUserId,
      globalConfig.baseRegenRate,
      globalConfig.maxBalance
    )

    const fromNewBalance = fromCurrentBalance - amount
    const toNewBalance = Math.min(globalConfig.maxBalance, toCurrentBalance + amount)

    // Update sender
    db.prepare(`
      UPDATE balances SET amount = ? WHERE user_id = ?
    `).run(fromNewBalance, fromUserId)

    // Update receiver
    db.prepare(`
      UPDATE balances SET amount = ? WHERE user_id = ?
    `).run(toNewBalance, toUserId)

    // Log transaction (from sender's perspective)
    const transaction = createTransaction(db, {
      serverId,
      type: 'transfer',
      fromUserId,
      toUserId,
      amount: amount,
      balanceAfter: fromNewBalance,
      metadata: note ? { note } : {},
    })

    logger.info({
      fromUserId,
      toUserId,
      amount,
      fromBalanceAfter: fromNewBalance,
      toBalanceAfter: toNewBalance,
    }, 'Transferred balance')

    return {
      fromBalanceAfter: fromNewBalance,
      toBalanceAfter: toNewBalance,
      transactionId: transaction.id,
    }
  })
}
