# Soma Discord Bot - UX Design

> Detailed design document for the Soma Discord bot implementation
> 
> Version: 1.0
> Last Updated: January 2026

---

## Visual Identity

### Color Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Ichor Purple** | `#9B59B6` | `(155, 89, 182)` | Primary embed color |
| **Success Green** | `#2ECC71` | `(46, 204, 113)` | Positive transactions |
| **Warning Orange** | `#E67E22` | `(230, 126, 34)` | Low balance, warnings |
| **Danger Red** | `#E74C3C` | `(231, 76, 60)` | Insufficient funds, errors |
| **Neutral Grey** | `#95A5A6` | `(149, 165, 166)` | Secondary info |

### Emoji Vocabulary

| Emoji | Meaning |
|-------|---------|
| 💫 | Ichor/balance (main icon) |
| ⏳ | Regeneration |
| 📊 | Statistics |
| 📜 | History |
| 💰 | Costs |
| 🔴 | Spend/deduction |
| 🟢 | Credit/addition |
| ⭐🔥💯👏 | Reward reactions (configurable) |
| 🫀 | Tip reaction |
| 💸 | **Insufficient ichor** (on trigger message) |
| 📭 | **DM failed** (couldn't notify user) |
| ⚡ | Quick action |

> **Note:** See [Emoji Allocation](#emoji-allocation) for ChapterX reserved emojis to avoid conflicts.

---

## Slash Commands

### `/balance`

**Description:** Check your ichor balance and regeneration info

**Options:** None

**Response (Ephemeral):**

```
┌─────────────────────────────────────────────────────────┐
│ 💫 Your Ichor Balance                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ You have **55.5 ichor**                                 │
│                                                         │
│ ⏳ Regeneration    📊 Maximum    ⏱️ Next Regen          │
│ **5**/hour         **100**       <t:1704500000:R>       │
│                                                         │
│ 💡 As a **Patron**, you regenerate 2x faster!           │
│                                                         │
└─────────────────────────────────────────────────────────┘
                    Soma Credit System • Today at 3:45 PM

[🔄 Refresh] [📜 History] [💰 View Costs]
```

**Implementation:**

```typescript
// soma/src/bot/commands/balance.ts
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your ichor balance');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId;
  
  // Fetch balance from Soma API
  const balance = await somaApi.getBalance(userId, serverId);
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('💫 Your Ichor Balance')
    .setDescription(`You have **${balance.balance.toFixed(1)} ichor**`)
    .addFields(
      { 
        name: '⏳ Regeneration', 
        value: `**${balance.effectiveRegenRate}**/hour`, 
        inline: true 
      },
      { 
        name: '📊 Maximum', 
        value: `**${balance.maxBalance}**`, 
        inline: true 
      },
      { 
        name: '⏱️ Next Regen', 
        value: `<t:${Math.floor(new Date(balance.nextRegenAt).getTime() / 1000)}:R>`, 
        inline: true 
      },
    )
    .setFooter({ text: 'Soma Credit System' })
    .setTimestamp();
  
  // Add role bonus note if applicable
  if (balance.effectiveRegenRate > balance.regenRate) {
    const multiplier = balance.effectiveRegenRate / balance.regenRate;
    embed.addFields({
      name: '\u200B',
      value: `💡 As a **Patron**, you regenerate ${multiplier}x faster!`,
    });
  }
  
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('balance_refresh')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('history_view')
        .setLabel('📜 History')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('costs_view')
        .setLabel('💰 View Costs')
        .setStyle(ButtonStyle.Primary),
    );
  
  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
```

---

### `/transfer`

**Description:** Send ichor to another user

**Options:**
- `recipient` (User, required) - User to send ichor to
- `amount` (Number, required, min: 1) - Amount to send
- `note` (String, optional) - Optional note

**Flow:**

1. User enters `/transfer @alice 10 Thanks!`
2. Bot shows confirmation embed (ephemeral)
3. User clicks Confirm or Cancel
4. If confirmed: Transfer processed, both users notified

**Step 1 - Confirmation (Ephemeral):**

```
┌─────────────────────────────────────────────────────────┐
│ 💫 Confirm Transfer                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Send **10 ichor** to **@alice**?                        │
│                                                         │
│ Your balance: 55.5 → **45.5 ichor**                     │
│                                                         │
│ 📝 Note: "Thanks for the help!"                         │
│                                                         │
└─────────────────────────────────────────────────────────┘

[✅ Confirm] [❌ Cancel]
```

**Step 2 - Success (Ephemeral):**

```
┌─────────────────────────────────────────────────────────┐
│ ✅ Transfer Complete                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Sent **10 ichor** to **@alice**                         │
│                                                         │
│ Your new balance: **45.5 ichor**                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Recipient DM:**

```
┌─────────────────────────────────────────────────────────┐
│ 💫 You Received Ichor!                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ **@bob** sent you **10 ichor**                          │
│                                                         │
│ 📝 "Thanks for the help!"                               │
│                                                         │
│ Your new balance: **65.5 ichor**                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// soma/src/bot/commands/transfer.ts
export const data = new SlashCommandBuilder()
  .setName('transfer')
  .setDescription('Send ichor to another user')
  .addUserOption(option =>
    option
      .setName('recipient')
      .setDescription('User to send ichor to')
      .setRequired(true))
  .addNumberOption(option =>
    option
      .setName('amount')
      .setDescription('Amount of ichor to send')
      .setRequired(true)
      .setMinValue(1))
  .addStringOption(option =>
    option
      .setName('note')
      .setDescription('Optional note for the transfer')
      .setMaxLength(200));

export async function execute(interaction: ChatInputCommandInteraction) {
  const recipient = interaction.options.getUser('recipient', true);
  const amount = interaction.options.getNumber('amount', true);
  const note = interaction.options.getString('note');
  
  // Validation
  if (recipient.id === interaction.user.id) {
    await interaction.reply({
      content: '❌ You cannot transfer ichor to yourself.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  if (recipient.bot) {
    await interaction.reply({
      content: '❌ You cannot transfer ichor to a bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  // Check sender balance
  const balance = await somaApi.getBalance(interaction.user.id);
  if (balance.balance < amount) {
    await interaction.reply({
      content: `❌ Insufficient balance. You have **${balance.balance.toFixed(1)} ichor** but tried to send **${amount}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  // Show confirmation
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('💫 Confirm Transfer')
    .setDescription(`Send **${amount} ichor** to **${recipient}**?`)
    .addFields(
      { 
        name: 'Your balance', 
        value: `${balance.balance.toFixed(1)} → **${(balance.balance - amount).toFixed(1)} ichor**` 
      },
    );
  
  if (note) {
    embed.addFields({ name: '📝 Note', value: `"${note}"` });
  }
  
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`transfer_confirm_${recipient.id}_${amount}_${note || ''}`)
        .setLabel('✅ Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('transfer_cancel')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary),
    );
  
  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
```

---

### `/costs`

**Description:** View bot activation costs

**Options:**
- `bot` (String, optional) - Specific bot to show (with autocomplete)

**Response (Ephemeral):**

```
┌─────────────────────────────────────────────────────────┐
│ 💰 Bot Activation Costs                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ **Claude Opus** • 10 ichor                              │
│ Most capable, highest quality responses                 │
│                                                         │
│ **Claude Sonnet** • 3 ichor                             │
│ Balanced capability and speed                           │
│                                                         │
│ **Claude Haiku** • 1 ichor                              │
│ Fast and economical                                     │
│                                                         │
│ ─────────────────────────────────────────               │
│ 💡 Your balance: **55.5 ichor**                         │
│ 💎 Patron discount: **50% off all bots**                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// soma/src/bot/commands/costs.ts
export const data = new SlashCommandBuilder()
  .setName('costs')
  .setDescription('View bot activation costs')
  .addStringOption(option =>
    option
      .setName('bot')
      .setDescription('Specific bot to show')
      .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const serverId = interaction.guildId!;
  const userId = interaction.user.id;
  
  const [costs, balance] = await Promise.all([
    somaApi.getCosts(serverId),
    somaApi.getBalance(userId, serverId),
  ]);
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('💰 Bot Activation Costs');
  
  let description = '';
  for (const bot of costs.bots) {
    const effectiveCost = bot.cost * (balance.effectiveCostMultiplier || 1);
    const canAfford = balance.balance >= effectiveCost;
    const affordIcon = canAfford ? '✅' : '❌';
    
    description += `**${bot.name}** • ${effectiveCost.toFixed(1)} ichor ${affordIcon}\n`;
    if (bot.description) {
      description += `${bot.description}\n`;
    }
    description += '\n';
  }
  
  embed.setDescription(description);
  
  // Add footer with balance info
  let footerText = `💡 Your balance: ${balance.balance.toFixed(1)} ichor`;
  if (balance.effectiveCostMultiplier && balance.effectiveCostMultiplier < 1) {
    const discount = Math.round((1 - balance.effectiveCostMultiplier) * 100);
    footerText += `\n💎 Role discount: ${discount}% off all bots`;
  }
  embed.addFields({ name: '\u200B', value: footerText });
  
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
```

---

### `/history`

**Description:** View your transaction history

**Options:**
- `limit` (Integer, optional, 1-50, default: 10) - Number of transactions

**Response (Ephemeral with Pagination):**

```
┌─────────────────────────────────────────────────────────┐
│ 📜 Transaction History                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔴 **-10** Claude Opus activation         <t:...:R>     │
│ 🟢 **+5** Regeneration                    <t:...:R>     │
│ ⭐ **+1** Reaction reward from @charlie   <t:...:R>     │
│ 🔵 **-5** Transfer to @alice              <t:...:R>     │
│ 🟢 **+5** Regeneration                    <t:...:R>     │
│ 🫀 **+5** Tip from @dave                  <t:...:R>     │
│ 🔴 **-3** Claude Sonnet activation        <t:...:R>     │
│ 🟢 **+5** Regeneration                    <t:...:R>     │
│ 💜 **+10** Transfer from @eve             <t:...:R>     │
│ 🟢 **+5** Regeneration                    <t:...:R>     │
│                                                         │
└─────────────────────────────────────────────────────────┘
                                           Page 1 of 3

[◀ Previous] [1/3] [Next ▶]
```

**Transaction Type Formatting:**

| Type | Emoji | Description Format |
|------|-------|-------------------|
| spend | 🔴 | `{botName} activation` |
| regen | 🟢 | `Regeneration` |
| reward | ⭐ | `Reaction reward from @{user}` |
| tip | 🫀 | `Tip from @{user}` |
| transfer (out) | 🔵 | `Transfer to @{user}` |
| transfer (in) | 💜 | `Transfer from @{user}` |
| grant | 🎁 | `Admin grant` |
| revoke | ⚠️ | `Admin revoke` |

---

### `/leaderboard`

**Description:** View top ichor holders

**Options:**
- `limit` (Integer, optional, 5-25, default: 10) - Number of users to show

**Response (Public or Ephemeral based on server setting):**

```
┌─────────────────────────────────────────────────────────┐
│ 🏆 Ichor Leaderboard                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🥇 **@alice** — 98.5 ichor                              │
│ 🥈 **@bob** — 85.2 ichor                                │
│ 🥉 **@charlie** — 72.0 ichor                            │
│ 4. **@dave** — 65.5 ichor                               │
│ 5. **@eve** — 60.0 ichor                                │
│ 6. **@frank** — 55.5 ichor  ← You                       │
│ 7. **@grace** — 50.0 ichor                              │
│ 8. **@henry** — 45.5 ichor                              │
│ 9. **@ivy** — 40.0 ichor                                │
│ 10. **@jack** — 35.5 ichor                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Admin Commands

### `/soma grant`

**Description:** Grant ichor to a user (Admin only)

**Options:**
- `user` (User, required) - User to grant to
- `amount` (Number, required) - Amount to grant
- `reason` (String, optional) - Reason for grant

**Response:**

```
✅ Granted **50 ichor** to **@alice**
Reason: Event prize winner
New balance: **105.5 ichor**
```

---

### `/soma set-cost`

**Description:** Set bot activation cost for this server

**Options:**
- `bot` (String, required, autocomplete) - Bot to configure
- `cost` (Number, required) - New cost

**Response:**

```
✅ Set **Claude Opus** cost to **15 ichor** for this server
Previous: 10 ichor
```

---

### `/soma set-role`

**Description:** Configure role multipliers

**Options:**
- `role` (Role, required) - Role to configure
- `regen_multiplier` (Number, optional) - Regeneration multiplier (e.g., 2.0)
- `cost_multiplier` (Number, optional) - Cost multiplier (e.g., 0.5 for 50% off)

**Response:**

```
✅ Configured **Patron** role:
• Regeneration: **2x** faster
• Costs: **50%** off
```

---

### `/soma stats`

**Description:** View server-wide statistics

**Response:**

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Server Statistics                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ **Users**                                               │
│ Total: 1,234 | Active (24h): 89                         │
│                                                         │
│ **Ichor Economy**                                       │
│ Total in circulation: 45,678 ichor                      │
│ Average balance: 37.0 ichor                             │
│                                                         │
│ **Activity (24h)**                                      │
│ Bot activations: 234                                    │
│ Transfers: 45                                           │
│ Tips: 89                                                │
│ Rewards: 567                                            │
│                                                         │
│ **Most Active Bots (24h)**                              │
│ 1. Claude Opus — 145 activations                        │
│ 2. Claude Sonnet — 67 activations                       │
│ 3. Claude Haiku — 22 activations                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Notification Embeds

### Tip Received (DM)

```typescript
const tipEmbed = new EmbedBuilder()
  .setColor(0x9B59B6)
  .setTitle('🫀 You Received a Tip!')
  .setDescription(
    `**@${tipper.username}** tipped you **${amount} ichor**\n` +
    `for your message in **#${channel.name}**`
  )
  .addFields(
    { name: 'Your new balance', value: `**${newBalance.toFixed(1)} ichor**` }
  )
  .setTimestamp();

const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setLabel('View Message')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`),
  );
```

---

### Transfer Received (DM)

```typescript
const transferEmbed = new EmbedBuilder()
  .setColor(0x9B59B6)
  .setTitle('💫 You Received Ichor!')
  .setDescription(`**@${sender.username}** sent you **${amount} ichor**`);

if (note) {
  transferEmbed.addFields({ name: '📝 Note', value: `"${note}"` });
}

transferEmbed.addFields(
  { name: 'Your new balance', value: `**${newBalance.toFixed(1)} ichor**` }
);
```

---

### Insufficient Funds (DM)

Sent when user tries to trigger a ChapterX bot but lacks ichor.

```typescript
const insufficientEmbed = new EmbedBuilder()
  .setColor(0xE74C3C)  // Danger red
  .setTitle('💫 Insufficient Ichor')
  .setDescription(
    `You tried to summon **${botName}** but you only have ` +
    `**${balance.toFixed(1)} ichor** (costs **${cost}**)`
  )
  .addFields(
    { 
      name: '⏳ Time to afford', 
      value: `~${Math.ceil((cost - balance) / regenRate * 60)} minutes`,
      inline: true,
    },
    {
      name: '💡 Cheaper alternatives',
      value: alternatives.map(a => 
        `• **${a.name}** (${a.cost} ichor) ${balance >= a.cost ? '✅' : ''}`
      ).join('\n'),
    },
  );

const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('balance_view')
      .setLabel('Check Balance')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('costs_view')
      .setLabel('View All Costs')
      .setStyle(ButtonStyle.Secondary),
  );
```

---

### Low Balance Warning (DM)

Sent once per day when balance drops below threshold (e.g., 10 ichor).

```typescript
const lowBalanceEmbed = new EmbedBuilder()
  .setColor(0xE67E22)  // Warning orange
  .setTitle('⚠️ Low Ichor Balance')
  .setDescription(
    `Your ichor balance is running low!\n\n` +
    `Current balance: **${balance.toFixed(1)} ichor**`
  )
  .addFields(
    { 
      name: 'You can afford', 
      value: affordableBots.length > 0
        ? affordableBots.map(b => `• ${b.name} (${b.cost} ichor)`).join('\n')
        : 'No bots right now',
    },
    {
      name: '⏳ Regeneration',
      value: `${regenRate}/hour — full recovery in ~${Math.ceil((maxBalance - balance) / regenRate)} hours`,
    },
  );
```

---

## Button Handlers

### `balance_refresh`

Re-fetches and updates the balance embed.

```typescript
case 'balance_refresh': {
  const balance = await somaApi.getBalance(interaction.user.id, interaction.guildId);
  const embed = createBalanceEmbed(balance);
  
  await interaction.update({
    embeds: [embed],
    components: [balanceButtonRow],
  });
  break;
}
```

### `transfer_confirm_{recipientId}_{amount}_{note}`

Processes the transfer after confirmation.

```typescript
case pattern.startsWith('transfer_confirm_'): {
  const [, , recipientId, amount, note] = interaction.customId.split('_');
  
  const result = await somaApi.transfer({
    fromUserId: interaction.user.id,
    toUserId: recipientId,
    serverId: interaction.guildId,
    amount: parseFloat(amount),
    note: note || undefined,
  });
  
  if (result.success) {
    // Update sender's message
    await interaction.update({
      embeds: [createTransferSuccessEmbed(result)],
      components: [],
    });
    
    // DM recipient
    const recipient = await interaction.client.users.fetch(recipientId);
    await sendTransferNotification(recipient, interaction.user, parseFloat(amount), note);
  }
  break;
}
```

### `history_prev_{page}` / `history_next_{page}`

Navigates transaction history pages.

```typescript
case pattern.startsWith('history_'): {
  const direction = interaction.customId.includes('prev') ? -1 : 1;
  const currentPage = parseInt(interaction.customId.split('_')[2]);
  const newPage = currentPage + direction;
  
  const history = await somaApi.getHistory(interaction.user.id, interaction.guildId, {
    limit: 10,
    offset: newPage * 10,
  });
  
  await interaction.update({
    embeds: [createHistoryEmbed(history, newPage)],
    components: [createPaginationRow(newPage, history.totalPages)],
  });
  break;
}
```

---

## Reaction Handler

### Reward Processing

```typescript
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  
  // Fetch partials
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  
  // Check if tracked bot message
  const tracked = await somaApi.getTrackedMessage(reaction.message.id);
  if (!tracked) return;
  
  // Can't reward yourself
  if (user.id === tracked.triggerUserId) return;
  
  const emoji = reaction.emoji.name;
  const serverConfig = await somaApi.getServerConfig(tracked.serverId);
  
  // Check for tip
  if (emoji === serverConfig.tipEmoji) {
    await processTip(user.id, tracked.triggerUserId, tracked.serverId, reaction.message);
    return;
  }
  
  // Check for reward
  if (serverConfig.rewardEmoji.includes(emoji)) {
    await processReward(tracked.triggerUserId, tracked.serverId, emoji);
  }
});

async function processTip(
  tipperId: string, 
  recipientId: string, 
  serverId: string,
  message: Message
) {
  const result = await somaApi.recordReward({
    serverId,
    originUserId: recipientId,
    reactorUserId: tipperId,
    messageId: message.id,
    emoji: '🫀',
    isTip: true,
  });
  
  if (result.success) {
    // Notify recipient via DM
    const recipient = await client.users.fetch(recipientId);
    const tipper = await client.users.fetch(tipperId);
    
    await sendDM(recipient, {
      embeds: [createTipReceivedEmbed(tipper, result.amount, message)],
    });
  }
}

async function processReward(
  recipientId: string, 
  serverId: string, 
  emoji: string
) {
  // Rate limit: max 1 reward per user per message
  const rateLimitKey = `reward:${recipientId}:${emoji}`;
  if (await isRateLimited(rateLimitKey, 60)) return;
  
  await somaApi.recordReward({
    serverId,
    originUserId: recipientId,
    reactorUserId: 'system',  // Rewards are anonymous
    emoji,
    isTip: false,
  });
  
  // Rewards are silent - no DM notification (too noisy)
}
```

---

## Error Handling

### User-Facing Errors

Always ephemeral, friendly language:

```typescript
const errorMessages = {
  INSUFFICIENT_BALANCE: (needed: number, have: number) =>
    `❌ You need **${needed} ichor** but only have **${have.toFixed(1)}**.`,
  
  USER_NOT_FOUND: () =>
    `❌ User not found. They may need to use a Soma command first.`,
  
  INVALID_TRANSFER: (reason: string) =>
    `❌ Invalid transfer: ${reason}`,
  
  RATE_LIMITED: (seconds: number) =>
    `⏳ Please wait **${seconds} seconds** before trying again.`,
  
  BOT_NOT_CONFIGURED: () =>
    `❌ This bot hasn't been configured yet. Ask a server admin to run \`/soma set-cost\`.`,
  
  API_ERROR: () =>
    `⚠️ Something went wrong. Please try again in a moment.`,
};
```

### Logging Errors

```typescript
try {
  await processCommand(interaction);
} catch (error) {
  logger.error({
    error,
    command: interaction.commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  }, 'Command execution failed');
  
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: errorMessages.API_ERROR(),
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.followUp({
      content: errorMessages.API_ERROR(),
      flags: MessageFlags.Ephemeral,
    });
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Discord
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...

# Soma API
SOMA_API_URL=http://localhost:3100/api/v1
SOMA_API_TOKEN=...

# Optional
LOG_LEVEL=info
```

### Default Server Config

```yaml
rewardEmoji:
  - "⭐"
  - "🔥"
  - "💯"
  - "👏"
rewardAmount: 1
tipEmoji: "🫀"
tipAmount: 5
lowBalanceThreshold: 10
lowBalanceNotificationCooldown: 86400  # 24 hours
```

---

## Testing Checklist

### Commands
- [ ] `/balance` shows correct info
- [ ] `/balance` buttons work (Refresh, History, Costs)
- [ ] `/transfer` validation (self, bot, amount)
- [ ] `/transfer` confirmation flow
- [ ] `/transfer` success + recipient DM
- [ ] `/costs` shows all bots with affordability
- [ ] `/costs` shows role discounts
- [ ] `/history` pagination works
- [ ] `/leaderboard` displays correctly
- [ ] Admin commands require permissions

### Reactions
- [ ] Reward reactions credit trigger user
- [ ] Tip reactions transfer ichor
- [ ] Can't reward/tip yourself
- [ ] Works on uncached messages (partials)
- [ ] Rate limiting prevents spam

### Notifications
- [ ] Transfer received DM works
- [ ] Tip received DM works (tipper NOT notified)
- [ ] Low balance warning (once/day)
- [ ] Insufficient funds: 💸 reaction + DM
- [ ] DM failure: 📭 reaction instead of 💸
- [ ] Handles DMs disabled gracefully

### Message Tracking
- [ ] ChapterX reports message IDs via `/track-message`
- [ ] Reactions on tracked messages credit correct user
- [ ] Messages expire after 7 days
- [ ] Cleanup job removes expired entries

### Edge Cases
- [ ] User not in database (auto-create)
- [ ] Server not configured (sensible defaults)
- [ ] API unavailable (graceful error)
- [ ] Interaction timeout (15 minute limit)

---

## Architectural Decisions (January 2026)

> These decisions were made after deep-diving into Discord.js source code and discussing with project leads.

### Emoji Allocation

**ChapterX Reserved Emojis (do not use):**
| Emoji | ChapterX Usage |
|-------|---------------|
| 🛑 | Refusal reaction (bot refused to respond) |
| 🫥 | Hide message from context (user-applied) |
| 🔁 | Bot reply chain depth limit reached |

**Soma Emojis:**
| Emoji | Soma Usage |
|-------|-----------|
| ⭐🔥💯👏 | Reward reactions (configurable per server) |
| 🫀 | Tip reaction (default, configurable) |
| 💸 | **Insufficient ichor** - added to triggering message |
| 📭 | **DM failed** - couldn't deliver notification to user |

### Insufficient Funds Notification

**Decision:** DM + Reaction

When a user triggers a ChapterX bot but lacks ichor:
1. Soma adds **💸** reaction to the triggering message (visible to everyone, signals "out of funds")
2. Soma sends a DM to the user with details:
   - Current balance vs required amount
   - Time to afford (based on regen rate)
   - Cheaper alternatives they can afford now
   - Buttons: [Check Balance] [View Costs]

**Rationale:**
- DM provides detailed info privately
- Reaction provides immediate visual feedback in channel
- Prevents user confusion about why bot didn't respond
- Helps prevent DM muting (notification + visible indicator)

**If DM fails (user has DMs disabled):**
- Add **📭** reaction to the message instead of 💸
- Log the failure with tracing
- User only sees the mailbox reaction (can infer DMs are off)

### Message Tracking for Reactions

**Decision:** ChapterX reports message IDs to Soma

**Flow:**
```
1. User @mentions ChapterX bot
2. ChapterX → Soma: POST /check-and-deduct
3. Soma → ChapterX: { allowed: true }
4. ChapterX sends response message
5. ChapterX → Soma: POST /track-message
   {
     messageId: "123456",
     channelId: "789",
     triggerUserId: "111",  // Who to reward
     botId: "222"
   }
6. Soma stores in tracked_messages table
7. Later: User reacts with ⭐ on message 123456
8. Soma receives messageReactionAdd event
9. Soma looks up tracked message → finds triggerUserId
10. Soma credits triggerUserId with reward
```

**Storage Duration:** 7 days

**Rationale:**
- Reactions after a week are rare and likely not meaningful
- Keeps storage bounded
- Simple TTL-based cleanup

**Implementation:**
```sql
CREATE TABLE tracked_messages (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  trigger_user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL  -- created_at + 7 days
);

CREATE INDEX idx_tracked_expires ON tracked_messages(expires_at);
```

Cleanup job runs periodically: `DELETE FROM tracked_messages WHERE expires_at < NOW()`

### Tip Notifications

**Decision:** Recipient gets DM, tipper does NOT

| Actor | Notification |
|-------|-------------|
| Tipper (reactor) | ❌ None |
| Recipient (trigger user) | ✅ DM with tip details |

**Rationale:**
- Servers with 50+ users can have rapid reaction piles
- Tipper already knows they tipped (they clicked the reaction)
- Reduces DM spam significantly

**Future:** Add `/tips` command to see recent tips given/received

### Notification Preferences (Configurable)

**Decision:** Make notifications configurable per-user in Soma

```typescript
interface NotificationPreferences {
  tipReceived: boolean       // Default: true
  transferReceived: boolean  // Default: true
  lowBalanceWarning: boolean // Default: true
  insufficientFunds: boolean // Default: true
}
```

**Implementation:** Add to user table or separate preferences table

**API Endpoint:**
```
PATCH /api/v1/user/:userId/preferences
{
  notifications: {
    tipReceived: false
  }
}
```

**Bot Command:**
```
/notifications
  - tipReceived: ✅ On / ❌ Off
  - transferReceived: ✅ On / ❌ Off
  - lowBalanceWarning: ✅ On / ❌ Off
  - insufficientFunds: ✅ On / ❌ Off
```

### Rate Limiting & Error Handling

**Decision:** Permissive with strong tracing

**Principles:**
1. Request queueing under load (don't drop requests)
2. Never swallow errors silently
3. Match ChapterX's tracing standards
4. Graceful degradation (bot stays responsive even if API is slow)

**Implementation:**
```typescript
// Request queue for Soma API calls
const apiQueue = new PQueue({
  concurrency: 10,
  interval: 1000,
  intervalCap: 20,  // 20 requests per second max
});

// Traced API call
async function somaApiCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const traceId = generateTraceId();
  logger.debug({ traceId, operation }, 'Soma API call started');
  
  try {
    const result = await apiQueue.add(fn);
    logger.debug({ traceId, operation }, 'Soma API call succeeded');
    return result;
  } catch (error) {
    logger.error({ traceId, operation, error }, 'Soma API call failed');
    throw error;  // Never swallow!
  }
}
```

**Discord Rate Limits:**
- Handle 429 responses with exponential backoff
- Queue reaction adds (1/0.25s per channel limit)
- Log all rate limit hits for visibility

### Cross-Bot Coordination

**Decision:** Keep separation of concerns

```
┌─────────────────────┐     ┌─────────────────────┐
│    ChapterX Bot     │     │     Soma Bot        │
│  (AI conversations) │     │  (Credit system UI) │
├─────────────────────┤     ├─────────────────────┤
│ • Message handling  │     │ • Slash commands    │
│ • LLM inference     │     │ • Reaction watching │
│ • Tool execution    │     │ • DM notifications  │
│ • Context building  │     │ • Embeds & buttons  │
└────────┬────────────┘     └────────┬────────────┘
         │                           │
         │    REST API calls         │
         └──────────┬────────────────┘
                    │
         ┌──────────▼──────────┐
         │     Soma Service    │
         │    (REST API)       │
         ├─────────────────────┤
         │ • Balance mgmt      │
         │ • Transactions      │
         │ • Config storage    │
         │ • Message tracking  │
         └─────────────────────┘
```

**ChapterX responsibilities:**
- Call `/check-and-deduct` before inference
- Call `/refund` if inference fails
- Call `/track-message` after sending response
- Handle `allowed: false` (add 💸 reaction, skip inference)

**Soma Bot responsibilities:**
- All user-facing slash commands
- Watch reactions for rewards/tips
- Send DM notifications
- Admin commands

### API Additions for ChapterX Integration

**New endpoint needed:**

```
POST /api/v1/track-message
Authorization: Bearer <chapterx-token>

Request:
{
  messageId: string,      // Discord message ID
  channelId: string,      // Discord channel ID
  triggerUserId: string,  // Discord user ID who triggered the bot
  botId: string,          // Bot's Discord ID
  serverId: string        // Discord guild ID
}

Response:
{
  success: true,
  expiresAt: "2026-01-12T..."  // When tracking expires
}
```

**Modification to check-and-deduct response:**

When `allowed: false`, ChapterX should:
1. Add 💸 reaction to the triggering message
2. NOT send any message (Soma bot handles DM notification)

**OR:** Soma service returns `triggerMessageId` so Soma bot knows which message to react to.

---

## Next Steps

1. **Add `tracked_messages` table** to Soma database schema
2. **Add `POST /track-message` endpoint** to Soma API
3. **Update ChapterX** to call `/track-message` after sending responses
4. **Update ChapterX** to add 💸 reaction when `allowed: false`
5. **Implement Soma Bot** with the architecture above
6. **Add notification preferences** to user model

