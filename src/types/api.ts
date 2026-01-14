/**
 * API Request/Response Types
 */

// ============================================================================
// POST /check-and-deduct
// ============================================================================

export interface CheckAndDeductRequest {
  userId: string           // Discord user ID
  serverId: string         // Discord guild ID (for role multipliers)
  channelId?: string       // Discord channel ID (for reactions)
  botId: string            // Bot's Discord ID
  messageId?: string       // Triggering message ID
  triggerType: 'mention' | 'reply' | 'm_continue'
  userRoles: string[]      // User's role IDs for cost multipliers
}

export interface CheckAndDeductSuccessResponse {
  allowed: true
  cost: number
  balanceAfter: number
  transactionId: string
}

export interface CheckAndDeductFailedResponse {
  allowed: false
  cost: number
  currentBalance: number
  regenRate: number
  timeToAfford: number  // Minutes until user can afford
  cheaperAlternatives: Array<{
    botId: string
    name: string
    cost: number
  }>
}

export type CheckAndDeductResponse = CheckAndDeductSuccessResponse | CheckAndDeductFailedResponse

// ============================================================================
// GET /balance/:userId
// ============================================================================

export interface GetBalanceResponse {
  balance: number
  maxBalance: number
  regenRate: number
  effectiveRegenRate?: number     // With role multiplier (if serverId provided)
  effectiveCostMultiplier?: number // Role discount (if serverId provided)
  nextRegenAt: string | null       // ISO timestamp, null if at max balance
}

// ============================================================================
// POST /transfer
// ============================================================================

export interface TransferRequest {
  fromUserId: string
  toUserId: string
  serverId: string
  amount: number
  note?: string
}

export interface TransferResponse {
  success: boolean
  transactionId: string
  fromBalanceAfter: number
  toBalanceAfter: number
}

// ============================================================================
// GET /costs/:serverId
// ============================================================================

export interface GetCostsResponse {
  bots: Array<{
    botId: string
    name: string
    cost: number
    description: string | null
  }>
}

// ============================================================================
// POST /reward
// ============================================================================

export interface RewardRequest {
  serverId: string
  originUserId: string     // Who triggered the bot
  reactorUserId: string    // Who reacted
  messageId: string
  emoji: string
  isTip: boolean
}

export interface RewardResponse {
  success: boolean
  amount: number
  originBalanceAfter: number
  reactorBalanceAfter?: number  // Only for tips
}

// ============================================================================
// GET /history/:userId/:serverId
// ============================================================================

export interface GetHistoryRequest {
  limit?: number  // Default 20
}

export interface TransactionHistoryItem {
  id: string
  timestamp: string
  type: string
  amount: number
  balanceAfter: number
  botName?: string
  messageId?: string
  otherUserId?: string
  note?: string
}

export interface GetHistoryResponse {
  transactions: TransactionHistoryItem[]
}

// ============================================================================
// POST /admin/grant
// ============================================================================

export interface AdminGrantRequest {
  userId: string
  serverId: string
  amount: number
  reason?: string
}

export interface AdminGrantResponse {
  success: boolean
  transactionId: string
  balanceAfter: number
}

// ============================================================================
// POST /admin/set-cost
// ============================================================================

export interface AdminSetCostRequest {
  botId: string
  serverId: string | null  // null for global default
  cost: number
  description?: string
}

export interface AdminSetCostResponse {
  success: boolean
  previousCost: number | null
}

// ============================================================================
// POST /admin/configure
// ============================================================================

export interface AdminConfigureRequest {
  serverId: string
  config: Partial<{
    rewardEmoji: string[]
    rewardAmount: number
    tipEmoji: string
    tipAmount: number
    bountyEmoji: string
    bountyStarCost: number
    bountyTiers: Array<{ threshold: number; reward: number }>
  }>
}

export interface AdminConfigureResponse {
  success: boolean
}

// ============================================================================
// POST /refund
// ============================================================================

export interface RefundRequest {
  transactionId: string    // Original transaction to refund
  reason?: string          // Optional reason (e.g., 'inference_failed')
}

export interface RefundResponse {
  success: boolean
  refundTransactionId: string
  amount: number
  balanceAfter: number
}

// ============================================================================
// Error Response
// ============================================================================

export interface ErrorResponse {
  error: string      // Error code (e.g., 'INSUFFICIENT_BALANCE')
  message: string    // Human-readable message
  details?: Record<string, unknown>
}

// ============================================================================
// POST /track-message
// ============================================================================

export interface TrackMessageRequest {
  messageId: string         // Discord message ID (bot's response)
  channelId: string         // Discord channel ID
  serverId: string          // Discord guild ID
  botId: string             // Bot's Discord ID
  triggerUserId: string     // Discord user ID who triggered the bot
  triggerMessageId?: string // Discord message ID of user's triggering message (optional)
}

export interface TrackMessageResponse {
  success: boolean
  expiresAt: string      // ISO timestamp when tracking expires
}

// ============================================================================
// GET /tracked-message/:messageId
// ============================================================================

export interface GetTrackedMessageResponse {
  messageId: string
  channelId: string
  serverId: string | null
  botDiscordId: string
  triggerUserId: string
  triggerUserDiscordId: string
  triggerMessageId: string | null
  createdAt: string
  expiresAt: string
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthResponse {
  status: 'ok' | 'error'
  version: string
  uptime: number
}
