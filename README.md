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
cp env.example .env
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
| `LOG_LEVEL` | ❌ No | `info` | Log level: debug, info, warn, error |
| `NODE_ENV` | ❌ No | `development` | Environment mode |

### Discord Bot Setup

See **[DISCORD_BOT_SETUP.md](./DISCORD_BOT_SETUP.md)** for detailed instructions on:

1. Creating a Discord application
2. Enabling required intents (Server Members)
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

When you ping a bot, ichor is automatically deducted. If you don't have enough, you'll receive a notification.

### For Admins

| Command | Description |
|---------|-------------|
| `/soma grant @user 50` | Give someone ichor |
| `/soma set-cost @Bot 15` | Set a bot's activation cost |
| `/soma set-role @Patron` | Configure role multipliers |
| `/soma stats` | View server statistics |

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

See **[SPEC.md](./SPEC.md)** for complete API documentation.

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

- **Regeneration**: Ichor slowly refills over time (default: 5/hour)
- **Rewards**: When others react (⭐🔥💯👏) to bot messages you triggered
- **Tips**: Others can react with 🫀 to tip you ichor
- **Transfers**: Others can send you ichor with `/transfer`

### Global Balance

Your ichor balance is **shared across all servers**. Role-based discounts still apply per-server.

---

## Development

### Project Structure

```
soma/
├── src/
│   ├── api/          # REST API routes and middleware
│   │   ├── routes/   # Endpoint handlers
│   │   └── middleware/
│   ├── bot/          # Discord bot
│   │   ├── commands/ # Slash commands
│   │   ├── handlers/ # Reactions, buttons
│   │   └── embeds/   # Rich embed builders
│   ├── db/           # Database connection and schema
│   ├── services/     # Business logic
│   ├── types/        # TypeScript types
│   └── utils/        # Logger, errors
├── data/             # SQLite database (gitignored)
├── dist/             # Compiled output (gitignored)
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

---

## Naming

The naming follows the Anima ecosystem conventions:

- **Soma**: The cell body — the core, where signals originate
- **Ichor**: In Greek mythology, the ethereal fluid flowing through the veins of immortal beings

---

## Documentation

| Document | Description |
|----------|-------------|
| [SPEC.md](./SPEC.md) | Full technical specification |
| [BOT_DESIGN.md](./BOT_DESIGN.md) | Discord bot UX design |
| [DISCORD_CAPABILITIES.md](./DISCORD_CAPABILITIES.md) | Discord API research |
| [DISCORD_BOT_SETUP.md](./DISCORD_BOT_SETUP.md) | Bot creation guide |
| [NOTES.md](./NOTES.md) | Design decisions and context |

---

## License

MIT
