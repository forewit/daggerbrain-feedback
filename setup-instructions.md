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
```

Optional fallback secrets:

```bash
npx wrangler secret put BUG_REPORT_CHANNEL_ID
npx wrangler secret put FEATURE_CHANNEL_ID
```

If you skip the fallback channel secrets, a server admin can configure per-server intake channels in Discord with `/feedback-config set`.

Optional non-secret variable in `wrangler.toml`:

- `DISCORD_MOD_ROLE_IDS`: comma-separated Discord role IDs allowed to mark bugs fixed.
- `DISCORD_DEV_GUILD_ID`: use a single guild ID during development to register slash commands faster.
- `PUBLIC_APP_URL`: base URL for dashboard deep links and automatic slash-command registration after deploy.

Optional local `.env` value for deployment automation:

- `COMMANDS_REGISTER_URL`: override the URL used by `npm run register-commands` / post-deploy registration. If omitted, the script falls back to `PUBLIC_APP_URL`.
- `COMMANDS_REGISTER_SECRET`: required if `/commands/register` is protected by `COMMANDS_REGISTER_SECRET` in the Worker environment. The registration script sends this as the `x-register-secret` header.

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

Slash commands are now re-registered automatically after `npm run deploy`.

If you need to force a refresh manually:

```bash
npm run register-commands
```

This calls:

```text
POST <COMMANDS_REGISTER_URL or PUBLIC_APP_URL>/commands/register
```

If command registration protection is enabled, it also sends:

```text
x-register-secret: <COMMANDS_REGISTER_SECRET>
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

Ensure the application is installed in the server with both the `bot` and `applications.commands` scopes. Slash commands can work without the bot user being able to post, so confirm the bot actually appears in the server member list.

Ensure the bot can access whichever bug and suggestion channels you configure, whether through fallback env vars or `/feedback-config set`:

- `View Channel`
- `Send Messages`
- `Embed Links`
- If the channel is private, explicitly allow the bot role or the bot user.

If `BUG_REPORT_CHANNEL_ID` points to a forum or media channel, the bot must also be able to create posts there. The Worker now uses the forum/media thread-creation endpoint for those channel types.
If `FEATURE_CHANNEL_ID` points to a forum or media channel, the same applies to feature request posts.

## 8. Validate the application

- Open `/dashboard` to inspect the HTML dashboard.
- Call `/api/bugs` to confirm JSON output.
- Run `/bug title:<summary>` in Discord to exercise duplicate preflight and the modal flow.
- Try `/bug-status` and `/bug-link` as a moderator to verify lifecycle changes and linking behavior.
- Run `/topbugs` in Discord to confirm ranking output.

## Operational notes

- Invalid signatures, failed Discord REST calls, authorization denials, and unhandled application errors are logged with structured event names.
- `OPEN` and `IN_PROGRESS` bugs can receive votes; `FIXED` and `CLOSED` bugs stay visible for history.
- Duplicate self-linking closes the child report, records it in D1, and adds the reporter's vote to the canonical bug.
- Status changes attempt to DM the reporter, voters, and duplicate reporters, but DM failures are logged and do not fail the interaction.
