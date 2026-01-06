/**
 * Command Registration and Handler
 * 
 * Manages slash command registration and routing
 */

import {
  REST,
  Routes,
  type Client,
  type Interaction,
  MessageFlags,
} from 'discord.js'
import type { Database } from 'better-sqlite3'
import { logger } from '../../utils/logger.js'

// Import command modules
import { balanceCommand, executeBalance } from './balance.js'
import { transferCommand, executeTransfer } from './transfer.js'
import { costsCommand, executeCosts } from './costs.js'
import { historyCommand, executeHistory } from './history.js'
import { somaAdminCommand, executeSomaAdmin } from './admin.js'
import { handleButton } from '../handlers/buttons.js'
import { handleAutocomplete } from '../handlers/autocomplete.js'

/** All registered slash commands */
const commands = [
  balanceCommand,
  transferCommand,
  costsCommand,
  historyCommand,
  somaAdminCommand,
]

/**
 * Register slash commands with Discord
 */
export async function registerCommands(token: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token)

  try {
    const commandData = commands.map(cmd => cmd.toJSON())

    logger.info({ commandCount: commandData.length }, 'Registering slash commands...')

    // Get client ID from token
    const base64 = token.split('.')[0]
    const clientId = Buffer.from(base64, 'base64').toString()

    // Register globally (takes ~1 hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    })

    logger.info('Successfully registered slash commands')
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands')
    throw error
  }
}

/**
 * Handle all interaction events
 */
export async function handleInteraction(
  interaction: Interaction,
  db: Database,
  client: Client
): Promise<void> {
  try {
    // Chat input commands (slash commands)
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, db, client)
      return
    }

    // Button interactions
    if (interaction.isButton()) {
      await handleButton(interaction, db, client)
      return
    }

    // Autocomplete
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, db)
      return
    }

    // Modal submissions are handled in specific command flows

  } catch (error) {
    logger.error({
      error,
      interactionType: interaction.type,
      userId: interaction.user.id,
    }, 'Error handling interaction')

    // Try to respond with error if we haven't already
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '⚠️ Something went wrong. Please try again in a moment.',
          flags: MessageFlags.Ephemeral,
        })
      } catch {
        // Ignore if we can't reply
      }
    }
  }
}

/**
 * Route slash commands to their handlers
 */
async function handleCommand(
  interaction: Interaction,
  db: Database,
  client: Client
): Promise<void> {
  if (!interaction.isChatInputCommand()) return

  const { commandName } = interaction

  logger.debug({
    command: commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  }, 'Handling command')

  switch (commandName) {
    case 'balance':
      await executeBalance(interaction, db)
      break

    case 'transfer':
      await executeTransfer(interaction, db, client)
      break

    case 'costs':
      await executeCosts(interaction, db)
      break

    case 'history':
      await executeHistory(interaction, db)
      break

    case 'soma':
      await executeSomaAdmin(interaction, db, client)
      break

    default:
      logger.warn({ commandName }, 'Unknown command')
      await interaction.reply({
        content: '❌ Unknown command.',
        flags: MessageFlags.Ephemeral,
      })
  }
}

