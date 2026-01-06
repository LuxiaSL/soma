/**
 * Soma Discord Bot - Entry Point
 * 
 * This bot handles:
 * - User commands (/balance, /transfer, /costs, /history)
 * - Admin commands (/soma grant, /soma set-cost, etc.)
 * - Reaction watching for rewards and tips
 * - DM notifications
 */

import { Client, GatewayIntentBits, Partials, Events, ActivityType } from 'discord.js'
import type { Database } from 'better-sqlite3'
import { registerCommands, handleInteraction } from './commands/index.js'
import { handleReactionAdd } from './handlers/reactions.js'
import { logger } from '../utils/logger.js'

/** Discord intents and partials needed for Soma bot functionality */
const CLIENT_OPTIONS = {
  intents: [
    GatewayIntentBits.Guilds,              // Basic guild info
    GatewayIntentBits.GuildMessages,        // Track bot messages
    GatewayIntentBits.GuildMessageReactions, // Watch reactions
    GatewayIntentBits.GuildMembers,         // Get member roles for multipliers
    GatewayIntentBits.DirectMessages,       // Send DM notifications
  ],
  partials: [
    Partials.Message,   // Reactions on uncached messages
    Partials.Reaction,  // Partial reaction data
    Partials.Channel,   // DM channels
  ],
}

export class SomaBot {
  private client: Client
  private db: Database
  private token: string

  constructor(db: Database, token: string) {
    this.db = db
    this.token = token
    this.client = new Client(CLIENT_OPTIONS)

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Ready event
    this.client.once(Events.ClientReady, (readyClient) => {
      logger.info({
        user: readyClient.user.tag,
        guildCount: readyClient.guilds.cache.size,
      }, 'Soma bot connected to Discord')

      // Set activity
      readyClient.user.setActivity('your ichor balance', { type: ActivityType.Watching })
    })

    // Interaction events (commands, buttons, modals)
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await handleInteraction(interaction, this.db, this.client)
      } catch (error) {
        logger.error({ error }, 'Error handling interaction')
      }
    })

    // Reaction events
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      try {
        await handleReactionAdd(reaction, user, this.db, this.client)
      } catch (error) {
        logger.error({ error }, 'Error handling reaction')
      }
    })

    // Error handling
    this.client.on(Events.Error, (error) => {
      logger.error({ error }, 'Discord client error')
    })

    this.client.on(Events.Warn, (message) => {
      logger.warn({ message }, 'Discord client warning')
    })
  }

  async start(): Promise<void> {
    logger.info('Starting Soma Discord bot...')

    // Register slash commands
    await registerCommands(this.token)

    // Login to Discord
    await this.client.login(this.token)
  }

  async stop(): Promise<void> {
    logger.info('Stopping Soma Discord bot...')
    this.client.destroy()
  }

  get discordClient(): Client {
    return this.client
  }
}

