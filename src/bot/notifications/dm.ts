/**
 * DM Notification Helpers
 * 
 * Utilities for sending DM notifications to users
 */

import {
  type User,
  type MessageCreateOptions,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import { logger } from '../../utils/logger.js'

/**
 * Send a DM to a user, handling errors gracefully
 * 
 * @returns true if DM was sent successfully, false if user has DMs disabled
 */
export async function sendDM(
  user: User,
  options: MessageCreateOptions
): Promise<boolean> {
  try {
    await user.send(options)
    return true
  } catch (error: any) {
    // Error code 50007 = Cannot send messages to this user (DMs disabled)
    if (error.code === 50007) {
      logger.debug({
        userId: user.id,
        username: user.tag,
      }, 'Cannot DM user - DMs disabled')
      return false
    }

    logger.error({
      error,
      userId: user.id,
    }, 'Failed to send DM')
    return false
  }
}

/**
 * Create a button to view a message in channel
 */
export function createViewMessageButton(
  guildId: string,
  channelId: string,
  messageId: string
): ActionRowBuilder<ButtonBuilder> {
  const url = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`

  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('View Message')
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    )
}

/**
 * Create balance check buttons for DM notifications
 */
export function createBalanceCheckButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('balance_view')
        .setLabel('Check Balance')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('costs_view')
        .setLabel('View Costs')
        .setStyle(ButtonStyle.Secondary),
    )
}

