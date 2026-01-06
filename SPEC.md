# Soma Technical Specification

> Credit system for the Cyborgism Discord server

**Version**: 0.1.0 (Draft)
**Status**: In Development
**Last Updated**: January 2026

---

## Overview

Soma is a credit management service that controls access to AI bot interactions in Discord. Users spend **ichor** (credits) to trigger bot responses, earn ichor through regeneration and social rewards, and can trade ichor with each other.

### Goals

1. **Cost Control**: Reduce API costs by gating expensive bot interactions
2. **Fair Access**: Regeneration ensures everyone gets baseline access
3. **Social Economy**: Trading and tipping create community dynamics
4. **Transparency**: Users can inspect costs, balances, and transactions
5. **Simplicity**: Easy to understand and use

### Non-Goals (for v1)

- Token-based dynamic pricing
- Complex reputation systems
- Staking or yield mechanisms

### Key Design Decisions

- **Global Balances**: Users have ONE balance across all servers (not per-server)
- **No Cascade Handling**: ChapterX prevents bot-to-bot chains automatically
- **No Negative Balances**: Without cascades, costs are always predictable
- **Trigger Types That Cost**: Direct mentions, replies to bot, `m continue` command
- **Trigger Types That Don't Cost**: Random activations, bot-to-bot (blocked by ChapterX)
- **Role Configs Are Per-Server**: A user might be Patron in one server but not another

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Platform                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   User A    │  │   User B    │  │   User C    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │ @mentions       │ @mentions      │ reacts              │
│         ▼                 ▼                ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Discord Messages                          ││
│  └───────────────────────────┬─────────────────────────────────┘│
└──────────────────────────────┼──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Bot: Opus     │  │  Bot: Sonnet    │  │   Soma Bot      │
│   (ChapterX)    │  │   (ChapterX)    │  │   (Commands)    │
│                 │  │                 │  │                 │
│  Before LLM:    │  │  Before LLM:    │  │  /balance       │
│  Query Soma API │  │  Query Soma API │  │  /pay           │
└────────┬────────┘  └────────┬────────┘  │  /costs         │
         │                    │           │  /history       │
         │    REST API        │           └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SOMA SERVICE                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                        API Layer                          │   │
│  │  POST /api/v1/check-and-deduct                           │   │
│  │  GET  /api/v1/balance/:userId                             │   │
│  │  POST /api/v1/transfer                                   │   │
│  │  GET  /api/v1/costs/:serverId                            │   │
│  │  POST /api/v1/reward                                     │   │
│  │  ...                                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │  Balance  │  │   Cost    │  │   Regen   │  │  Ledger   │    │
│  │  Tracker  │  │  Config   │  │   Clock   │  │  (Audit)  │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       Database                            │   │
│  │  (SQLite or PostgreSQL)                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Components

1. **Soma Service**: Central REST API handling all credit operations
2. **Soma Bot**: Discord bot for user commands (`/balance`, `/pay`, etc.)
3. **ChapterX Integration**: Each bot queries Soma before running inference

---

## Data Model

### Entities

