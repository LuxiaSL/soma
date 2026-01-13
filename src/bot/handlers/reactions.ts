/**
 * Reaction Event Handler
 * 
 * Handles messageReactionAdd events for rewards and tips
 */

import {
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
  type Client,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getTrackedMessage } from '../../services/tracking.js'
import { addBalance, transferBalance, getBalance } from '../../services/balance.js'
import { getOrCreateUser, getServerByDiscordId, extractDiscordUserInfo } from '../../services/user.js'
import { hasClaimedReward, recordRewardClaim } from '../../services/rewards.js'
import { isDmOptedIn } from '../../services/preferences.js'
import { notifyTipReceived } from '../../services/notifications.js'
import { createTipReceivedEmbed } from '../embeds/builders.js'
import { sendDM, createViewMessageButton } from '../notifications/dm.js'
import { getGlobalConfig } from '../../services/config.js'
import { logger } from '../../utils/logger.js'

/** Default reward emoji */
const DEFAULT_REWARD_EMOJI = ['⭐', '🔥', '💯', '👏']

/** Default tip emoji */
const DEFAULT_TIP_EMOJI = '🫀'

/** Default reward amount */
const DEFAULT_REWARD_AMOUNT = 1

/** Default tip amount */
const DEFAULT_TIP_AMOUNT = 5

/** 
 * Per-user cooldown map: `{discordUserId}` -> timestamp of last reward
 * This is purely per-user to prevent abuse - if you reward any message,
 * you must wait before rewarding any other message.
 */
const rewardCooldowns = new Map<string, number>()

/**
 * Get reward cooldown in milliseconds from global config
 */
function getRewardCooldownMs(): number {
  const config = getGlobalConfig()
  return config.rewardCooldownSeconds * 1000
}

/**
 * Get the remaining cooldown for a user in seconds (0 if no cooldown)
 */
