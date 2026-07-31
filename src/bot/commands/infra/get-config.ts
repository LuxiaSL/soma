/**
 * /get_config Command
 *
 * Retrieves the effective configuration for a bot in the current channel.
 * Reads pinned .config messages and overlays them onto the bot's base config.
 *
 * Uses the EMS config layout on disk to load base configs.
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
  type ThreadChannel,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { CONFIG_KEYS } from '../../../infra/config-message.js'
import { getPinnedData } from '../../../infra/pin-cache.js'
import { redactConfig, redactString, isRedacted } from '../../../infra/redact.js'
import { logger } from '../../../utils/logger.js'

/**
 * EMS path — the directory containing bot configs in EMS layout.
 * Expected structure: {EMS_PATH}/{botName}/config.yaml
 */
function getEmsPath(): string {
  return process.env.EMS_PATH || '/opt/chapter2/ems'
}

export const getConfigCommand = new SlashCommandBuilder()
  .setName('get_config')
  .setDescription('View the effective config for a bot in this channel')
  .addStringOption(opt =>
    opt.setName('bot')
      .setDescription('Bot name to check config for')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('property')
      .setDescription('Specific config property to view (returns full config if blank)')
      .setRequired(false)
      .setAutocomplete(true)
  )

export async function executeGetConfig(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const botName = interaction.options.getString('bot', true)
    const property = interaction.options.getString('property')
    const channel = interaction.channel as TextChannel | ThreadChannel

    if (!channel) {
      await interaction.editReply({ content: '❌ Cannot use this command here.' })
      return
    }

    // Load base config from EMS
    const emsPath = getEmsPath()
    const configPath = join(emsPath, botName, 'config.yaml')

    if (!existsSync(configPath)) {
      await interaction.editReply({
        content: `❌ No config found for bot **${botName}** at ${configPath}`,
      })
      return
    }

    let config: Record<string, unknown>
    try {
      const raw = readFileSync(configPath, 'utf-8')
      const parsed = yamlParse(raw) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        await interaction.editReply({
          content: `❌ Config for **${botName}** is not a YAML mapping.`,
        })
        return
      }
      config = parsed as Record<string, unknown>
    } catch (error) {
      // YAML parse errors quote the offending source line — redact before echoing.
      const detail = error instanceof Error ? redactString(error.message) : 'Unknown error'
      await interaction.editReply({
        content: `❌ Failed to parse config for **${botName}**: ${detail}`,
      })
      return
    }

    // Overlay pinned .config messages from this channel (uses pin cache)
    const pinData = await getPinnedData(channel)
    // Process oldest first (so newest overrides oldest)
    const configPins = pinData
      .filter(pin => pin.content.startsWith('.config'))
      .reverse()

    for (const pin of configPins) {
      const yamlStart = pin.content.indexOf('---')
      if (yamlStart === -1) continue

      // Check targeting: does this config apply to our bot?
      const headerLine = pin.content.slice(0, yamlStart).trim()
      const targets = headerLine.slice('.config'.length).trim()

      if (targets && !targets.split(/\s+/).some(t =>
        t.toLowerCase() === botName.toLowerCase() ||
        t === 'all'
      )) {
        continue // This config targets other bots
      }

      try {
        const yamlContent = pin.content.slice(yamlStart + 3).trim()
        // Strip markdown code blocks if present
        const cleanYaml = yamlContent
          .replace(/^```(?:yaml)?\n?/m, '')
          .replace(/\n?```$/m, '')

        const overrides = yamlParse(cleanYaml)
        if (overrides && typeof overrides === 'object') {
          Object.assign(config, overrides)
        }
      } catch {
        // Skip malformed config pins
      }
    }

    // Redact credentials — recursively, after the pin overlay, so anything a
    // pinned .config introduced is scrubbed too. Fail closed: if redaction
    // itself errors we send nothing rather than falling back to raw config.
    let safeConfig: Record<string, unknown>
    try {
      safeConfig = redactConfig(config)
    } catch (error) {
      logger.error({ error, botName }, 'Config redaction failed — withholding config')
      await interaction.editReply({
        content: `❌ Could not safely redact the config for **${botName}**, so it was not sent.`,
      })
      return
    }

    // Return specific property or full config
    if (property) {
      const value = safeConfig[property]
      if (isRedacted(value)) {
        await interaction.editReply({
          content: `🔒 **${botName}**.${property} is set, but withheld — it looks like a credential.`,
        })
      } else if (value === undefined) {
        await interaction.editReply({
          content: `**${botName}**.${property} is not set.`,
        })
      } else {
        const formatted = typeof value === 'object'
          ? '```yaml\n' + yamlStringify(value, { lineWidth: 0 }) + '```'
          : `\`${String(value)}\``
        await interaction.editReply({
          content: `**${botName}**.${property} = ${formatted}`,
        })
      }
    } else {
      // Return full config as YAML file
      const yamlOutput = yamlStringify(safeConfig, { lineWidth: 0 })
      const filename = `${botName}-config.yaml`
      const attachment = new AttachmentBuilder(
        Buffer.from(yamlOutput, 'utf-8'),
        { name: filename },
      )

      await interaction.editReply({
        content: `Config for **${botName}** in <#${channel.id}>:`,
        files: [attachment],
      })
    }

    logger.info({
      userId: interaction.user.id,
      botName,
      channelId: channel.id,
      property,
    }, 'Config retrieved via /get_config')
  } catch (error) {
    logger.error({ error, userId: interaction.user.id }, 'Error in /get_config command')
    const detail = error instanceof Error ? redactString(error.message) : 'Unknown error'
    await interaction.editReply({
      content: `❌ Failed to get config: ${detail}`,
    })
  }
}

// ============================================================================
// Autocomplete handlers
// ============================================================================

/**
 * Provide autocomplete for bot names from EMS directory.
 */
export function autocompleteBotNames(query: string): Array<{ name: string; value: string }> {
  try {
    const emsPath = getEmsPath()
    if (!existsSync(emsPath)) return []

    const dirs = readdirSync(emsPath, { withFileTypes: true })
    return dirs
      .filter(d => d.isDirectory())
      .filter(d => existsSync(join(emsPath, d.name, 'config.yaml')))
      .filter(d => d.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 25) // Discord autocomplete limit
      .map(d => ({ name: d.name, value: d.name }))
  } catch {
    return []
  }
}

/**
 * Provide autocomplete for config property names.
 */
export function autocompleteConfigKeys(query: string): Array<{ name: string; value: string }> {
  return Object.entries(CONFIG_KEYS)
    .filter(([key]) => key.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 25)
    .map(([key, desc]) => ({ name: `${key} — ${desc}`, value: key }))
}
