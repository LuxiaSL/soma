# Soma

> Credit system for AI bot interactions in Discord

**Soma** is a service that manages **ichor** — credits that users spend to interact with AI bots. It enables cost control, fair access through regeneration, and a social economy through trading and rewards.

## Features

- 💫 **Credit System**: Users spend ichor to trigger AI bots
- ⏳ **Passive Regeneration**: Everyone gets baseline access through time-based regen
- 🎁 **Social Economy**: Trade ichor, tip others, earn rewards from reactions
- 🌐 **Global Balances**: One balance per user across all servers
- 🎭 **Role Multipliers**: Patrons can get faster regen and discounts
- 📊 **Full Transparency**: Users can inspect costs, balances, and transaction history

## Why Soma?

Running AI models like Claude Opus costs real money. Soma creates a fair, transparent system where:

- **Everyone gets access** through passive regeneration
- **Expensive models cost more** (Opus > Sonnet > Haiku)
- **Good interactions are rewarded** (reactions give credits)
- **Credits can be traded** (gift ichor to friends)

---

## Quick Start

### Prerequisites

- **Node.js** 20.0.0 or later
- **npm** or **pnpm**
- A Discord bot token ([setup guide](./DISCORD_BOT_SETUP.md))

### 1. Clone and Install

```bash
cd soma
npm install
```

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Required: API authentication tokens (comma-separated)
SOMA_SERVICE_TOKENS=your-secure-random-token-here

# Optional: Discord bot token for slash commands and reactions
SOMA_DISCORD_TOKEN=your-discord-bot-token

# Optional: Server port (default: 3100)
SOMA_PORT=3100
```

Generate a secure service token:
```bash
openssl rand -hex 32
```

### 3. Run in Development

```bash
npm run dev
```

This starts:
- **API Server** on `http://localhost:3100`
- **Discord Bot** (if `SOMA_DISCORD_TOKEN` is set)

### 4. Run in Production

```bash
npm run build
npm start
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOMA_SERVICE_TOKENS` | ✅ Yes | - | Comma-separated API auth tokens |
| `SOMA_DISCORD_TOKEN` | ❌ No | - | Discord bot token for commands/reactions |
| `SOMA_PORT` | ❌ No | `3100` | API server port |
| `SOMA_DATABASE_PATH` | ❌ No | `./data/soma.db` | SQLite database path |
| `SOMA_ADMIN_ROLES` | ❌ No | - | Comma-separated Discord role IDs for admin access |
| `SOMA_DEV_GUILD_ID` | ❌ No | - | Guild ID for instant command registration (dev only) |
| `SOMA_BASE_REGEN_RATE` | ❌ No | `5` | Ichor regenerated per hour (global) |
| `SOMA_MAX_BALANCE` | ❌ No | `100` | Maximum ichor balance cap (global) |
| `SOMA_STARTING_BALANCE` | ❌ No | `50` | Initial ichor for new users (global) |
| `LOG_LEVEL` | ❌ No | `info` | Log level: debug, info, warn, error |
| `NODE_ENV` | ❌ No | `development` | Environment mode |

### Discord Bot Setup

See **[DISCORD_BOT_SETUP.md](./DISCORD_BOT_SETUP.md)** for detailed instructions on:

1. Creating a Discord application
2. Enabling required intents (Server Members, Message Content)
3. Generating an invite link with permissions
4. Getting and securing your bot token

---

## Usage

### For Users

| Command | Description |
|---------|-------------|
| `/balance` | Check your ichor and regeneration info |
| `/transfer @user 10` | Send 10 ichor to a friend |
| `/costs` | See what each bot costs |
| `/history` | View your recent transactions |
| `/leaderboard` | View top community contributors (by tips/reactions received) |

When you ping a bot, ichor is automatically deducted. If you don't have enough, you'll receive a DM notification with details.

### For Admins

Requires **Administrator** permission or a role in `SOMA_ADMIN_ROLES`.

| Command | Description |
|---------|-------------|
| `/soma grant @user 50` | Give someone ichor |
| `/soma revoke @user 10` | Remove ichor from a user |
| `/soma set-cost @Bot 15` | Set a bot's activation cost |
| `/soma set-role @Patron` | Configure role multipliers |
| `/soma stats` | View server statistics |
| `/soma update-user @user` | Force refresh a user's role cache |
| `/soma config-view` | View current server configuration |
| `/soma config-rewards-emoji ⭐ 🔥` | Set reward emoji (one or more) |
| `/soma config-rewards-amount 2` | Set ichor per reward reaction |
| `/soma config-tip-emoji 🫀` | Set tip emoji (supports custom!) |
| `/soma config-tip-amount 10` | Set ichor per tip |
| `/soma config-reset` | Reset config to defaults |

