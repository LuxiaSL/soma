/**
 * Notification Event Handler
 * 
 * Handles events from the API server to send notifications via Discord
 * Primarily for insufficient funds DM notifications
 */

import type { Client, TextChannel } from 'discord.js'
import type { SomaEventBus, InsufficientFundsEvent } from '../../types/events.js'
import { createInsufficientFundsEmbed, Emoji } from '../embeds/builders.js'
import { sendDM, createBalanceCheckButtons } from '../notifications/dm.js'
import { logger } from '../../utils/logger.js'

/**
 * Set up event handlers for API -> Bot notifications
 */
export function setupNotificationHandlers(
  eventBus: SomaEventBus,
  client: Client
): void {
  logger.info('Setting up notification event handlers')

  eventBus.on('insufficientFunds', async (event: InsufficientFundsEvent) => {
    try {
      await handleInsufficientFunds(client, event)
    } catch (error) {
      logger.error({ error, event }, 'Failed to handle insufficient funds notification')
    }
  })
}

/**
 * Handle insufficient funds event:
 * 1. Add 💸 reaction to the triggering message
 * 2. Send DM to user with details and buttons
 * 3. If DM fails, add 📭 reaction instead
 */
async function handleInsufficientFunds(
  client: Client,
  event: InsufficientFundsEvent
): Promise<void> {
  logger.debug({
    userId: event.userDiscordId,
    channelId: event.channelId,
    messageId: event.messageId,
    cost: event.cost,
    balance: event.currentBalance,
  }, 'Handling insufficient funds notification')

  // 1. Try to add 💸 reaction to the triggering message
  if (event.channelId && event.messageId) {
    try {
      const channel = await client.channels.fetch(event.channelId)
      if (channel?.isTextBased()) {
        const message = await (channel as TextChannel).messages.fetch(event.messageId)
        await message.react(Emoji.INSUFFICIENT) // 💸
        logger.debug({
          messageId: event.messageId,
          emoji: Emoji.INSUFFICIENT,
        }, 'Added insufficient funds reaction')
      }
    } catch (error) {
      logger.error({ error, messageId: event.messageId }, 'Failed to add insufficient funds reaction')
    }
  }

  // 2. Send DM to user with details
  let dmSent = false
  try {
    const user = await client.users.fetch(event.userDiscordId)
    
    const embed = createInsufficientFundsEmbed(
      event.botName,
      event.cost,
      event.currentBalance,
      event.regenRate
    )
    
    const buttons = createBalanceCheckButtons()
    
    dmSent = await sendDM(user, {
      embeds: [embed],
      components: [buttons],
    })

    if (dmSent) {
      logger.info({
        userId: event.userDiscordId,
        botName: event.botName,
        cost: event.cost,
        balance: event.currentBalance,
      }, 'Sent insufficient funds DM')
    }
  } catch (error) {
    logger.error({ error, userId: event.userDiscordId }, 'Failed to fetch user for DM')
  }

  // 3. If DM failed (user has DMs disabled), add 📭 reaction instead
  if (!dmSent && event.channelId && event.messageId) {
    try {
      const channel = await client.channels.fetch(event.channelId)
      if (channel?.isTextBased()) {
        const message = await (channel as TextChannel).messages.fetch(event.messageId)
        await message.react(Emoji.DM_FAILED) // 📭
        logger.debug({
          messageId: event.messageId,
          emoji: Emoji.DM_FAILED,
        }, 'Added DM failed reaction (user has DMs disabled)')
      }
    } catch (error) {
      logger.error({ error, messageId: event.messageId }, 'Failed to add DM failed reaction')
    }
  }
}

