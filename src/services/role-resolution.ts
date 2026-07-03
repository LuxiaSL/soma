/**
 * Role Resolution
 *
 * Resolves a set of role configs that apply to a user into a single set of
 * effective modifiers, using PRIORITY-based precedence.
 *
 * Rules:
 * - Only the configs in the highest `priority` tier are considered. A role with
 *   priority 10 fully outranks one with priority 0 — the lower-priority role's
 *   values are ignored entirely.
 * - Within the winning tier, dimensions resolve independently:
 *     - regen multiplier: highest wins (best boost)
 *     - cost multiplier:  lowest wins  (best discount)
 *     - max balance:      the override is taken directly (highest among the tier),
 *                         and is applied verbatim by callers — it can RAISE or
 *                         LOWER the effective cap relative to the global max.
 * - With all priorities equal (e.g. legacy rows, which default to 0) this reduces
 *   exactly to the historical "best role wins" behaviour, so it is backwards
 *   compatible with existing configs.
 *
 * This module is dependency-free (no db, no config) so it can be shared by both
 * balance.ts and roles.ts without creating an import cycle.
 */

export interface RoleConfigModifierRow {
  role_discord_id: string
  regen_multiplier: number
  cost_multiplier: number
  max_balance_override: number | null
  priority: number
}

export interface ResolvedRoleModifiers {
  /** Effective regen multiplier (default 1.0 when no role beats baseline) */
  regenMultiplier: number
  /** Effective cost multiplier (default 1.0) */
  costMultiplier: number
  /**
   * Effective max-balance override, or null to fall back to the global max.
   * Applied directly by callers (`override ?? globalMax`) — may lower the cap.
   */
  maxBalanceOverride: number | null
  /** The role id that provides the winning regen multiplier, if any */
  regenRoleId: string | null
}

const DEFAULT_MODIFIERS: ResolvedRoleModifiers = {
  regenMultiplier: 1.0,
  costMultiplier: 1.0,
  maxBalanceOverride: null,
  regenRoleId: null,
}

/**
 * Resolve role configs into effective modifiers using the top-priority tier.
 */
export function resolveRoleModifiers(
  roleConfigs: RoleConfigModifierRow[]
): ResolvedRoleModifiers {
  if (!roleConfigs || roleConfigs.length === 0) {
    return { ...DEFAULT_MODIFIERS }
  }

  // Guard against NaN/undefined priorities from bad data — treat as 0.
  const priorityOf = (c: RoleConfigModifierRow): number =>
    typeof c.priority === 'number' && Number.isFinite(c.priority) ? c.priority : 0

  const topPriority = roleConfigs.reduce(
    (max, c) => Math.max(max, priorityOf(c)),
    Number.NEGATIVE_INFINITY
  )
  const tier = roleConfigs.filter(c => priorityOf(c) === topPriority)

  let regenMultiplier = 1.0
  let regenRoleId: string | null = null
  let costMultiplier = 1.0
  let maxBalanceOverride: number | null = null

  for (const config of tier) {
    if (typeof config.regen_multiplier === 'number' && config.regen_multiplier > regenMultiplier) {
      regenMultiplier = config.regen_multiplier
      regenRoleId = config.role_discord_id
    }
    if (typeof config.cost_multiplier === 'number' && config.cost_multiplier < costMultiplier) {
      costMultiplier = config.cost_multiplier
    }
    if (
      config.max_balance_override !== null &&
      config.max_balance_override !== undefined &&
      (maxBalanceOverride === null || config.max_balance_override > maxBalanceOverride)
    ) {
      maxBalanceOverride = config.max_balance_override
    }
  }

  return { regenMultiplier, costMultiplier, maxBalanceOverride, regenRoleId }
}
