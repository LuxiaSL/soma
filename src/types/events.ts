/**
 * Event Types for Soma Internal Communication
 * 
 * These events are used for communication between the API server
 * and the Discord bot (e.g., for insufficient funds notifications)
 */

import type { EventEmitter } from 'events'

/**
 * Event emitted when a user has insufficient funds to trigger a bot
 */
export interface InsufficientFundsEvent {
  /** Discord user ID */
  userDiscordId: string
  /** Discord server ID */
  serverId: string
  /** Discord channel ID where the trigger happened */
  channelId?: string
  /** Discord message ID that triggered the bot */
  messageId?: string
  /** Name/description of the bot they tried to use */
  botName: string
  /** Bot's Discord ID */
  botId: string
  /** Cost of the bot activation */
  cost: number
  /** User's current balance */
  currentBalance: number
  /** User's effective regeneration rate */
  regenRate: number
  /** Minutes until user can afford this bot */
  timeToAfford: number
  /** Cheaper alternatives the user might be able to afford */
  cheaperAlternatives: Array<{
    name: string
    cost: number
    canAfford: boolean
  }>
}

/**
 * All Soma event types
 */
export interface SomaEvents {
  insufficientFunds: [InsufficientFundsEvent]
}

/**
 * Typed event emitter for Soma events
 */
export interface SomaEventBus extends EventEmitter {
  emit<K extends keyof SomaEvents>(event: K, ...args: SomaEvents[K]): boolean
  on<K extends keyof SomaEvents>(event: K, listener: (...args: SomaEvents[K]) => void): this
  once<K extends keyof SomaEvents>(event: K, listener: (...args: SomaEvents[K]) => void): this
  off<K extends keyof SomaEvents>(event: K, listener: (...args: SomaEvents[K]) => void): this
}

