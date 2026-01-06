# Discord Bot Setup Guide

> Step-by-step instructions to create and configure the Soma Discord bot

---

## Table of Contents

1. [Create a Discord Application](#1-create-a-discord-application)
2. [Configure the Bot](#2-configure-the-bot)
3. [Enable Privileged Intents](#3-enable-privileged-intents)
4. [Generate an Invite Link](#4-generate-an-invite-link)
5. [Get Your Bot Token](#5-get-your-bot-token)
6. [Configure Soma](#6-configure-soma)
7. [Verify Setup](#7-verify-setup)

---

## 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** in the top right
3. Enter a name for your bot (e.g., `Soma` or `Ichor Bot`)
4. Accept the Terms of Service and click **"Create"**

You'll be taken to your application's settings page.

---

## 2. Configure the Bot

1. In the left sidebar, click **"Bot"**
2. Click **"Add Bot"** (if not already created)
3. Customize your bot:
   - **Username**: Set a display name (e.g., `Soma`)
   - **Icon**: Upload a bot avatar (optional but recommended)

### Bot Settings

Configure these settings on the Bot page:

| Setting | Recommended Value | Why |
|---------|------------------|-----|
| **Public Bot** | ❌ OFF | Only you should be able to add this bot |
| **Requires OAuth2 Code Grant** | ❌ OFF | Not needed for standard bot functionality |

---

## 3. Enable Privileged Intents

Soma requires specific Discord Gateway Intents to function properly. On the Bot page, scroll down to **"Privileged Gateway Intents"** and enable:

| Intent | Required | Purpose |
|--------|----------|---------|
| **Presence Intent** | ❌ No | Not used |
| **Server Members Intent** | ✅ Yes | Read member roles for multipliers |
| **Message Content Intent** | ⚠️ Optional | Only if you need message content features |

### Enabling Intents

1. Toggle **"Server Members Intent"** to ON
2. If prompted, acknowledge the warning
3. Click **"Save Changes"**

> **Note**: For bots in 100+ servers, privileged intents require verification. Since Soma is typically private, this shouldn't apply.

---

## 4. Generate an Invite Link

1. In the left sidebar, click **"OAuth2"** → **"URL Generator"**
2. Under **"Scopes"**, select:
   - ✅ `bot`
   - ✅ `applications.commands`

3. Under **"Bot Permissions"**, select:

### Required Permissions

| Permission | Code | Purpose |
|------------|------|---------|
| **Send Messages** | `2048` | Send DM notifications |
| **Embed Links** | `16384` | Rich embed displays |
| **Read Message History** | `65536` | Read messages for reaction context |
| **Add Reactions** | `64` | Add 💸/📭 reactions for insufficient funds |
| **Use External Emojis** | `262144` | Custom emoji support (if needed) |
| **View Channels** | `1024` | See channels the bot operates in |

### Permission Integer

For convenience, here's the combined permission integer:

```
346176
```

### Generated URL

Your URL should look like:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=346176&scope=bot%20applications.commands
```

4. Copy the generated URL at the bottom of the page
5. Open the URL in a browser to invite the bot to your server

---

## 5. Get Your Bot Token

The bot token is a secret key that authenticates your bot with Discord.

### Generate Token

1. Go back to **"Bot"** in the left sidebar
2. Under **"Token"**, click **"Reset Token"**
3. If you have 2FA enabled, enter your code
4. **Copy the token immediately** — you won't be able to see it again!

### Security Warning

⚠️ **NEVER share your bot token or commit it to git!**

If your token is ever exposed:
1. Return to the Bot page immediately
2. Click **"Reset Token"** to invalidate the old one
3. Update your configuration with the new token

---

## 6. Configure Soma

### Option A: Environment Variable (Recommended)

Add the token to your `.env` file:

```bash
SOMA_DISCORD_TOKEN=your-bot-token-here
```

### Option B: Direct Configuration

If running directly, export the variable:

```bash
export SOMA_DISCORD_TOKEN="your-bot-token-here"
npm run dev
```

---

## 7. Verify Setup

After starting Soma with the bot token configured:

### Check Bot Status

1. The bot should appear online in your Discord server
2. Check the console for: `Soma bot connected to Discord`

### Test Commands

Run these commands to verify functionality:

```
/balance    → Should show your ichor balance (creates user if new)
/costs      → Should list configured bot costs
/history    → Should show transaction history (may be empty)
```

### Verify Slash Commands Registered

If slash commands don't appear:

1. Commands may take up to 1 hour to propagate globally
2. Try kicking and re-inviting the bot
3. Check console logs for registration errors

---

## Permissions Summary

### Minimum Required Permissions

```
SEND_MESSAGES       - DM notifications
EMBED_LINKS         - Rich embeds
READ_MESSAGE_HISTORY - Reaction context
ADD_REACTIONS       - Insufficient funds reactions
VIEW_CHANNEL        - Channel access
```

### Required Intents

```
Guilds              - Basic guild info (automatic)
GuildMessages       - Track bot messages (automatic)
GuildMessageReactions - Watch reactions (automatic)
GuildMembers        - Role multipliers (PRIVILEGED - must enable)
DirectMessages      - DM notifications (automatic)
```

---

## Troubleshooting

### Bot Doesn't Come Online

1. Verify `SOMA_DISCORD_TOKEN` is set correctly
2. Check console for authentication errors
3. Ensure the token hasn't been reset

### Slash Commands Not Appearing

1. Wait up to 1 hour for global propagation
2. Verify `applications.commands` scope in invite URL
3. Check console for registration errors

### Reactions Not Being Tracked

1. Verify "Server Members Intent" is enabled
2. Ensure bot has `READ_MESSAGE_HISTORY` permission
3. Check that tracked messages aren't expired (7-day limit)

### DMs Not Sending

1. Users must share a server with the bot
2. User may have DMs disabled from server members
3. Bot will add 📭 reaction when DM fails

---

## Next Steps

1. Configure bot costs: `/soma set-cost @BotName 10`
2. Set up role multipliers: `/soma set-role @Patron regen_multiplier:2.0`
3. Review [SPEC.md](./SPEC.md) for full configuration options

---

## Quick Reference

| Portal Section | What to Configure |
|---------------|-------------------|
| General Information | App name, description |
| Bot | Username, icon, token, intents |
| OAuth2 → URL Generator | Invite link with permissions |
| OAuth2 → General | Client ID (for debugging) |