```typescript
// Core user record
interface User {
  id: string;              // Internal UUID
  discordId: string;       // Discord user ID
  createdAt: Date;
}

// Server (guild) configuration
interface Server {
  id: string;              // Internal UUID
  discordId: string;       // Discord guild ID
  config: ServerConfig;
  createdAt: Date;
}

interface ServerConfig {
  // Rewards (server-specific)
  rewardEmoji: string[];          // Emoji that trigger rewards
  rewardAmount: number;           // Ichor per reaction
  tipEmoji: string;               // Emoji for direct tips
  tipAmount: number;              // Ichor per tip
}

// Global configuration (applies to all servers)
interface GlobalConfig {
  baseRegenRate: number;      // Ichor per hour (default: 5)
  maxBalance: number;         // Cap on hoarding (default: 100)
  startingBalance: number;    // Initial ichor for new users (default: 50)
}

// Global user balance (shared across all servers)
interface Balance {
  userId: string;
  amount: number;             // Current stored ichor
  lastRegenAt: Date;          // Last time regen was calculated
}

// Bot cost configuration
interface BotCost {
  botDiscordId: string;
  serverId: string | null;    // null = global default
  baseCost: number;           // Ichor per activation
  description?: string;       // For display
}

// Role-based multipliers
interface RoleConfig {
  serverId: string;
  roleDiscordId: string;
  regenMultiplier: number;    // e.g., 2.0 for 2x regen
  maxBalance: number;         // Override server default
  costMultiplier: number;     // e.g., 0.5 for 50% off
}

// Transaction record (full audit trail)
interface Transaction {
  id: string;                 // UUID
  timestamp: Date;
  serverId: string;
  type: TransactionType;
  fromUserId: string | null;  // null for regen, grants
  toUserId: string | null;    // null for spends
  botDiscordId?: string;      // For spend transactions
  amount: number;
  balanceAfter: number;
  metadata: Record<string, any>;  // messageId, cascadeId, etc.
}

type TransactionType = 
  | 'spend'       // Bot activation (mention, reply, m-continue)
  | 'regen'       // Regeneration tick
  | 'transfer'    // User-to-user
  | 'reward'      // Reaction reward
  | 'tip'         // Direct tip
  | 'grant'       // Admin grant
  | 'revoke';     // Admin revoke
```

### Database Schema (SQL)

```sql
-- Users (Discord users we know about)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Global user balances (shared across all servers)
CREATE TABLE balances (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  amount DECIMAL(12, 2) NOT NULL DEFAULT 50,
  last_regen_at TIMESTAMP DEFAULT NOW()
);

-- Servers (Discord guilds) - for reward config and role multipliers
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id VARCHAR(20) UNIQUE NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bot costs
CREATE TABLE bot_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_discord_id VARCHAR(20) NOT NULL,
  server_id UUID REFERENCES servers(id),  -- NULL for global default
  base_cost DECIMAL(8, 2) NOT NULL,
  description VARCHAR(255),
  UNIQUE (bot_discord_id, server_id)
);

-- Role configurations (per-server, affects cost multipliers)
CREATE TABLE role_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) NOT NULL,
  role_discord_id VARCHAR(20) NOT NULL,
  regen_multiplier DECIMAL(4, 2) DEFAULT 1.0,
  max_balance_override DECIMAL(10, 2),  -- NULL = use global
  cost_multiplier DECIMAL(4, 2) DEFAULT 1.0,
  UNIQUE (server_id, role_discord_id)
);

-- Transactions (audit log)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW(),
  server_id UUID REFERENCES servers(id),  -- Where it happened (NULL for global ops)
  type VARCHAR(20) NOT NULL,
  from_user_id UUID REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  bot_discord_id VARCHAR(20),
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  metadata JSONB DEFAULT '{}'
);

-- Indexes for common queries
CREATE INDEX idx_transactions_user ON transactions(from_user_id, timestamp);
CREATE INDEX idx_transactions_server ON transactions(server_id, timestamp);
CREATE INDEX idx_transactions_type ON transactions(type, timestamp);
```

---

## API Specification

### Base URL

```
https://soma.example.com/api/v1
```

Or for local development:
```
http://localhost:3100/api/v1
```

### Authentication

All endpoints except health check require a bearer token:
```
Authorization: Bearer <service-token>
```

Different tokens for:
- Bot tokens (ChapterX instances)
- Admin tokens (Discord bot for admin commands)

---

### Endpoints

#### Health Check

```
GET /health
```

