# Discord Bot Capabilities for Soma

> Deep dive into Discord API capabilities for building a polished Soma bot
> 
> Research conducted: January 2026
> Discord.js version: 14.16.3

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Findings](#critical-findings)
3. [Message Types & Embeds](#1-message-types--embeds)
4. [Interactions](#2-interactions)
5. [Reactions & Events](#3-reactions--events)
6. [User Communication](#4-user-communication)
7. [Permissions & Intents](#5-permissions--intents)
8. [Advanced Patterns](#6-advanced-patterns)
9. [Soma Bot Design](#soma-bot-design)
10. [Implementation Recommendations](#implementation-recommendations)

---

## Executive Summary

After examining the Discord.js v14 source code directly (not just documentation), here are the key findings for building the Soma bot:

### What We Can Do ✅
- Rich embeds with colors, fields, thumbnails, footers for beautiful balance/transaction displays
- Slash commands (`/balance`, `/transfer`, `/history`, `/costs`)
- Buttons and select menus for interactive UX
- Modals (popup forms) for complex inputs like transfers
- Watch reactions on ANY message (including other bots) via `messageReactionAdd`
- Send DMs to users for notifications
- Ephemeral replies to OUR OWN slash commands/button interactions

### Critical Limitation ❌
**Ephemeral messages can ONLY be sent in response to an interaction the user initiated with YOUR bot.**

This means:
- ❌ CANNOT send ephemeral "Insufficient funds" when user triggers ChapterX bot
- ❌ CANNOT send ephemeral notification when user receives a tip
- ✅ CAN send ephemeral reply when user uses `/balance` (they interacted with us)
- ✅ CAN send DM as alternative to ephemeral for cross-bot notifications

---

## Critical Findings

### 1. Ephemeral Messages Are Interaction-Bound

From `InteractionResponses.js`:

```javascript
// Line 122-134: Ephemeral flag is set on the interaction response
const response = await this.client.rest.post(Routes.interactionCallback(this.id, this.token), {
  body: {
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: {
      flags: flags.bitfield,  // MessageFlags.Ephemeral = 64
    },
  },
  // Uses this.id and this.token - the INTERACTION's credentials
});
```

**Implication**: The `this.token` belongs to the interaction. Without an interaction token, you cannot send an ephemeral message. There is no API endpoint to send ephemeral messages to arbitrary users.

### 2. Reactions Work on Any Message

From `MessageReactionAdd.js`:

```javascript
// Line 36-37: Gets message from channel, doesn't check message author
const message = this.getMessage(data, channel);
if (!message) return false;
```

**Implication**: Soma bot can watch reactions on ChapterX bot messages. We just need:
- The message ID (from check-and-deduct response or tracking)
- `GuildMessageReactions` intent
- `Partials.Message` and `Partials.Reaction` for uncached messages

### 3. User.send() for DMs Works Directly

From `User.js` (via `TextBasedChannel` interface):

```javascript
// Users implement TextBasedChannel, so user.send() is available
if (this instanceof User || this instanceof GuildMember) {
  const dm = await this.createDM();
  return dm.send(options);
}
```

**Implication**: Can send rich embeds, buttons, etc. via DM. User must share a server with the bot AND have DMs enabled from server members.

---

## 1. Message Types & Embeds

### Rich Embeds

From `EmbedBuilder.js` (extends `@discordjs/builders`):

**Capabilities:**
| Element | Max Length | Notes |
|---------|------------|-------|
| Title | 256 chars | Optional |
| Description | 4096 chars | Main body text |
| Fields | 25 max | Each: name 256, value 1024 |
| Footer text | 2048 chars | |
| Author name | 256 chars | |
| **Total** | 6000 chars | Sum of all text content |

**Color Options:**
- Hex integer: `0xFF5733`
- RGB tuple: `[255, 87, 51]`
- Named colors via `resolveColor()`

**Soma Usage:**
```typescript
const balanceEmbed = new EmbedBuilder()
  .setColor(0x9B59B6)  // Purple for ichor theme
  .setTitle('💫 Ichor Balance')
  .setDescription(`You have **${balance.toFixed(1)} ichor**`)
  .addFields(
    { name: '⏳ Regeneration', value: `${regenRate}/hour`, inline: true },
    { name: '📊 Max Balance', value: `${maxBalance}`, inline: true },
    { name: '⏱️ Next Regen', value: `<t:${nextRegenTimestamp}:R>`, inline: true },
  )
  .setFooter({ text: 'Soma Credit System' })
  .setTimestamp();
```

### Components (Buttons, Selects, Modals)

From `ActionRowBuilder.js`, `ButtonBuilder.js`, `ModalBuilder.js`:

**Button Styles:**
| Style | Appearance | Use Case |
|-------|------------|----------|
| `ButtonStyle.Primary` | Blue | Main actions (Confirm) |
| `ButtonStyle.Secondary` | Grey | Cancel, dismiss |
| `ButtonStyle.Success` | Green | Positive actions |
| `ButtonStyle.Danger` | Red | Destructive actions |
| `ButtonStyle.Link` | Grey + icon | External links |

**Limits:**
- 5 buttons per ActionRow
- 5 ActionRows per message
- Select menus: 25 options max
- Modal: 5 text inputs max

**Soma Transfer Flow Example:**
```typescript
// Step 1: Slash command shows confirmation
const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('transfer_confirm')
      .setLabel('Confirm Transfer')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('transfer_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
```

### Ephemeral Messages

From `InteractionResponses.js` line 203:

```javascript
this.ephemeral = Boolean(data.flags & MessageFlags.Ephemeral);
```

**Key Properties:**
- Only visible to the user who triggered the interaction
- Disappear after Discord restart (not persisted)
- Cannot be reacted to by other users
- Can contain embeds, components, files

**Usage:**
```typescript
await interaction.reply({
  content: 'Your balance is 50.5 ichor',
  flags: MessageFlags.Ephemeral,
});
```

---

## 2. Interactions

### Slash Commands

**Registration:**
```typescript
const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your ichor balance'),
  
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer ichor to another user')
    .addUserOption(option =>
      option.setName('recipient')
        .setDescription('User to send ichor to')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('Amount of ichor to send')
        .setRequired(true)
        .setMinValue(1)),
  
  new SlashCommandBuilder()
    .setName('costs')
    .setDescription('View bot activation costs'),
  
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your transaction history')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of transactions to show')
        .setMinValue(1)
        .setMaxValue(50)),
];
```

### Context Menu Commands

Right-click actions on users/messages:

```typescript
new ContextMenuCommandBuilder()
  .setName('Check Balance')
  .setType(ApplicationCommandType.User);  // Right-click user

new ContextMenuCommandBuilder()
  .setName('Tip Author')
  .setType(ApplicationCommandType.Message);  // Right-click message
```

**Soma Usage:** "Tip Author" context menu on bot messages could trigger tip flow.

### Modal Dialogs

From `ModalBuilder.js`:

```typescript
const modal = new ModalBuilder()
  .setCustomId('transfer_modal')
  .setTitle('Transfer Ichor')
  .addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Note (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Thanks for the help!')
        .setRequired(false),
    ),
  );

await interaction.showModal(modal);
```

### Autocomplete

For dynamic suggestions as user types:

```typescript
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'bot') {
      const bots = await soma.getBots(interaction.guildId);
      const filtered = bots.filter(b => 
        b.name.toLowerCase().includes(focused.value.toLowerCase())
      );
      
      await interaction.respond(
        filtered.slice(0, 25).map(b => ({
          name: `${b.name} (${b.cost} ichor)`,
          value: b.id,
        }))
      );
    }
  }
});
```

---

## 3. Reactions & Events

### Reaction Events

From `Events.js`:
- `messageReactionAdd` - User adds reaction
- `messageReactionRemove` - User removes reaction
- `messageReactionRemoveAll` - All reactions cleared
- `messageReactionRemoveEmoji` - All reactions of one emoji cleared

From `MessageReactionAdd.js`:

```javascript
// Event payload structure
{
  user_id: 'id',
  message_id: 'id',
  emoji: { name: '⭐', id: null },  // Custom: { name: 'custom', id: '123' }
  channel_id: 'id',
  guild_id: 'id',
  member: { ..., user: { ... } },
  burst: boolean,  // Super reaction
  type: ReactionType,
}
```

### Partials for Uncached Messages

From `Partials.js`:

```javascript
const client = new Client({
  intents: [...],
  partials: [
    Partials.Message,   // Receive reactions on uncached messages
    Partials.Reaction,  // Receive partial reaction data
    Partials.Channel,   // Required for DMs
  ],
});
```

**Handling Partials:**
```typescript
client.on('messageReactionAdd', async (reaction, user) => {
  // Fetch full data if partial
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Failed to fetch reaction:', error);
      return;
    }
  }
  
  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      console.error('Failed to fetch message:', error);
      return;
    }
  }
  
  // Now we have full data
  const messageAuthorId = reaction.message.author.id;
  const emoji = reaction.emoji.name;
  // Process reward/tip...
});
```

### Reaction Collectors

From `ReactionCollector.js`:

```typescript
const filter = (reaction, user) => {
  return ['⭐', '🔥'].includes(reaction.emoji.name) && !user.bot;
};

const collector = message.createReactionCollector({ 
  filter, 
  time: 60000,  // 60 seconds
  max: 10,      // Max 10 reactions
});

collector.on('collect', (reaction, user) => {
  console.log(`${user.tag} reacted with ${reaction.emoji.name}`);
});

collector.on('end', collected => {
  console.log(`Collected ${collected.size} reactions`);
});
```

### Rate Limits

Discord rate limits for reactions:
- Add reaction: 1/0.25s per channel
- Remove reaction: 1/0.25s per channel
- Bulk: More complex, varies

**Best Practice:** Queue reaction operations, respect 429 responses.

---

## 4. User Communication

### Direct Messages (DMs)

```typescript
// Send DM to user
try {
  await user.send({
    embeds: [tipReceivedEmbed],
    components: [actionRow],
  });
} catch (error) {
  if (error.code === 50007) {
    // Cannot send messages to this user (DMs disabled)
    console.log(`Cannot DM ${user.tag} - DMs disabled`);
  }
}
```

**Limitations:**
- User must share a server with bot
- User can disable DMs from server members
- Error code `50007` = Cannot send to user

### Ephemeral vs DM Decision Matrix

| Scenario | Ephemeral Possible? | Recommendation |
|----------|---------------------|----------------|
| `/balance` command | ✅ Yes | Ephemeral reply |
| `/transfer` confirmation | ✅ Yes | Ephemeral with buttons |
| Tip received notification | ❌ No | DM with embed |
| Insufficient funds (own trigger) | ❌ No (triggered another bot) | DM or skip |
| Low balance warning | ❌ No | DM with buttons |
| Button click on Soma message | ✅ Yes | Ephemeral reply |

### Follow-up Messages

After initial reply, can send more:

```typescript
await interaction.reply({ content: 'Processing...', flags: MessageFlags.Ephemeral });

// Do async work...

await interaction.followUp({
  content: 'Transfer complete!',
  embeds: [receiptEmbed],
  flags: MessageFlags.Ephemeral,
});
```

### Deferred Responses

For slow operations (>3 seconds):

```typescript
await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// Do slow work (API calls, etc.)
const result = await processTransfer();

await interaction.editReply({
  content: 'Done!',
  embeds: [resultEmbed],
});
```

---

## 5. Permissions & Intents

### Required Intents for Soma

```typescript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,              // Basic guild info
    GatewayIntentBits.GuildMessages,        // Track bot messages
    GatewayIntentBits.MessageContent,       // Read message content (for .history?)
    GatewayIntentBits.GuildMessageReactions, // Watch reactions
    GatewayIntentBits.GuildMembers,         // Get member roles for multipliers
    GatewayIntentBits.DirectMessages,       // Send DM notifications
  ],
  partials: [
    Partials.Message,   // Reactions on uncached messages
    Partials.Reaction,  // Partial reaction data
    Partials.Channel,   // DM channels
  ],
});
```

### Privileged Intents

**GuildMembers** and **MessageContent** are privileged:
- Must be enabled in Discord Developer Portal
- Require verification for bots in 100+ servers

### Permission Checks

```typescript
// Check bot has permission in channel
const permissions = channel.permissionsFor(client.user);
if (!permissions.has(PermissionFlagsBits.SendMessages)) {
  // Cannot send in this channel
}

// Check user has role
const member = await guild.members.fetch(userId);
const hasPatronRole = member.roles.cache.some(r => r.name === 'Patron');
```

---

## 6. Advanced Patterns

### Midjourney-Style Button UI

Midjourney uses buttons for image operations. For Soma:

```typescript
// Balance display with action buttons
const embed = new EmbedBuilder()
  .setTitle('💫 Your Ichor Balance')
  .setDescription(`**${balance.toFixed(1)}** ichor`)
  .setColor(0x9B59B6);

const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('refresh_balance')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('view_history')
      .setLabel('📜 History')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('view_costs')
      .setLabel('💰 Costs')
      .setStyle(ButtonStyle.Primary),
  );

await interaction.reply({ embeds: [embed], components: [row] });
```

### Pagination

For transaction history:

```typescript
const ITEMS_PER_PAGE = 10;

function createHistoryEmbed(transactions: Transaction[], page: number, total: number) {
  const start = page * ITEMS_PER_PAGE;
  const pageItems = transactions.slice(start, start + ITEMS_PER_PAGE);
  
  const embed = new EmbedBuilder()
    .setTitle('📜 Transaction History')
    .setDescription(
      pageItems.map(t => 
        `${getEmoji(t.type)} **${t.amount > 0 ? '+' : ''}${t.amount}** - ${t.description} <t:${t.timestamp}:R>`
      ).join('\n')
    )
    .setFooter({ text: `Page ${page + 1}/${Math.ceil(total / ITEMS_PER_PAGE)}` });
  
  return embed;
}

const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setCustomId(`history_prev_${page}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`history_next_${page}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= Math.ceil(total / ITEMS_PER_PAGE) - 1),
  );
```

### Cooldowns

```typescript
const cooldowns = new Map<string, number>();

function checkCooldown(userId: string, command: string, seconds: number): boolean {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const expiry = cooldowns.get(key);
  
  if (expiry && now < expiry) {
    return false;  // Still on cooldown
  }
  
  cooldowns.set(key, now + seconds * 1000);
  return true;
}
```

### Tracking Bot Messages for Reactions

When ChapterX calls check-and-deduct, Soma needs to track which messages to watch:

```typescript
// In Soma service: store message IDs after bot sends response
interface TrackedMessage {
  messageId: string;
  channelId: string;
  triggerUserId: string;  // Who to reward
  botId: string;
  timestamp: Date;
  expiresAt: Date;  // Stop watching after X hours
}

// ChapterX reports message ID after sending
POST /api/v1/track-message
{
  messageId: "123456",
  channelId: "789",
  triggerUserId: "111",
  botId: "222"
}

// Soma bot watches reactions
client.on('messageReactionAdd', async (reaction, user) => {
  const tracked = await db.getTrackedMessage(reaction.message.id);
  if (!tracked) return;  // Not a tracked bot message
  
  if (isRewardEmoji(reaction.emoji.name) && user.id !== tracked.triggerUserId) {
    await processReward(tracked.triggerUserId, reaction.emoji.name);
  }
});
```

---

## Soma Bot Design

### Slash Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/balance` | Show your ichor balance | - |
| `/transfer` | Send ichor to another user | `recipient` (user), `amount` (number), `note` (string, optional) |
| `/costs` | View bot activation costs | `server` (optional, for admins) |
| `/history` | View transaction history | `limit` (number, 1-50) |
| `/leaderboard` | Top community contributors | `limit` (number, 5-25) |

### Admin Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/soma grant` | Grant ichor to user | Administrator |
| `/soma revoke` | Revoke ichor from user | Administrator |
| `/soma set-cost` | Set bot cost | Administrator |
| `/soma set-role` | Configure role multipliers | Administrator |
| `/soma stats` | Server statistics | Administrator |

### Embed Designs

#### Balance Display
```
┌─────────────────────────────────────┐
│ 💫 Your Ichor Balance               │
│                                     │
│ **55.5** ichor                      │
│                                     │
│ ⏳ Regen: 5/hour  📊 Max: 100       │
│ ⏱️ Next regen: in 12 minutes        │
│                                     │
│ [🔄 Refresh] [📜 History] [💰 Costs]│
└─────────────────────────────────────┘
```

#### Transaction History
```
┌─────────────────────────────────────┐
│ 📜 Transaction History              │
│                                     │
│ 🔴 -10 Claude Opus activation  2m   │
│ 🟢 +5  Regeneration            1h   │
│ ⭐ +1  Reaction reward          3h   │
│ 🔵 -5  Transfer to @alice       1d   │
│                                     │
│ [◀ Previous] Page 1/3 [Next ▶]      │
└─────────────────────────────────────┘
```

#### Tip Received (DM)
```
┌─────────────────────────────────────┐
│ 🫀 You Received a Tip!              │
│                                     │
│ **@bob** tipped you **5 ichor**     │
│ for your Claude Opus message in     │
│ #general                            │
│                                     │
│ New balance: **60.5 ichor**         │
│                                     │
│ [View in Channel]                   │
└─────────────────────────────────────┘
```

#### Insufficient Funds (DM)
```
┌─────────────────────────────────────┐
│ 💫 Insufficient Ichor               │
│                                     │
│ You tried to summon **Claude Opus** │
│ but you only have **5.5 ichor**     │
│ (costs 10)                          │
│                                     │
│ ⏳ Your balance will recover in     │
│ ~54 minutes                         │
│                                     │
│ 💡 Cheaper alternatives:            │
│ • Claude Sonnet (3 ichor) ✅        │
│ • Claude Haiku (1 ichor) ✅         │
│                                     │
│ [Check Balance] [View Costs]        │
└─────────────────────────────────────┘
```

### Notification Strategy

| Event | Notification Type | Content |
|-------|------------------|---------|
| Tip received | DM | Embed with tip details |
| Reward earned | None (silent) | Too noisy for every ⭐ |
| Low balance (<10) | DM (once/day) | Warning with suggestions |
| Transfer received | DM | Embed with transfer details |
| Insufficient funds | DM | Embed with alternatives |

---

## Implementation Recommendations

### 1. Client Setup

```typescript
// soma/src/bot/client.ts
import { Client, GatewayIntentBits, Partials } from 'discord.js';

export function createSomaClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Message,
      Partials.Reaction,
      Partials.Channel,
    ],
  });
}
```

### 2. Command Registration

```typescript
// soma/src/bot/commands/index.ts
import { REST, Routes } from 'discord.js';

const commands = [
  balanceCommand,
  transferCommand,
  costsCommand,
  historyCommand,
  leaderboardCommand,
  somaAdminCommand,
].map(cmd => cmd.data.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// Register globally (takes ~1 hour to propagate)
await rest.put(Routes.applicationCommands(clientId), { body: commands });

// Or per-guild (instant, good for testing)
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
```

### 3. Event Handling Architecture

```typescript
// soma/src/bot/events/interactionCreate.ts
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    // Reply with error if possible
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: 'An error occurred',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
```

### 4. Reaction Handler

```typescript
// soma/src/bot/events/messageReactionAdd.ts
client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;
  
  // Fetch partials
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  
  // Check if this is a tracked bot message
  const tracked = await somaApi.getTrackedMessage(reaction.message.id);
  if (!tracked) return;
  
  // Check if reaction is from trigger user (can't reward yourself)
  if (user.id === tracked.triggerUserId) return;
  
  const emojiName = reaction.emoji.name;
  
  // Check for tip emoji
  if (emojiName === '🫀') {
    await handleTip(user.id, tracked.triggerUserId, tracked.serverId);
    return;
  }
  
  // Check for reward emoji
  if (['⭐', '🔥', '💯', '👏'].includes(emojiName)) {
    await handleReward(tracked.triggerUserId, emojiName, tracked.serverId);
  }
});
```

### 5. DM with Error Handling

```typescript
// soma/src/bot/utils/notifications.ts
export async function sendDM(
  user: User,
  options: MessageCreateOptions
): Promise<boolean> {
  try {
    await user.send(options);
    return true;
  } catch (error: any) {
    if (error.code === 50007) {
      // User has DMs disabled - log but don't error
      console.log(`Cannot DM ${user.tag} - DMs disabled`);
      return false;
    }
    throw error;
  }
}
```

---

## Key Questions Answered

### 1. Can we send ephemeral messages to a user who triggered another bot?

**NO.** Ephemeral messages require an interaction token, which only exists when a user interacts directly with YOUR bot. When a user @mentions a ChapterX bot, Soma has no interaction to respond to.

**Alternatives:**
- Send a DM to the user
- Post a regular message that auto-deletes after a few seconds
- Have ChapterX send the message (current temporary solution)
- Skip notification entirely (silent failure)

### 2. How do we track which messages are from ChapterX bots?

Two approaches:

**A. Report from ChapterX (Recommended):**
- After ChapterX sends a response, it calls Soma API with the message ID
- Soma stores: `{ messageId, channelId, triggerUserId, botId, expiresAt }`
- Soma bot watches reactions on tracked messages

**B. Watch all bot messages:**
- Listen to `messageCreate` from known bot IDs
- Check if message.author.id is in known bot list
- More resource-intensive, less precise about who triggered it

### 3. Best UX for transfer flow?

**Recommended: Slash command → Modal**

```
User: /transfer @alice 10
Bot: [Opens modal with pre-filled amount]
     [User adds optional note]
     [User clicks Submit]
Bot: [Ephemeral confirmation with details]
     [Confirm/Cancel buttons]
User: [Clicks Confirm]
Bot: [Ephemeral success message]
Bot: [DM to recipient about transfer]
```

### 4. Can we show real-time balance updates?

**Partially.**

- Can update messages the bot owns (via `message.edit()`)
- Cannot update ephemeral messages after initial reply
- For "live" balances, use button-triggered refreshes

```typescript
// User clicks Refresh button on balance display
await interaction.update({
  embeds: [await createBalanceEmbed(userId)],
  components: [refreshButtonRow],
});
```

---

## File Structure for Implementation

```
soma/src/bot/
├── index.ts              # Bot entry point
├── client.ts             # Client configuration
├── commands/
│   ├── index.ts          # Command registration
│   ├── balance.ts        # /balance command
│   ├── transfer.ts       # /transfer command
│   ├── costs.ts          # /costs command
│   ├── history.ts        # /history command
│   ├── leaderboard.ts    # /leaderboard command
│   └── admin/
│       ├── grant.ts
│       ├── revoke.ts
│       ├── setCost.ts
│       └── setRole.ts
├── events/
│   ├── interactionCreate.ts
│   ├── messageReactionAdd.ts
│   └── ready.ts
├── handlers/
│   ├── buttons.ts        # Button interaction handlers
│   ├── modals.ts         # Modal submission handlers
│   └── autocomplete.ts   # Autocomplete handlers
├── embeds/
│   ├── balance.ts        # Balance embed builder
│   ├── history.ts        # Transaction history embed
│   ├── costs.ts          # Bot costs embed
│   └── notifications.ts  # DM notification embeds
└── utils/
    ├── notifications.ts  # DM sending utilities
    ├── pagination.ts     # Pagination helpers
    └── cooldowns.ts      # Cooldown management
```

---

## Summary

The Soma Discord bot is fully achievable with Discord.js v14. The main architectural decision is around notifications:

1. **Slash commands** → Use ephemeral replies (private, clean)
2. **Tips received** → Send DMs (only option for cross-bot notification)
3. **Insufficient funds** → Send DMs or let ChapterX handle it
4. **Reactions** → Watch via `messageReactionAdd` with partials enabled

The bot should feel as polished as Midjourney with:
- Beautiful purple-themed embeds
- Button-based navigation
- Modal forms for complex inputs
- Pagination for long lists
- Smooth interaction flows

