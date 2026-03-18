# Setup Instructions

## Prerequisites
- Node.js 20+
- A Cloudflare account with Workers + D1 enabled
- A Discord application with a bot token and interactions endpoint configured

## 1. Install dependencies
```bash
npm install
```

## 2. Create a D1 database
```bash
npx wrangler d1 create daggerbrain_feedback
```
Update `wrangler.toml` with the returned `database_id`.

## 3. Configure Worker secrets and variables
Set secrets with Wrangler:
```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put BUG_REPORT_CHANNEL_ID
```
Optional non-secret variable in `wrangler.toml`:
- `DISCORD_MOD_ROLE_IDS`: comma-separated Discord role IDs allowed to mark bugs fixed.
- `DISCORD_DEV_GUILD_ID`: use a single guild ID during development to register slash commands faster.

## 4. Apply database migrations
Local:
```bash
npm run db:migrate:local
```
Remote:
```bash
npm run db:migrate:remote
```

## 5. Register Discord commands
Either call the internal route after deploy or add a one-off admin workflow:
```bash
curl -X POST https://<your-worker-domain>/commands/register
```
In development, if `DISCORD_DEV_GUILD_ID` is set, commands are registered to that guild. Otherwise, they are registered globally.

## 6. Deploy the Worker
```bash
npm run deploy
```

## 7. Configure Discord interactions
In the Discord Developer Portal, set the Interactions Endpoint URL to:
```text
https://<your-worker-domain>/interactions
```
Ensure the bot is invited with permissions needed to post and edit messages in the configured report channel.

## 8. Validate the application
- Open `/dashboard` to inspect the HTML dashboard.
- Call `/api/bugs` to confirm JSON output.
- Run `/bug` in Discord to submit a modal-driven report.
- Run `/topbugs` in Discord to confirm ranking output.

## Operational notes
- Invalid signatures, failed Discord REST calls, authorization denials, and unhandled application errors are logged with structured event names.
- Closed bugs remain visible and cannot receive additional upvotes.
- Duplicate flags are informational in v1 and do not auto-link or auto-close reports.