No auth required. Returns service status.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600
}
```

---

#### Check and Deduct Credits

The primary endpoint for ChapterX integration. Atomically checks if user has enough credits and deducts if so.

```
POST /check-and-deduct
```

**Request:**
```json
{
  "userId": "123456789",           // Discord user ID
  "serverId": "987654321",         // Discord guild ID (for role multipliers)
  "botId": "111222333",            // Bot's Discord ID
  "messageId": "444555666",        // Triggering message ID
  "triggerType": "mention",        // "mention" | "reply" | "m_continue"
  "userRoles": ["role1", "role2"]  // User's role IDs for cost multipliers
}
```

**Response (Success):**
```json
{
  "allowed": true,
  "cost": 10,
  "balanceAfter": 45.5,
  "transactionId": "uuid-here"
}
```

**Response (Insufficient Funds):**
```json
{
  "allowed": false,
  "cost": 10,
  "currentBalance": 5.5,
  "regenRate": 5.0,
  "timeToAfford": 54,  // minutes
  "cheaperAlternatives": [
    { "botId": "222333444", "name": "Haiku", "cost": 2 }
  ]
}
```

---

#### Get Balance

```
GET /balance/:userId
```

Global balance (same across all servers).

**Response:**
```json
{
  "balance": 55.5,
  "maxBalance": 100,
  "regenRate": 5.0,
  "nextRegenAt": "2026-01-05T15:00:00Z"
}
```

#### Get Balance with Server Context

```
GET /balance/:userId?serverId=987654321
```

Returns balance with server-specific role multipliers applied to display.

**Response:**
```json
{
  "balance": 55.5,
  "maxBalance": 100,
  "regenRate": 5.0,
  "effectiveRegenRate": 10.0,  // With role multiplier
  "effectiveCostMultiplier": 0.5,  // Role discount
  "nextRegenAt": "2026-01-05T15:00:00Z"
}
```

---

#### Transfer Credits

```
POST /transfer
```

**Request:**
```json
{
  "fromUserId": "123456789",
  "toUserId": "987654321",
  "serverId": "111222333",
  "amount": 10,
  "note": "Thanks for the help!"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "uuid-here",
  "fromBalanceAfter": 45.5,
  "toBalanceAfter": 60.0
}
```

---

#### Get Bot Costs

```
GET /costs/:serverId
```

**Response:**
```json
{
  "bots": [
    {
      "botId": "111222333",
      "name": "Claude Opus",
      "cost": 10,
      "description": "Most capable, highest cost"
    },
    {
      "botId": "222333444",
      "name": "Claude Sonnet",
      "cost": 3,
      "description": "Balanced capability and cost"
    },
    {
      "botId": "333444555",
      "name": "Claude Haiku",
      "cost": 1,
      "description": "Fast and economical"
    }
  ]
}
```

---

#### Record Reward

Called when a user reacts to a bot message.

```
POST /reward
```

**Request:**
```json
{
  "serverId": "987654321",
  "originUserId": "123456789",     // Who triggered the bot
  "reactorUserId": "111222333",    // Who reacted
  "messageId": "444555666",
  "emoji": "⭐",
  "isTip": false
}
```

**Response:**
```json
{
  "success": true,
  "amount": 1,
  "originBalanceAfter": 56.5
}
```

---

#### Get Transaction History

```
GET /history/:userId/:serverId?limit=20
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid-1",
      "timestamp": "2026-01-05T14:30:00Z",
      "type": "spend",
      "amount": -10,
      "balanceAfter": 45.5,
      "botName": "Claude Opus",
      "messageId": "444555666"
    },
    {
      "id": "uuid-2",
      "timestamp": "2026-01-05T14:00:00Z",
      "type": "regen",
      "amount": 5,
      "balanceAfter": 55.5
    }
  ]
}
```

---

#### Admin: Grant Credits

```
POST /admin/grant
```

**Request:**
```json
{
  "userId": "123456789",
  "serverId": "987654321",
  "amount": 50,
  "reason": "Event prize"
}
```

---

#### Admin: Set Bot Cost

```
POST /admin/set-cost
```

**Request:**
```json
{
  "botId": "111222333",
  "serverId": "987654321",  // null for global default
  "cost": 15,
  "description": "Premium model"
}
```

---

#### Admin: Configure Server

```
POST /admin/configure
```

**Request:**
```json
{
  "serverId": "987654321",
  "config": {
    "baseRegenRate": 5,
    "maxBalance": 100,
    "startingBalance": 50,
    "cascadeCostMultiplier": 0.25,
    "rewardEmoji": ["⭐", "🔥", "💯"],
    "rewardAmount": 1,
    "tipEmoji": "🫀",
    "tipAmount": 5
  }
}
```

---

## ChapterX Integration

### Integration Point

In `membrane-integ/chapterx/src/agent/loop.ts`, modify `processBatch()`:

```typescript
private async processBatch(events: Event[]): Promise<void> {
  // ... existing code ...

  // Check if activation is needed
  if (!await this.shouldActivate(events, firstEvent.channelId, firstEvent.guildId)) {
    logger.debug('No activation needed')
    return
  }

  // ===== SOMA CREDIT CHECK =====
  // Only charge for human-initiated triggers (not random)
  const activationReason = this.determineActivationReason(events)
  const shouldCharge = ['mention', 'reply', 'm_command'].includes(activationReason.reason)
  
  if (shouldCharge && this.somaClient) {
    const triggeringUser = this.getTriggeringUser(events)
    if (!triggeringUser) {
      logger.warn('Could not identify triggering user for Soma check')
      return
    }
    
    const somaResult = await this.somaClient.checkAndDeduct({
      userId: triggeringUser.id,
      serverId: firstEvent.guildId,
      botId: this.botUserId!,
      messageId: triggeringMessageId,
      triggerType: activationReason.reason,
      userRoles: Array.from(triggeringUser.roles?.keys() || []),
    })
    
    if (!somaResult.allowed) {
      // Send ephemeral-style message (or DM)
      await this.sendInsufficientFundsMessage(
        firstEvent.channelId,
        triggeringUser.id,
        somaResult
      )
      return  // Skip activation
    }
    
    logger.info({ 
      userId: triggeringUser.id, 
      cost: somaResult.cost, 
      balance: somaResult.balanceAfter,
      triggerType: activationReason.reason,
    }, 'Ichor deducted for activation')
  }
  // ===== END SOMA CHECK =====

  // ... rest of existing activation code ...
}
```

### Soma Client

A lightweight client library for ChapterX:

```typescript
// soma-client.ts
export class SomaClient {
  constructor(
    private baseUrl: string,
    private token: string
  ) {}