---

## API Reference

Soma exposes a REST API for integration with other services (like ChapterX bots).

### Base URL

```
http://localhost:3100/api/v1
```

### Authentication

All endpoints (except `/health`) require a bearer token:

```
Authorization: Bearer <your-service-token>
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/check-and-deduct` | Check balance and deduct for bot activation |
| `GET` | `/balance/:userId` | Get user balance |
| `POST` | `/transfer` | Transfer ichor between users |
| `GET` | `/costs/:serverId` | Get bot costs for a server |
| `POST` | `/reward` | Record a reaction reward |
| `POST` | `/refund` | Refund a failed activation |
| `POST` | `/track-message` | Track a bot message for reactions |
| `GET` | `/history/:userId/:serverId` | Get transaction history |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/grant` | Grant ichor to a user |
| `POST` | `/admin/set-cost` | Configure bot cost |
| `POST` | `/admin/set-role` | Configure role multipliers |
| `POST` | `/admin/configure` | Server configuration |

See **[DOCUMENTATION.md](./DOCUMENTATION.md)** for complete API documentation.

---

## Architecture

Soma consists of two components:

```
┌─────────────────────┐     ┌─────────────────────┐
│  ChapterX Bots      │────▶│   Soma API          │◀────┐
│  (AI chat)          │     │   (credits)         │     │
└─────────────────────┘     └─────────────────────┘     │
                                                        │
                            ┌─────────────────────┐     │
                            │   Soma Bot          │─────┘
                            │   (Discord)         │
                            │   - commands        │
                            │   - reactions       │
                            │   - notifications   │
                            └─────────────────────┘
```

1. **Soma API** - REST backend for credit management
2. **Soma Discord Bot** - User-facing commands and reaction watching

---

## How Credits Work

### What Costs Ichor?

| Trigger | Costs? |
|---------|--------|
| **@mention a bot** | ✅ Yes |
| **Reply to a bot** | ✅ Yes |
| **`m continue`** | ✅ Yes |
| **Random bot responses** | ❌ Free |
| **Bot-to-bot chains** | ❌ Blocked |

### Earning Ichor

- **Regeneration**: Ichor slowly refills over time (configurable, default: 5/hour)
- **Rewards**: When others react to bot messages you triggered (emoji configurable per-server)
- **Tips**: Others can tip you ichor via reaction (emoji configurable per-server)
- **Transfers**: Others can send you ichor with `/transfer`
- **Admin Grants**: Server admins can grant ichor to users

### Server Configuration

Admins can customize reward/tip emoji and amounts per-server using `/soma config-*` commands. This allows using **custom server emoji** for rewards and tips! Configuration is tracked with who last modified it.

### Global Balance

Your ichor balance is **shared across all servers**. Role-based discounts still apply per-server.

---

## Development

### Project Structure

```
soma/
├── src/
│   ├── api/              # REST API routes and middleware
│   │   ├── routes/       # Endpoint handlers
│   │   └── middleware/   # Auth middleware
│   ├── bot/              # Discord bot
│   │   ├── commands/     # Slash commands
│   │   ├── handlers/     # Reactions, buttons, notifications
│   │   ├── notifications/# DM notification helpers
│   │   └── embeds/       # Rich embed builders
│   ├── db/               # Database connection and schema
│   ├── services/         # Business logic
│   ├── types/            # TypeScript types
│   └── utils/            # Logger, errors
├── data/                 # SQLite database (gitignored)
├── dist/                 # Compiled output (gitignored)
└── ...
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled output |
| `npm test` | Run tests (vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |

### Database

Soma uses SQLite by default for simplicity. The database is created automatically on first run.

Tables:
- `users` - Discord user records
- `balances` - Global user balances
- `servers` - Guild configurations
- `bot_costs` - Per-bot activation costs
- `role_configs` - Role multipliers
- `transactions` - Full audit log
- `tracked_messages` - Messages to watch for reactions
- `reward_claims` - Prevents duplicate reward claims
- `user_server_roles` - Cached user roles for global regen calculation

---

## Documentation

| Document | Description |
|----------|-------------|
| [DOCUMENTATION.md](./DOCUMENTATION.md) | **Complete reference documentation** |
| [SPEC.md](./SPEC.md) | Technical specification |
| [BOT_DESIGN.md](./BOT_DESIGN.md) | Discord bot UX design |
| [DISCORD_CAPABILITIES.md](./DISCORD_CAPABILITIES.md) | Discord API research |
| [DISCORD_BOT_SETUP.md](./DISCORD_BOT_SETUP.md) | Bot creation guide |
| [NOTES.md](./NOTES.md) | Design decisions and context |

---

## License

MIT
