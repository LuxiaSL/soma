# Soma Development Notes

> Raw thoughts and decisions from the initial brainstorming session with Luxia.

## Context

The Cyborgism Discord server has multiple AI bots (running on ChapterX) that users can interact with. Some bots (like Claude Opus) are expensive to run. We need a credit system to:
- Control costs
- Create a meaningful economy around bot interactions
- Allow users to trade/gift credits
- Be transparent and inspectable

## Naming

**Soma** - the service/system (cell body, the core, where signals originate)
**Ichor** - the currency (divine fluid that flows in the veins of gods)

"Your ichor regenerates from the Soma."

## Key Decisions Made

### Architecture
- Each bot queries Soma API before responding (not central interception)
- This fits ChapterX's distributed architecture (each bot is a separate process)
- More resilient, no single point of failure for message flow
- **Full ChapterX integration** - all bots will be on ChapterX

### Balances
- **GLOBAL per-user** (not per-server) - user has ONE balance across all servers
- No negative balance ever (cascades are prevented, so costs are predictable)
- Role multipliers are still per-server (Patron in one server, not in another)

### Costs
- Per-bot configuration (Opus costs more than Haiku)
- Start with **fixed costs** per message
- Token-based pricing is possible future enhancement
- Global defaults, per-server overrides possible

### What Costs Ichor?
| Trigger | Costs? |
|---------|--------|
| Direct @mention | ✅ Yes |
| Reply to bot | ✅ Yes |
| `m continue` command | ✅ Yes |
| Random activation | ❌ No |
| Bot-to-bot chains | ❌ No (blocked by ChapterX) |

### Insufficient Funds
- Bot doesn't respond
- Soma sends ephemeral message to user:
  - Current balance
  - Regen rate
  - ETA to afford this bot
  - Suggest cheaper alternatives

### Regeneration
- Global base rate (e.g., 5 ichor/hour)
- Role-based multipliers per-server (Patron gets 2x, etc.)
- Lazy calculation: `current = min(max, stored + elapsed * rate)`

### Rewards
- Reactions on bot messages reward the triggering user
- Configurable reward emoji (sane defaults, server-customizable)
- Special "tip" emoji to gift credits directly

### Commands (User-facing)
- `/balance` - your current ichor and regen rate
- `/pay @user <amount>` - transfer ichor
- `/costs` - list all bots and their costs
- `/history [limit]` - recent transactions
- `/leaderboard` - top ichor holders (fun, optional)

### Commands (Admin)
- `/soma grant @user <amount>` - give someone ichor
- `/soma set-cost @bot <amount>` - set bot cost for this server
- `/soma configure` - open config panel
- `/soma stats` - server-wide usage stats

## Resolved Questions

1. ~~**Cascade policy details**~~ → **Not needed!** ChapterX blocks bot-to-bot automatically
2. ~~**Cross-server wallets**~~ → **Global by default** - one balance per user across all servers
3. **Token-based pricing** → Start with fixed, maybe add later
4. **Specific reward emoji** → Sane defaults (⭐🔥💯👏), configurable per-server

## Remaining Open Questions

1. **Specific bot costs** - what should Opus/Sonnet/Haiku cost?
2. **Base regen rate** - 5/hour? More? Less?
3. **Starting balance** - 50? 100?

## Integration Notes

### ChapterX Integration Point
The integration happens in `membrane-integ/chapterx/src/agent/loop.ts`:
- `shouldActivate()` method determines if bot should respond
- AFTER `shouldActivate()` returns true, BEFORE `handleActivation()`:
  - Query Soma: "Can user X afford bot Y?"
  - If yes: proceed, Soma deducts credits
  - If no: send ephemeral, skip activation

### Bot Identification
- Bots self-report their identity when querying Soma
- OR Soma knows all bot Discord IDs and matches on mention
- Probably: bots self-report (simpler, more flexible)

## Technical Stack (Proposed)

- **Language**: TypeScript (matches ChapterX)
- **Framework**: Could be standalone service OR Discord bot
- **Database**: SQLite for simplicity, or PostgreSQL for scale
- **API**: REST endpoints for bot queries

## Files to Create

1. `soma/README.md` - user-facing documentation
2. `soma/SPEC.md` - technical specification
3. `soma/src/` - implementation
4. `soma/package.json` - dependencies

## Random Thoughts

- The name "Soma" has nice resonance - it's the cell body, the core, but also the ritual drink in Vedic tradition
- "Ichor" flows between divine entities - perfect for AI interactions
- This could evolve into a reputation system later