  async checkAndDeduct(params: CheckParams): Promise<CheckResult> {
    const response = await fetch(`${this.baseUrl}/check-and-deduct`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return response.json()
  }
}
```

### Configuration

Add to ChapterX bot config:

```yaml
# config/bots/claude.yaml
soma:
  enabled: true
  url: "http://localhost:3100/api/v1"
  # Token loaded from environment
```

Environment variable:
```bash
SOMA_TOKEN=your-service-token-here
```

---

## Discord Bot Commands

### User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/balance` | Show your current ichor and regen info | `/balance` |
| `/pay @user amount` | Transfer ichor to another user | `/pay @alice 10` |
| `/costs` | List all bots and their costs | `/costs` |
| `/history` | Show your recent transactions | `/history` |
| `/leaderboard` | Show top ichor holders | `/leaderboard` |

### Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/soma grant @user amount` | Give ichor to a user | `/soma grant @alice 50` |
| `/soma revoke @user amount` | Remove ichor from a user | `/soma revoke @alice 20` |
| `/soma set-cost @bot amount` | Set bot cost for this server | `/soma set-cost @Claude 15` |
| `/soma configure` | Open configuration panel | `/soma configure` |
| `/soma stats` | Show server-wide statistics | `/soma stats` |

### Ephemeral Messages

When a user lacks sufficient ichor:

```
💫 **Insufficient Ichor**

You need **10 ichor** to summon Claude Opus, but you only have **5.5 ichor**.

Your regeneration rate: **5 ichor/hour**
Time until you can afford this: **~54 minutes**

💡 **Alternatives:**
• Claude Sonnet (3 ichor) - You can afford this now!
• Claude Haiku (1 ichor) - You can afford this now!
```

---

## Trigger Types

### What Costs Ichor?

| Trigger | Costs? | Notes |
|---------|--------|-------|
| **Direct mention** | ✅ Yes | User @mentions a bot |
| **Reply to bot** | ✅ Yes | User replies to a bot's message |
| **`m continue`** | ✅ Yes | Special ChapterX command to continue |
| **Random activation** | ❌ No | Bot randomly decides to respond |
| **Bot-to-bot** | ❌ No | Blocked by ChapterX automatically |

### Why No Cascade Handling?

ChapterX automatically prevents bot-to-bot chain reactions. When a bot's message would trigger another bot, ChapterX blocks it. This means:

- No need to track cascade contexts
- No need for cascade cost multipliers
- No risk of unpredictable credit drain
- No negative balances possible

This is a significant simplification! The credit system only needs to handle direct human-initiated interactions.

---

## Reward System

### Reaction Rewards

When a user reacts to a bot message:
1. Soma Bot watches for reactions
2. Checks if emoji is in `rewardEmoji` list
3. Credits the original triggering user
4. Logs transaction

### Tip System

Special emoji (e.g., 🫀) for direct tips:
1. Reactor loses `tipAmount` ichor
2. Origin user gains `tipAmount` ichor
3. Zero-sum transfer

### Anti-Abuse

- Can't reward your own bot triggers
- Rate limit on reactions per user per hour
- Minimum time between rewards on same message

---

## Error Handling

### API Errors

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "User does not have enough ichor",
    "details": {
      "required": 10,
      "available": 5.5
    }
  }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INSUFFICIENT_BALANCE` | 402 | Not enough ichor |
| `USER_NOT_FOUND` | 404 | User not registered |
| `SERVER_NOT_FOUND` | 404 | Server not configured |
| `BOT_NOT_CONFIGURED` | 404 | Bot has no cost set |
| `INVALID_TRANSFER` | 400 | Invalid transfer (self, negative) |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Deployment

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/soma

# Server
PORT=3100
NODE_ENV=production

# Auth
SOMA_SERVICE_TOKENS=token1,token2,token3  # Comma-separated
DISCORD_TOKEN=your-discord-bot-token

# Optional
LOG_LEVEL=info
REGEN_INTERVAL=60000  # ms between regen ticks
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "dist/index.js"]
```

