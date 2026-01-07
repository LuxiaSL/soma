# Soma Documentation

> Comprehensive documentation for the Soma Credit Management System

**Version**: 0.1.0
**Last Updated**: January 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Discord Commands](#discord-commands)
   - [User Commands](#user-commands)
   - [Admin Commands](#admin-commands)
6. [Permissions](#permissions)
7. [API Reference](#api-reference)
8. [Credit System](#credit-system)
9. [Emoji Reference](#emoji-reference)
10. [Database Schema](#database-schema)
11. [Architecture](#architecture)
12. [Limitations & Known Issues](#limitations--known-issues)
13. [Troubleshooting](#troubleshooting)

---

## Overview

**Soma** is a credit management service for AI bot interactions in Discord. Users spend **ichor** (credits) to interact with AI bots, creating a fair and transparent resource-sharing system.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Ichor** | The virtual currency users spend to trigger AI bots |
| **Balance** | Global per-user balance shared across all Discord servers |
| **Regeneration** | Passive ichor recovery over time (default: 5/hour) |
| **Rewards** | Ichor earned when others react positively to your AI interactions |
| **Tips** | Direct ichor transfers from one user to another via reactions |

### Key Features

- **Global Balances**: One balance per user across all servers
- **Passive Regeneration**: Everyone gets baseline access through time-based recovery
- **Role Multipliers**: Configurable per-server bonuses for special roles (e.g., Patrons)
- **Social Economy**: Transfer ichor, tip others, earn rewards from reactions
- **Full Transparency**: Users can inspect costs, balances, and transaction history
- **Insufficient Funds Notifications**: DM alerts when users can't afford a bot

---

## Quick Start

### Prerequisites

- **Node.js** 20.0.0 or later
- **npm** or **pnpm**
- A Discord bot application with Server Members Intent enabled

### Minimal Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env

# 3. Configure minimum required variables
#    Edit .env and set:
#    - SOMA_SERVICE_TOKENS (required for API auth)
#    - SOMA_DISCORD_TOKEN (required for bot functionality)

# 4. Start the server
npm run dev
```

---

## Installation

### 1. Clone and Install Dependencies

```bash
cd soma
npm install
```

### 2. Create Environment Configuration

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` with your settings (see [Configuration](#configuration) for details).

### 4. Development Mode

```bash
npm run dev
```

Starts with hot-reload using `tsx watch`.

### 5. Production Mode

```bash
npm run build
npm start
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (development) |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled output (production) |
| `npm test` | Run test suite (Vitest) |
| `npm run lint` | Lint source code (ESLint) |
| `npm run format` | Format code (Prettier) |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOMA_SERVICE_TOKENS` | **Yes** | - | Comma-separated API authentication tokens |
| `SOMA_DISCORD_TOKEN` | No | - | Discord bot token (bot won't start without this) |
| `SOMA_PORT` | No | `3100` | API server port |
| `SOMA_DATABASE_PATH` | No | `./data/soma.db` | Path to SQLite database file |
| `SOMA_ADMIN_ROLES` | No | - | Comma-separated Discord role IDs for admin access |
| `SOMA_DEV_GUILD_ID` | No | - | Guild ID for instant command registration (dev only) |
| `SOMA_BASE_REGEN_RATE` | No | `5` | Ichor regenerated per hour (global setting) |
| `SOMA_MAX_BALANCE` | No | `100` | Maximum ichor balance cap (global setting) |
| `SOMA_STARTING_BALANCE` | No | `50` | Initial ichor for new users (global setting) |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | No | `development` | Environment: `development`, `production` |

### Generating Secure Tokens

```bash
# Generate a secure service token
openssl rand -hex 32
```

### Example Configuration

```bash
# API Server
SOMA_PORT=3100
SOMA_DATABASE_PATH=./data/soma.db
SOMA_SERVICE_TOKENS=abc123secure,def456token

# Discord Bot
SOMA_DISCORD_TOKEN=MTIzNDU2Nzg5...

# Admin Roles (optional)
SOMA_ADMIN_ROLES=123456789012345678,234567890123456789

# Global Economy Settings (optional - these are the defaults)
SOMA_BASE_REGEN_RATE=5
SOMA_MAX_BALANCE=100
SOMA_STARTING_BALANCE=50

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** section and create a bot
4. Enable **Server Members Intent** (required for role checking)
5. Enable **Message Content Intent** (required for reaction tracking)
6. Copy the bot token to `SOMA_DISCORD_TOKEN`
7. Generate an invite URL with these permissions:
   - Send Messages
   - Embed Links
   - Add Reactions
   - Read Message History
   - Use Slash Commands

### Default System Values

#### Global Settings (via Environment Variables)

| Setting | Default | Env Variable | Description |
|---------|---------|--------------|-------------|
| Base Regeneration Rate | 5/hour | `SOMA_BASE_REGEN_RATE` | Ichor gained per hour |
| Maximum Balance | 100 ichor | `SOMA_MAX_BALANCE` | Hard cap on stored ichor |
| Starting Balance | 50 ichor | `SOMA_STARTING_BALANCE` | New user initial balance |
| Message Tracking Duration | 7 days | - | How long messages are tracked for reactions |

#### Per-Server Settings (via Discord Commands)

| Setting | Default | Command | Description |
|---------|---------|---------|-------------|
| Reward Emoji | `⭐` `🔥` `💯` `👏` | `/soma config-rewards-emoji` | Reactions that give rewards (one or more) |
| Reward Amount | 1 ichor | `/soma config-rewards-amount` | Amount per reward reaction |
| Tip Emoji | `🫀` | `/soma config-tip-emoji` | Single reaction for tipping |
| Tip Amount | 5 ichor | `/soma config-tip-amount` | Amount transferred per tip |

**Note:** Per-server settings support custom Discord server emoji, allowing each server to use their own emoji for rewards and tips!

---

## Discord Commands

### User Commands

All user commands respond **ephemerally** (only visible to the command user).

#### `/balance`

Check your current ichor balance and regeneration info.

**Parameters**: None

**Response includes**:
- Current ichor balance
- Regeneration rate (with role bonuses noted)
- Maximum balance cap
- Time until next regeneration
- Interactive buttons: Refresh, History, View Costs

**Example Output**:
```
💫 Your Ichor Balance
You have 45.5 ichor

⏳ Regeneration    📊 Maximum    ⏱️ Next Regen
   10/hour            100          in 6 minutes

💡 As a Patron member, you regenerate 2x faster!
```

---

#### `/transfer <recipient> <amount> [note]`

Send ichor to another user.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `recipient` | Yes | User | User to send ichor to |
| `amount` | Yes | Number | Amount to transfer (minimum: 1) |
| `note` | No | String | Optional message (max 200 chars) |

**Validation**:
- Cannot transfer to yourself
- Cannot transfer to bots
- Must have sufficient balance

**Flow**:
1. Shows confirmation embed with details
2. User clicks Confirm or Cancel
3. On confirm: Transfer executes, recipient gets DM notification

---

#### `/costs [bot]`

View bot activation costs for the current server.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `bot` | No | String | Filter to specific bot (autocomplete) |

**Response includes**:
- List of all configured bots with costs
- Affordability indicator (✅/❌) per bot
- Your current balance
- Role discount percentage (if applicable)

**Note**: When used in DMs, shows costs from all servers you've been seen in.

---

#### `/history [limit]`

View your transaction history with pagination.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `limit` | No | Integer | Number of transactions (1-50, default: 10) |

**Transaction Types Shown**:
| Emoji | Type | Description |
|-------|------|-------------|
| 🔴 | Spend | Bot activation |
| 🟢 | Regen/Refund | Credit additions |
| ⭐ | Reward | Reaction reward received |
| 🫀 | Tip | Tip given/received |
| 🔵 | Transfer Out | Sent ichor to user |
| 💜 | Transfer In | Received ichor from user |
| 🎁 | Grant | Admin grant |
| ⚠️ | Revoke | Admin revoke |

---

#### `/leaderboard [limit]`

View top community contributors ranked by ichor earned from tips and reactions.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `limit` | No | Integer | Number of users to show (5-25, default: 10) |

**Features**:
- Medal emojis for top 3 (🥇🥈🥉)
- Your position highlighted with "← You"
- If you're not in the displayed list, your rank shows in footer

---

### Admin Commands

All admin commands are under the `/soma` command group and require **Administrator** permission by default.

If `SOMA_ADMIN_ROLES` is configured, users with those roles can also use admin commands.

#### `/soma grant <user> <amount> [reason]`

Grant ichor to a user.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `user` | Yes | User | User to grant ichor to |
| `amount` | Yes | Number | Amount to grant (minimum: 1) |
| `reason` | No | String | Reason for grant (max 200 chars) |

**Note**: Can exceed max balance cap (grants bypass the cap).

---

#### `/soma revoke <user> <amount> [reason]`

Remove ichor from a user.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `user` | Yes | User | User to revoke ichor from |
| `amount` | Yes | Number | Amount to revoke (minimum: 1) |
| `reason` | No | String | Reason for revocation (max 200 chars) |

**Note**: Balance cannot go below 0.

---

#### `/soma set-cost <bot> <cost> [description]`

Set activation cost for a bot in this server.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `bot` | Yes | User | The bot to configure (must be a bot account) |
| `cost` | Yes | Number | Cost in ichor (minimum: 0) |
| `description` | No | String | Display name/description for the bot |

**Example**:
```
/soma set-cost bot:@Claude cost:10 description:Claude Opus
```

---

#### `/soma set-role <role> [regen_multiplier] [cost_multiplier]`

Configure role-based bonuses.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `role` | Yes | Role | Discord role to configure |
| `regen_multiplier` | No | Number | Regeneration multiplier (0.1-10, e.g., 2.0 = 2x faster) |
| `cost_multiplier` | No | Number | Cost multiplier (0-2, e.g., 0.5 = 50% discount) |

**Note**: Must provide at least one multiplier.

**Example**:
```
/soma set-role role:@Patron regen_multiplier:2 cost_multiplier:0.5
```
This gives Patrons 2x regeneration and 50% off all bot costs.

---

#### `/soma stats`

View server-wide statistics.

**Displays**:
- Total users / Active users (24h)
- Total ichor in circulation
- Average balance
- 24-hour activity:
  - Bot activations
  - Transfers
  - Tips
  - Rewards

---

#### `/soma update-user <user>`

Force refresh a user's role cache.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `user` | Yes | User | User to refresh roles for |

**Use case**: When a user's roles change and their regeneration rate needs immediate updating.

---

### Server Configuration Commands

These commands allow admins to customize reward and tip settings per-server.

#### `/soma config-view`

View current server configuration.

**Displays**:
- Reward emoji and amount
- Tip emoji and amount
- Global settings (regen rate, max balance, starting balance)
- Last modification info (who changed it and when)

---

#### `/soma config-rewards-emoji <emoji>`

Set reward emoji (one or more). Users who react with these emoji to tracked bot messages will give rewards to the message author.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `emoji` | Yes | String | Space-separated emoji (e.g., `⭐ 🔥` or `:custom_emoji:`) |

**Notes**:
- Supports both standard Unicode emoji and custom server emoji
- Maximum 10 reward emoji
- Custom emoji format: `<:name:id>` (Discord handles this when you type `:emoji_name:`)

**Example**:
```
/soma config-rewards-emoji emoji:⭐ 🔥 :server_star:
```

---

#### `/soma config-rewards-amount <amount>`

Set ichor amount given per reward reaction.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `amount` | Yes | Number | Ichor per reward (0.1-100) |

---

#### `/soma config-tip-emoji <emoji>`

Set the tip emoji. When users react with this emoji, ichor is transferred from them to the message author.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `emoji` | Yes | String | Single emoji for tipping |

**Notes**:
- Only one tip emoji is allowed (unlike rewards which can be multiple)
- Supports custom server emoji

---

#### `/soma config-tip-amount <amount>`

Set ichor amount transferred per tip.

**Parameters**:
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `amount` | Yes | Number | Ichor per tip (1-100) |

---

#### `/soma config-reset`

Reset server configuration to defaults.

**Resets**:
- Reward emoji → `⭐ 🔥 💯 👏`
- Reward amount → 1 ichor
- Tip emoji → `🫀`
- Tip amount → 5 ichor

**Note**: Does not affect bot costs or role configurations

**Use case**: When a user's roles change and their regeneration rate needs immediate updating.

---

## Permissions

### User Command Permissions

All user commands are available to everyone by default:
- `/balance` - Anyone
- `/transfer` - Anyone
- `/costs` - Anyone
- `/history` - Anyone
- `/leaderboard` - Anyone

### Admin Command Permissions

Admin commands (`/soma`) require one of:

1. **Discord Administrator Permission** (default)
2. **Configured Admin Role** (if `SOMA_ADMIN_ROLES` is set)

**Admin role check behavior**:
- In server: Checks user's current server roles
- In DMs: Checks cached roles from all known servers

### API Authentication

All API endpoints (except `/health`) require Bearer token authentication:

```
Authorization: Bearer <your-service-token>
```

Tokens are configured via `SOMA_SERVICE_TOKENS` environment variable.

---

## API Reference

### Base URL

```
http://localhost:3100/api/v1
```

### Authentication

All endpoints except `/health` require:
```
Authorization: Bearer <service-token>
```

### Endpoints

#### Health Check
```
GET /health
```
No authentication required. Returns server status and uptime.

---

#### Check and Deduct
```
POST /api/v1/check-and-deduct
```

Primary endpoint for bot activation. Atomically checks balance and deducts if sufficient.

**Request Body**:
```json
{
  "userId": "123456789",
  "serverId": "987654321",
  "botId": "555555555",
  "triggerType": "mention",
  "userRoles": ["role1", "role2"],
  "channelId": "111111111",
  "messageId": "222222222"
}
```

**Response (Success)**:
```json
{
  "allowed": true,
  "cost": 10,
  "balanceAfter": 40.0,
  "transactionId": "tx_abc123"
}
```

**Response (Insufficient Funds)**:
```json
{
  "allowed": false,
  "cost": 10,
  "currentBalance": 5.0,
  "regenRate": 5,
  "timeToAfford": 60,
  "cheaperAlternatives": [
    { "name": "Claude Haiku", "cost": 1 }
  ]
}
```

---

#### Get Balance
```
GET /api/v1/balance/:userId?serverId=X
```

Returns user's current balance with regeneration info.

---

#### Transfer
```
POST /api/v1/transfer
```

Transfer ichor between users.

**Request Body**:
```json
{
  "fromUserId": "123456789",
  "toUserId": "987654321",
  "amount": 10,
  "serverId": "555555555",
  "note": "Thanks for the help!"
}
```

---

#### Get Costs
```
GET /api/v1/costs/:serverId
```

Returns all configured bot costs for a server.

---

#### Reward
```
POST /api/v1/reward
```

Record a reaction reward.

---

#### Refund
```
POST /api/v1/refund
```

Refund a failed bot activation.

**Request Body**:
```json
{
  "transactionId": "tx_abc123",
  "reason": "LLM generation failed"
}
```

---

#### Track Message
```
POST /api/v1/track-message
```

Track a bot message for reaction rewards/tips.

**Request Body**:
```json
{
  "messageId": "123456789",
  "channelId": "987654321",
  "serverId": "555555555",
  "botId": "111111111",
  "triggerUserId": "222222222"
}
```

---

#### Get History
```
GET /api/v1/history/:userId/:serverId
```

Returns transaction history for a user.

---

#### Admin: Grant
```
POST /api/v1/admin/grant
```

Grant ichor to a user (admin only).

---

#### Admin: Set Cost
```
POST /api/v1/admin/set-cost
```

Configure bot cost for a server.

---

#### Admin: Set Role
```
POST /api/v1/admin/set-role
```

Configure role multipliers.

---

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INSUFFICIENT_BALANCE` | 402 | User doesn't have enough ichor |
| `USER_NOT_FOUND` | 404 | User not in database |
| `SERVER_NOT_FOUND` | 404 | Server not configured |
| `BOT_NOT_CONFIGURED` | 404 | Bot has no cost set |
| `INVALID_TRANSFER` | 400 | Transfer validation failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid request data |

---

## Credit System

### How Costs Work

**What costs ichor**:
| Trigger | Costs? |
|---------|--------|
| @mention a bot | Yes |
| Reply to bot message | Yes |
| `m continue` command | Yes |
| Random bot activation | No |
| Bot-to-bot responses | Blocked |

### Earning Ichor

| Method | Amount | Description |
|--------|--------|-------------|
| **Regeneration** | Configurable (default: 5/hour) | Passive income over time |
| **Rewards** | Configurable per-server (default: 1) | Others react to your bot interactions |
| **Tips** | Configurable per-server (default: 5) | Others tip you via reaction |
| **Transfers** | Variable | Others send you ichor via `/transfer` |
| **Admin Grants** | Variable | Administrators grant ichor |

### Regeneration Formula

```
current_balance = min(max_balance, stored_balance + elapsed_hours * effective_regen_rate)
```

Regeneration is calculated lazily on each balance check.

### Role Multipliers

Role bonuses are per-server but the **best multiplier follows you globally** for regeneration:

- If Server A gives role "Patron" 2x regen
- And Server B gives role "VIP" 1.5x regen
- A user with both roles gets 2x regen everywhere

Cost multipliers only apply in the server where configured.

### Anti-Abuse Measures

- **No self-rewards**: Can't react to your own triggered messages
- **One reward per message**: Each user can only reward a message once
- **60-second cooldown**: Rate limiting on reaction rewards
- **Permanent claim tracking**: Database prevents duplicate rewards

---

## Emoji Reference

### System Emoji

| Emoji | Constant | Usage |
|-------|----------|-------|
| 💫 | `ICHOR` | Represents ichor/balance |
| ⏳ | `REGEN` | Regeneration rate |
| 📊 | `STATS` | Statistics |
| 📜 | `HISTORY` | Transaction history |
| 💰 | `COSTS` | Bot costs |
| 🔴 | `SPEND` | Deductions |
| 🟢 | `CREDIT` | Credits/additions |
| 🔵 | `TRANSFER_OUT` | Outgoing transfer |
| 💜 | `TRANSFER_IN` | Incoming transfer |
| ⭐ | `REWARD` | Reaction reward |
| 🫀 | `TIP` | Tips |
| 🎁 | `GRANT` | Admin grants |
| ⚠️ | `REVOKE` | Admin revokes |
| 💸 | `INSUFFICIENT` | Insufficient funds (reaction) |
| 📭 | `DM_FAILED` | DM delivery failed (reaction) |
| ⚡ | `QUICK` | Quick action |
| 🔄 | `REFRESH` | Refresh |
| ✅ | `CHECK` | Success/affordable |
| ❌ | `CROSS` | Error/unaffordable |

### Reaction Emoji (Configurable Per-Server)

Configure using `/soma config-rewards-emoji` and `/soma config-tip-emoji`.

**Reward Reactions** (default):
- ⭐ Star
- 🔥 Fire
- 💯 Hundred
- 👏 Clap

**Tip Reaction** (default):
- 🫀 Anatomical Heart

These can be configured per-server via the API.

### Reserved Emoji

The following emoji are reserved for ChapterX bot integration and should **not** be used for Soma features:
- 🛑 (Stop)
- 🫥 (Dotted face)
- 🔁 (Repeat)

### Leaderboard Emoji

| Position | Emoji |
|----------|-------|
| 1st | 🥇 |
| 2nd | 🥈 |
| 3rd | 🥉 |

---

## Database Schema

Soma uses SQLite for data persistence.

### Tables

#### `users`
Registered Discord users.
```sql
id TEXT PRIMARY KEY
discord_id TEXT UNIQUE NOT NULL
created_at TEXT DEFAULT (datetime('now'))
```

#### `balances`
Global user balances (shared across all servers).
```sql
user_id TEXT PRIMARY KEY REFERENCES users(id)
amount REAL NOT NULL DEFAULT 50
last_regen_at TEXT DEFAULT (datetime('now'))
```

#### `servers`
Discord server configurations.
```sql
id TEXT PRIMARY KEY
discord_id TEXT UNIQUE NOT NULL
config TEXT NOT NULL DEFAULT '{}'
created_at TEXT DEFAULT (datetime('now'))
```

#### `bot_costs`
Per-bot activation costs (can be global or server-specific).
```sql
id TEXT PRIMARY KEY
bot_discord_id TEXT NOT NULL
server_id TEXT REFERENCES servers(id)
base_cost REAL NOT NULL
description TEXT
UNIQUE (bot_discord_id, server_id)
```

#### `role_configs`
Role-based multipliers.
```sql
id TEXT PRIMARY KEY
server_id TEXT NOT NULL REFERENCES servers(id)
role_discord_id TEXT NOT NULL
regen_multiplier REAL DEFAULT 1.0
max_balance_override REAL
cost_multiplier REAL DEFAULT 1.0
UNIQUE (server_id, role_discord_id)
```

#### `transactions`
Full audit log of all transactions.
```sql
id TEXT PRIMARY KEY
timestamp TEXT DEFAULT (datetime('now'))
server_id TEXT REFERENCES servers(id)
type TEXT NOT NULL
from_user_id TEXT REFERENCES users(id)
to_user_id TEXT REFERENCES users(id)
bot_discord_id TEXT
amount REAL NOT NULL
balance_after REAL NOT NULL
metadata TEXT DEFAULT '{}'
```

#### `tracked_messages`
Bot messages tracked for reaction rewards/tips.
```sql
message_id TEXT PRIMARY KEY
channel_id TEXT NOT NULL
server_id TEXT REFERENCES servers(id)
bot_discord_id TEXT NOT NULL
trigger_user_id TEXT NOT NULL REFERENCES users(id)
created_at TEXT DEFAULT (datetime('now'))
expires_at TEXT NOT NULL
```

#### `reward_claims`
Prevents duplicate reward claims.
```sql
user_id TEXT NOT NULL REFERENCES users(id)
message_id TEXT NOT NULL
claimed_at TEXT DEFAULT (datetime('now'))
PRIMARY KEY (user_id, message_id)
```

#### `user_server_roles`
Cache of user roles across servers for global regen calculation.
```sql
user_id TEXT NOT NULL REFERENCES users(id)
server_id TEXT NOT NULL REFERENCES servers(id)
role_ids TEXT NOT NULL DEFAULT '[]'
last_seen TEXT DEFAULT (datetime('now'))
PRIMARY KEY (user_id, server_id)
```

### Database Location

Default: `./data/soma.db`

Configure via `SOMA_DATABASE_PATH` environment variable.

---

## Architecture

```
┌─────────────────────────┐
│   ChapterX Bots         │
│   (AI inference)        │
└───────────┬─────────────┘
            │ POST /check-and-deduct
            │ POST /track-message
            │ POST /refund
            ▼
┌─────────────────────────┐
│   Soma API Server       │
│   (Express + SQLite)    │
│   Port 3100             │
└───────────┬─────────────┘
            │ EventBus
            │ (insufficientFunds)
            ▼
┌─────────────────────────┐
│   Soma Discord Bot      │
│   - Slash commands      │
│   - Reaction watching   │
│   - DM notifications    │
│   - Button handlers     │
└─────────────────────────┘
```

### Component Communication

1. **ChapterX → Soma API**: Bot activations, message tracking, refunds
2. **Soma API → Soma Bot**: Insufficient funds events via EventBus
3. **Soma Bot → Users**: Discord interactions, DM notifications
4. **Users → Soma Bot**: Commands, button clicks, reactions

### Request Flow (Bot Activation)

1. User mentions bot in Discord
2. ChapterX receives message
3. ChapterX calls `POST /check-and-deduct`
4. Soma checks balance and cost
5. If sufficient: Deduct and return `allowed: true`
6. If insufficient: Emit event, return `allowed: false`
7. ChapterX proceeds or skips based on response
8. If allowed, ChapterX calls `POST /track-message` after response

---

## Limitations & Known Issues

### Current Limitations

| Category | Limitation | Notes |
|----------|------------|-------|
| **Storage** | SQLite only | Suitable for moderate scale; no multi-instance support |
| **Rate Limiting** | Basic per-user cooldowns | No request queue, no Discord 429 backoff |
| **Notifications** | Low balance warnings not automated | Embed exists but no threshold trigger |
| **Commands** | No `/notifications` command | Users cannot configure notification preferences |
| **Deferred Responses** | Not implemented | Long operations may timeout |

### Not Implemented (Planned for Future)

- Token-based dynamic pricing
- Webhook notifications
- Bounty system
- Scheduled grants (weekly allowances)
- Analytics dashboard
- Context menu commands ("Check Balance", "Tip Author")
- Notification preferences (`tipReceived`, `lowBalanceWarning`, etc.)

### Known Considerations

1. **Global registration delay**: Slash commands take ~1 hour to propagate globally after registration
2. **Message tracking expiry**: Tracked messages expire after 7 days (reactions won't work after)
3. **Role cache staleness**: User roles are cached; use `/soma update-user` to force refresh
4. **DM restrictions**: Users with DMs disabled will see 📭 reaction instead of DM notification

---

## Troubleshooting

### Bot Not Responding to Commands

1. Verify `SOMA_DISCORD_TOKEN` is set correctly
2. Check bot has "Use Slash Commands" permission
3. Wait up to 1 hour for command registration to propagate
4. Check logs for errors: `LOG_LEVEL=debug npm run dev`

### Reactions Not Working

1. Verify bot has "Add Reactions" and "Read Message History" permissions
2. Ensure message was tracked via `POST /track-message`
3. Check if message is older than 7 days (tracking expires)
4. Verify "Server Members Intent" is enabled in Discord Developer Portal

### Insufficient Funds Notifications Not Sent

1. Verify EventBus is properly connected (check startup logs)
2. Ensure bot has permission to DM users
3. User may have DMs disabled (📭 reaction indicates this)

### API Returns 401 Unauthorized

1. Verify `SOMA_SERVICE_TOKENS` contains your token
2. Ensure Authorization header format: `Bearer <token>`
3. Check for extra whitespace in token configuration

### Database Issues

1. Verify write permissions for `SOMA_DATABASE_PATH` directory
2. Check disk space
3. Database is created automatically on first run

### Role Multipliers Not Applying

1. Use `/soma update-user` to refresh role cache
2. Verify role configuration with `/soma stats`
3. Check user has the configured role in the current server

---

## Support

For issues and feature requests:
- **GitHub**: https://github.com/anthropics/claude-code/issues

---

*This documentation was last updated January 2026.*