export function getUserRewardCooldownRemaining(discordUserId: string): number {
  const lastReward = rewardCooldowns.get(discordUserId)
  if (!lastReward) return 0
  
  const cooldownMs = getRewardCooldownMs()
  const elapsed = Date.now() - lastReward
  const remaining = cooldownMs - elapsed
  
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

/**
 * Check if a user is on reward cooldown
 */
export function isUserOnRewardCooldown(discordUserId: string): boolean {
  return getUserRewardCooldownRemaining(discordUserId) > 0
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  db: Database,
  client: Client
): Promise<void> {
  // Ignore bot reactions
  if (user.bot) return

  try {
    // Fetch partials if needed
    if (reaction.partial) {
      await reaction.fetch()
    }
    if (reaction.message.partial) {
      await reaction.message.fetch()
    }
    if (user.partial) {
      await user.fetch()
    }
  } catch (error) {
    logger.error({ error }, 'Failed to fetch reaction/message partials')
    return
  }

  const messageId = reaction.message.id
  const emoji = reaction.emoji.name

  if (!emoji) return

  // Check if this is a tracked bot message
  const tracked = getTrackedMessage(db, messageId)
  if (!tracked) return

  // Can't reward yourself
  if (user.id === tracked.triggerUserDiscordId) return

  // Get server config
  const server = tracked.serverId
    ? getServerByDiscordId(db, tracked.serverId)
    : null

  const serverConfig = server?.config || {
    rewardEmoji: DEFAULT_REWARD_EMOJI,
    rewardAmount: DEFAULT_REWARD_AMOUNT,
    tipEmoji: DEFAULT_TIP_EMOJI,
    tipAmount: DEFAULT_TIP_AMOUNT,
  }

  logger.debug({
    messageId,
    emoji,
    reactorId: user.id,
    triggerUserId: tracked.triggerUserDiscordId,
    isTip: emoji === serverConfig.tipEmoji,
    isReward: serverConfig.rewardEmoji.includes(emoji),
  }, 'Processing reaction on tracked message')

  // Check for tip
  if (emoji === serverConfig.tipEmoji) {
    await processTip(
      db,
      client,
      user as User,
      tracked.triggerUserId,
      tracked.triggerUserDiscordId,
      tracked.serverId,
      serverConfig.tipAmount,
      reaction.message
    )
    return
  }

  // Check for reward
  if (serverConfig.rewardEmoji.includes(emoji)) {
    await processReward(
      db,
      user as User,
      tracked.triggerUserId,
      tracked.serverId,
      serverConfig.rewardAmount,
      emoji,
      messageId
    )
  }
}

async function processTip(
  db: Database,
  client: Client,
  tipper: User,
  recipientUserId: string,
  recipientDiscordId: string,
  serverId: string | null,
  tipAmount: number,
  message: any
): Promise<void> {
  // Ensure tipper exists and cache their profile
  const tipperUser = getOrCreateUser(db, tipper.id, extractDiscordUserInfo(tipper))

  // Check tipper has enough balance
  const tipperBalance = getBalance(db, tipperUser.id)
  if (tipperBalance.balance < tipAmount) {
    logger.debug({
      tipperId: tipper.id,
      required: tipAmount,
      available: tipperBalance.balance,
    }, 'Tipper has insufficient balance for tip')
    return
  }

  try {
    // Transfer ichor from tipper to recipient
    const result = transferBalance(
      db,
      tipperUser.id,
      recipientUserId,
      tipAmount,
      serverId || '',
      `Tip for message ${message.id}`
    )

    // Get recipient Discord user
    const recipient = await client.users.fetch(recipientDiscordId)
    const channel = message.channel

    // Build message URL
    const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`
    const channelName = channel.name || 'channel'

    // Check if recipient has opted into DMs
    const dmOptedIn = isDmOptedIn(db, recipientUserId)
    let dmSent = false

    if (dmOptedIn) {
      // DM recipient about the tip with View Message button
      const embed = createTipReceivedEmbed(
        tipper.tag,
        tipAmount,
        channelName,
        result.toBalanceAfter,
        messageUrl
      )

      // Add View Message button if we have the guild/channel/message IDs
      const viewMessageButton = message.guildId && message.channelId && message.id
        ? createViewMessageButton(message.guildId, message.channelId, message.id)
        : undefined

      dmSent = await sendDM(recipient, {
        embeds: [embed],
        components: viewMessageButton ? [viewMessageButton] : [],
      })

      if (dmSent) {
        logger.debug({
          recipientId: recipientDiscordId,
          amount: tipAmount,
        }, 'Sent tip received DM')
      }
    }

    // If DMs not enabled or failed, store notification in inbox
    if (!dmSent) {
      notifyTipReceived(
        db,
        recipientUserId,
        tipper.tag,
        tipAmount,
        channelName,
        messageUrl
      )
      
      logger.debug({
        recipientId: recipientUserId,
        dmOptedIn,
      }, 'Stored tip notification in inbox')
    }

    logger.info({
      tipperId: tipper.id,
      recipientId: recipientDiscordId,
      amount: tipAmount,
      messageId: message.id,
      notificationMethod: dmSent ? 'dm' : 'inbox',
    }, 'Tip processed successfully')

  } catch (error: any) {
    logger.error({
      error,
      tipperId: tipper.id,
      recipientId: recipientDiscordId,
    }, 'Failed to process tip')
  }
}

async function processReward(
  db: Database,
  reactor: User,
  recipientUserId: string,
  serverId: string | null,
  rewardAmount: number,
  emoji: string,
  messageId: string
): Promise<void> {
  // Get reactor's internal user ID for permanent tracking and cache their profile
  const reactorUser = getOrCreateUser(db, reactor.id, extractDiscordUserInfo(reactor))

  // Check if user has already rewarded this message (permanent check)
  if (hasClaimedReward(db, reactorUser.id, messageId)) {
    logger.debug({
      reactorId: reactor.id,
      messageId,
    }, 'Reward already claimed for this message')
    return
  }

  // Check per-user rate limit cooldown (prevents rapid rewarding across any messages)
  const cooldownRemaining = getUserRewardCooldownRemaining(reactor.id)
  if (cooldownRemaining > 0) {
    logger.debug({
      reactorId: reactor.id,
      messageId,
      cooldownRemaining,
    }, 'User on reward cooldown')
    return
  }

  // Set per-user cooldown (applies to all future rewards regardless of message)
  rewardCooldowns.set(reactor.id, Date.now())

  try {
    // Record the reward claim permanently (before granting, for atomicity)
    recordRewardClaim(db, reactorUser.id, messageId)

    // Add reward to recipient (rewards are free for the reactor)
    const result = addBalance(
      db,
      recipientUserId,
      rewardAmount,
      serverId,
      'reward',
      { emoji, messageId, reactorId: reactor.id }
    )

    logger.info({
      reactorId: reactor.id,
      recipientUserId,
      amount: rewardAmount,
      emoji,
      messageId,
      newBalance: result.balanceAfter,
    }, 'Reward processed successfully')

    // Rewards are silent - no DM notification (too noisy)

  } catch (error: any) {
    logger.error({
      error,
      reactorId: reactor.id,
      recipientUserId,
    }, 'Failed to process reward')
  }
}

/**
 * Cleanup old cooldown entries (call periodically)
 */
export function cleanupRewardCooldowns(): void {
  const now = Date.now()
  const cooldownMs = getRewardCooldownMs()
  let cleaned = 0

  for (const [userId, timestamp] of rewardCooldowns.entries()) {
    // Clean up entries that are well past the cooldown period
    if (now - timestamp > cooldownMs * 2) {
      rewardCooldowns.delete(userId)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Cleaned up user reward cooldowns')
  }
}