### docker-compose

```yaml
version: '3.8'
services:
  soma:
    build: .
    ports:
      - "3100:3100"
    environment:
      - DATABASE_URL=postgresql://soma:soma@db:5432/soma
      - DISCORD_TOKEN=${DISCORD_TOKEN}
    depends_on:
      - db
  
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=soma
      - POSTGRES_PASSWORD=soma
      - POSTGRES_DB=soma
    volumes:
      - soma_data:/var/lib/postgresql/data

volumes:
  soma_data:
```

---

## Future Enhancements

### v1.1
- Cross-server wallet unification (opt-in)
- Token-based dynamic pricing
- Webhook notifications

### v1.2
- Bounty system (post rewards for specific tasks)
- Scheduled grants (weekly allowances)
- Analytics dashboard

### v2.0
- Reputation system
- Governance (community decides costs)
- Integration with other platforms

---

## Appendix: Default Configuration

```yaml
# Global config (applies to all users across all servers)
global:
  baseRegenRate: 5         # ichor per hour
  maxBalance: 100          # max storable ichor
  startingBalance: 50      # new user balance

# Per-server config (reward settings)
server:
  rewardEmoji:
    - "⭐"
    - "🔥"
    - "💯"
    - "👏"
  rewardAmount: 1
  
  tipEmoji: "🫀"
  tipAmount: 5

# Default bot costs (global)
bots:
  # These are examples - actual bot IDs would be configured
  claude-opus:
    cost: 10
    description: "Most capable, highest cost"
  claude-sonnet:
    cost: 3
    description: "Balanced capability and cost"
  claude-haiku:
    cost: 1
    description: "Fast and economical"

# Role multipliers (configured per-server)
# Example for a server:
roles:
  patron:
    regenMultiplier: 2.0    # 2x regen rate
    costMultiplier: 0.5     # 50% off bot costs
  newcomer:
    regenMultiplier: 1.0
    costMultiplier: 1.0
  admin:
    costMultiplier: 0.0     # Free access
```

---

## Implementation Status

> Last Updated: January 2026

### Architecture Clarification

Soma consists of **two components**:

1. **Soma API** - REST backend for credit management (implemented ✅)
2. **Soma Discord Bot** - User-facing Discord bot (not yet implemented ❌)

**ChapterX bots** only interact with the Soma API for check-and-deduct operations. They do NOT handle reactions, user commands, or notifications.

