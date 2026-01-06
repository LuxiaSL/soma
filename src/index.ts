/**
 * Soma - Credit Management Service
 *
 * Entry point for the Soma API server and Discord bot
 */

import { loadConfig } from './config.js'
import { initDatabase, closeDatabase } from './db/connection.js'
import { ApiServer } from './api/server.js'
import { SomaBot } from './bot/index.js'
import { cleanupExpiredMessages } from './services/tracking.js'
import { logger } from './utils/logger.js'

async function main(): Promise<void> {
  logger.info('Starting Soma...')

  // Load configuration
  const config = loadConfig()
  logger.info({
    port: config.port,
    databasePath: config.databasePath,
    tokenCount: config.serviceTokens.length,
    botEnabled: !!config.discordToken,
  }, 'Configuration loaded')

  // Initialize database
  const db = initDatabase(config.databasePath)

  // Create API server
  const server = new ApiServer(config, db)

  // Create Discord bot (if token is configured)
  let bot: SomaBot | null = null
  if (config.discordToken) {
    bot = new SomaBot(db, config.discordToken)
  } else {
    logger.warn('SOMA_DISCORD_TOKEN not set - Discord bot will not start')
  }

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...')

    if (bot) {
      await bot.stop()
    }
    await server.stop()
    closeDatabase(db)

    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // Start API server
  await server.start()
  logger.info(`Soma API ready at http://localhost:${config.port}`)

  // Start Discord bot
  if (bot) {
    await bot.start()
  }

  // Start periodic cleanup of expired tracked messages
  setInterval(() => {
    try {
      cleanupExpiredMessages(db)
    } catch (error) {
      logger.error({ error }, 'Error during tracked message cleanup')
    }
  }, 60 * 60 * 1000) // Every hour

  logger.info('Soma startup complete')
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start Soma')
  process.exit(1)
})
