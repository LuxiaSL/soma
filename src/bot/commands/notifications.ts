/**
 * /notifications Command
 * 
 * View and manage in-app notifications
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { getOrCreateUser, extractDiscordUserInfo } from '../../services/user.js'
import {
  getNotifications,
  markAllNotificationsRead,
  type UserNotification,
} from '../../services/notifications.js'
import { Emoji, Colors } from '../embeds/builders.js'
import { logger } from '../../utils/logger.js'

const PAGE_SIZE = 5

export const notificationsCommand = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('View your notification inbox')
  .addBooleanOption(opt =>
    opt
      .setName('unread')
      .setDescription('Show only unread notifications'))

export async function executeNotifications(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<void> {
  const unreadOnly = interaction.options.getBoolean('unread') ?? false
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))

  await showNotificationsPage(interaction, db, user.id, 0, unreadOnly, false)
}

/**
 * Show a page of notifications
 */
async function showNotificationsPage(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  db: Database,
  userId: string,
  page: number,
  unreadOnly: boolean,
  isUpdate: boolean
): Promise<void> {
  const { notifications, totalCount, unreadCount } = getNotifications(db, userId, {
    page,
    pageSize: PAGE_SIZE,
    unreadOnly,
  })

  const totalPages = Math.max(1, Math.ceil(
    (unreadOnly ? unreadCount : totalCount) / PAGE_SIZE
  ))

  const embed = createNotificationsEmbed(notifications, page, totalPages, unreadCount, unreadOnly)
  const components = createNotificationsComponents(notifications, page, totalPages, unreadOnly, unreadCount)

  if (isUpdate && interaction.isButton()) {
    await interaction.update({
      embeds: [embed],
      components,
    })
  } else {
    await interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
    })
  }
}

/**
 * Create the notifications embed
 */
function createNotificationsEmbed(
  notifications: UserNotification[],
  page: number,
  totalPages: number,
  unreadCount: number,
  unreadOnly: boolean
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.ICHOR_PURPLE)
    .setTitle(`📥 Notifications${unreadOnly ? ' (Unread)' : ''}`)
    .setTimestamp()

  if (notifications.length === 0) {
    embed.setDescription(
      unreadOnly
        ? '✨ No unread notifications!'
        : '📭 Your inbox is empty.\n\nNotifications appear here when you receive tips, transfers, or alerts.'
    )
    return embed
  }

  // Build notification list
  const lines: string[] = []
  for (const notif of notifications) {
    const readIcon = notif.read ? '○' : '●'
    const typeIcon = getNotificationTypeIcon(notif.type)
    const timestamp = `<t:${Math.floor(notif.createdAt.getTime() / 1000)}:R>`
    
    lines.push(
      `${readIcon} ${typeIcon} **${notif.title}** ${timestamp}\n` +
      `　 ${notif.message}` +
      (notif.actionHint ? `\n　 _→ ${notif.actionHint}_` : '')
    )
  }

  embed.setDescription(lines.join('\n\n'))

  // Footer with page info and unread count
  const pageInfo = totalPages > 1 ? `Page ${page + 1}/${totalPages}` : ''
  const unreadInfo = unreadCount > 0 ? `${unreadCount} unread` : 'All read'
  embed.setFooter({ text: [pageInfo, unreadInfo].filter(Boolean).join(' • ') })

  return embed
}

/**
 * Create action buttons for notifications
 */
function createNotificationsComponents(
  _notifications: UserNotification[],
  page: number,
  totalPages: number,
  unreadOnly: boolean,
  unreadCount: number
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  // Pagination row (if needed)
  if (totalPages > 1) {
    const paginationRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`notif_prev_${page}_${unreadOnly ? '1' : '0'}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`notif_page_${page}`)
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`notif_next_${page}_${unreadOnly ? '1' : '0'}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
      )
    rows.push(paginationRow)
  }

  // Action row
  const actionRow = new ActionRowBuilder<ButtonBuilder>()

  // Mark all as read button (if there are unread)
  if (unreadCount > 0) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('notif_mark_all_read')
        .setLabel(`${Emoji.CHECK} Mark All Read`)
        .setStyle(ButtonStyle.Success)
    )
  }

  // Toggle unread filter
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`notif_toggle_filter_${unreadOnly ? '0' : '1'}`)
      .setLabel(unreadOnly ? '📋 Show All' : '📬 Unread Only')
      .setStyle(ButtonStyle.Secondary)
  )

  // Refresh button
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`notif_refresh_${unreadOnly ? '1' : '0'}`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  )

  if (actionRow.components.length > 0) {
    rows.push(actionRow)
  }

  return rows
}

/**
 * Get icon for notification type
 */
function getNotificationTypeIcon(type: string): string {
  switch (type) {
    case 'insufficient_funds':
      return '💸'
    case 'transfer_received':
      return '💜'
    case 'tip_received':
      return '🫀'
    case 'reward_received':
      return '⭐'
    case 'grant_received':
      return '🎁'
    case 'low_balance':
      return '⚠️'
    case 'system':
      return '📢'
    default:
      return '📬'
  }
}

/**
 * Handle notification button interactions
 */
export async function handleNotificationsButton(
  customId: string,
  interaction: ButtonInteraction,
  db: Database
): Promise<boolean> {
  const user = getOrCreateUser(db, interaction.user.id, extractDiscordUserInfo(interaction.user))

  // Pagination: notif_prev_{page}_{unreadOnly} or notif_next_{page}_{unreadOnly}
  if (customId.startsWith('notif_prev_') || customId.startsWith('notif_next_')) {
    const parts = customId.split('_')
    const direction = customId.includes('prev') ? -1 : 1
    const currentPage = parseInt(parts[2])
    const unreadOnly = parts[3] === '1'
    const newPage = currentPage + direction

    await showNotificationsPage(interaction, db, user.id, newPage, unreadOnly, true)
    return true
  }

  // Toggle filter: notif_toggle_filter_{newValue}
  if (customId.startsWith('notif_toggle_filter_')) {
    const unreadOnly = customId.endsWith('_1')
    await showNotificationsPage(interaction, db, user.id, 0, unreadOnly, true)
    return true
  }

  // Refresh: notif_refresh_{unreadOnly}
  if (customId.startsWith('notif_refresh_')) {
    const unreadOnly = customId.endsWith('_1')
    await showNotificationsPage(interaction, db, user.id, 0, unreadOnly, true)
    return true
  }

  // Mark all as read
  if (customId === 'notif_mark_all_read') {
    const count = markAllNotificationsRead(db, user.id)
    
    logger.info({
      userId: user.id,
      count,
    }, 'User marked all notifications as read')

    // Refresh the view
    await showNotificationsPage(interaction, db, user.id, 0, false, true)
    return true
  }

  // View notifications (from settings page)
  if (customId === 'notifications_view') {
    await showNotificationsPage(interaction, db, user.id, 0, false, true)
    return true
  }

  return false
}