**The Soma Discord Bot** handles all Discord-side interactions:
- Listening for reactions on bot messages (rewards/tips)
- Slash commands (`/balance`, `/transfer`, `/history`, etc.)
- User notifications (tips received, insufficient funds DMs, etc.)
- Admin commands (grant, set-cost, set-role)

```
┌─────────────────┐     ┌─────────────────┐
│  ChapterX Bots  │────▶│   Soma API      │◀────┐
│  (AI chat)      │     │   (credits)     │     │
└─────────────────┘     └─────────────────┘     │
                                                │
                        ┌─────────────────┐     │
                        │   Soma Bot      │─────┘
                        │  (Discord)      │
                        │  - reactions    │
                        │  - commands     │
                        │  - notifications│
                        └─────────────────┘
```

### Tested Features ✅

| Feature | Soma API | ChapterX Integration | Manual Test |
|---------|----------|---------------------|-------------|
| Check & Deduct | ✅ | ✅ | ✅ Verified |
| Refund on failure | ✅ | ✅ | ✅ Verified |
| Balance query | ✅ | N/A | ✅ curl |
| Transaction history | ✅ | N/A | ✅ curl |
| Admin grant | ✅ | N/A | ✅ curl |
| Admin set-cost | ✅ | N/A | ✅ curl |
| Regeneration | ✅ | N/A | ✅ Observed |

### Waiting for Soma Discord Bot ❌

These features have working API endpoints but need the Soma Discord bot to function:

| Feature | API Endpoint | Needs Bot For |
|---------|--------------|---------------|
| Reaction rewards | `POST /reward` | Listen for ⭐🔥💯👏 reactions |
| Tips | `POST /reward` (isTip=true) | Listen for 🫀 reactions |
| User transfers | `POST /transfer` | `/transfer` slash command |
| Balance checks | `GET /balance/:userId` | `/balance` slash command |
| History view | `GET /history/:userId/:serverId` | `/history` slash command |
| Role multipliers | `POST /admin/set-role` | Apply to users with roles |
| Insufficient funds message | N/A | Send pretty embed to user |

### Next Steps

1. **Build Soma Discord Bot** - Deep dive into Discord.js API
   - Reaction event handling (`messageReactionAdd`)
   - Slash command registration and handling
   - Embed builders for pretty messages
   - DM notifications
   
2. **Message ID Tracking** - When check-and-deduct is called, store the `messageId` so Soma bot knows which messages to watch for reactions

3. **Bot-to-API Communication** - Soma bot calls the same REST API (or could use internal DB access since it's the same process)

### ChapterX Cleanup Required

Currently, ChapterX sends the "Insufficient Ichor" message directly. This should be moved to the Soma Discord bot:

**Current (temporary):**
- ChapterX calls `/check-and-deduct` → gets `allowed: false`
- ChapterX sends "Insufficient Ichor" message to the channel
- Message is visible to everyone

**Target (after Soma bot is built):**
- ChapterX calls `/check-and-deduct` → gets `allowed: false`
- ChapterX does nothing (silently skips activation)
- Soma bot detects the failed check and sends an **ephemeral message** (only visible to the user)
- Or: Soma bot sends a DM to the user

**Changes needed in ChapterX:**
- Remove `formatInsufficientFundsMessage()` from SomaClient
- Remove the message sending logic in `checkSomaCredits()` when blocked
- Just return `blocked` and let ChapterX silently skip

**Soma bot will handle:**
- Subscribe to a webhook/event when check-and-deduct fails
- Or: Poll for recent failed checks
- Or: Soma API could push to a Redis queue that the bot consumes
- Send ephemeral reply or DM to the user with the pretty "Insufficient Ichor" embed

---

## Glossary

| Term | Definition |
|------|------------|
| **Soma** | The credit management service (named after the cell body) |
| **Ichor** | The credit currency (named after divine fluid) |
| **Regeneration** | Passive ichor gain over time |
| **Tip** | Direct user-to-user credit transfer via reaction |
| **Reward** | Credits earned when others react to your bot triggers |
| **m continue** | ChapterX command to continue a bot's response (costs ichor) |
| **Global Balance** | User's ichor is shared across all servers |

