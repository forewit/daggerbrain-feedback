# Discord Bug Bot Implementation Plan

## Status
- Overall status: `Not started`
- Last updated: `2026-03-18`
- Current focus: Establish the implementation plan and tracking conventions before code scaffolding begins.
- Known blockers: None currently. The repository is greenfield and ready for initial scaffolding.

## Decisions Locked In
- Build the project as a greenfield TypeScript Cloudflare Worker using Hono.
- Use Cloudflare D1 as the primary datastore.
- Initial scope includes the MVP flow plus `/topbugs`, duplicate flagging, a read-only API, and a basic dashboard.
- New bug embeds always post to a configured Discord channel rather than the invocation channel.
- Duplicate handling is flag-only in v1 and does not link to a canonical bug.
- `Mark Fixed` is allowed for admins/moderators or the original reporter.
- Closed bugs remain visible for history and auditability.
- Upvoting is disabled after a bug is closed by default.
- The tracking document is the source of truth for implementation progress, but not for secrets or environment values.
- Future agents may refine execution order, but should not change locked product decisions without user approval.

## Milestones
- [ ] Bootstrap Worker app and tooling
- [ ] Add D1 schema and migrations
- [ ] Implement Discord signature verification and interaction router
- [ ] Implement `/bug` modal flow
- [ ] Persist bug reports and post embeds to configured channel
- [ ] Implement upvote flow
- [ ] Implement duplicate flag flow
- [ ] Implement mark-fixed authorization and flow
- [ ] Implement `/topbugs`
- [ ] Implement `/api/bugs`
- [ ] Implement `/dashboard`
- [ ] Add tests
- [ ] Document deployment and operations

## Detailed Plan

### 1. Worker App and Tooling
- Initialize the repo as a Cloudflare Worker project using `npm`, TypeScript, Hono, Wrangler, and Vitest.
- Add a minimal project structure centered around:
  - `src/index.ts` for the Hono app entrypoint and route registration
  - a Discord integration layer for interaction parsing and REST calls
  - a database layer for D1 queries and row mapping
- Configure `wrangler.toml` with the D1 binding and environment variable names for:
  - `DISCORD_PUBLIC_KEY`
  - `DISCORD_APPLICATION_ID`
  - `DISCORD_TOKEN`
  - `BUG_REPORT_CHANNEL_ID`
  - `DISCORD_MOD_ROLE_IDS`
  - `DISCORD_DEV_GUILD_ID`
- Keep the initial implementation small and explicit instead of over-abstracting the codebase before behavior is proven.

### 2. D1 Schema and Persistence
- Add an initial D1 migration that creates:
  - `bugs`
  - `votes`
  - `duplicate_flags`
- `bugs` should include:
  - `id`
  - `title`
  - `description`
  - `steps`
  - `expected`
  - `actual`
  - `status`
  - `reporter_id`
  - `votes_count`
  - `duplicate_flags_count`
  - `channel_id`
  - `message_id`
  - `created_at`
  - `updated_at`
- `votes` should enforce one upvote per user per bug through a composite primary key.
- `duplicate_flags` should enforce one duplicate flag per user per bug through a composite primary key.
- All message updates should be rendered from canonical database state rather than mutating stale Discord payload data.

### 3. Discord Interaction Endpoint
- Implement `POST /interactions` as the single Discord entrypoint.
- Verify every request using:
  - `X-Signature-Ed25519`
  - `X-Signature-Timestamp`
  - the raw request body
- Return `{"type":1}` for Discord `PING` requests.
- Route interaction payloads by type:
  - slash commands
  - modal submits
  - component interactions
- Reject invalid signatures with `401` and log the failure in a structured, non-secret way.

### 4. Slash Commands
- Register two commands:
  - `/bug`
  - `/topbugs`
- `/bug` should respond with a modal that captures:
  - title
  - description
  - steps to reproduce
  - expected behavior
  - actual behavior
- `/topbugs` should query open bugs ordered by vote count descending, then recency, and return a concise response suitable for Discord.
- Command registration should support:
  - guild-scoped registration in development when `DISCORD_DEV_GUILD_ID` is set
  - global registration otherwise

### 5. Modal Submission Flow
- On modal submit:
  - validate required fields and length constraints server-side
  - insert a new bug row in D1 with placeholder message metadata
  - render the canonical embed and components for the new bug
  - create the message in `BUG_REPORT_CHANNEL_ID` using the Discord REST API and bot token
  - update the bug row with returned `channel_id` and `message_id`
  - return an ephemeral success response that includes the bug ID
- Important implementation note:
  - Do not rely on the modal interaction callback itself to post into an arbitrary configured channel.
  - Use Discord REST for the dedicated bug-report message so the stored message metadata is authoritative.

### 6. Bug Message Rendering
- Centralize message rendering in one function that takes a bug record plus counters and produces:
  - the embed
  - the action row
- The embed should display:
  - bug title
  - description
  - steps to reproduce
  - expected behavior
  - actual behavior
  - status
  - votes
  - duplicate flags
  - reporter
  - bug ID
- The action row should include:
  - `Upvote`
  - `Duplicate`
  - `Mark Fixed`
- Use component IDs in the format:
  - `upvote:<bugId>`
  - `duplicate:<bugId>`
  - `fixed:<bugId>`
- When a bug is closed:
  - keep the message visible
  - disable the `Mark Fixed` control
  - disable further upvotes

### 7. Upvote Flow
- When `upvote:<bugId>` is clicked:
  - confirm the bug exists and is still open
  - reject repeated votes from the same user
  - insert a `votes` row
  - increment `votes_count` in `bugs`
  - re-query the canonical bug data
  - update the original Discord message with the newly rendered embed/components
- If the user already voted, respond ephemerally with a clear message.

### 8. Duplicate Flag Flow
- Duplicate handling is intentionally lightweight in v1.
- When `duplicate:<bugId>` is clicked:
  - confirm the bug exists
  - reject repeated flags from the same user
  - insert a `duplicate_flags` row
  - increment `duplicate_flags_count` in `bugs`
  - re-render and update the original message
- This flow does not establish a canonical duplicate target and does not auto-close the bug.

### 9. Mark Fixed Flow
- When `fixed:<bugId>` is clicked:
  - load the bug and its reporter
  - authorize the action if the user is:
    - the original reporter
    - a member with `Manage Messages`
    - a member whose role matches `DISCORD_MOD_ROLE_IDS`
  - reject unauthorized attempts with an ephemeral response
  - update `status` to `CLOSED`
  - update `updated_at`
  - re-render and update the original message so the UI reflects closure and disabled actions

### 10. Discord REST Client
- Implement a small typed Discord REST wrapper for:
  - command registration
  - channel message creation
  - channel message editing
- Normalize error handling so Discord failures are logged consistently and surfaced to users with safe ephemeral messages when relevant.
- Keep the wrapper thin and purpose-built for the initial feature set.

### 11. Read-Only API
- Add `GET /api/bugs` to return a JSON list of bug summaries.
- Support filtering and sorting via query params:
  - `status=open|closed|all`
  - `sort=top|newest`
- Return a stable summary shape that includes at minimum:
  - `id`
  - `title`
  - `status`
  - `votes_count`
  - `duplicate_flags_count`
  - `created_at`

### 12. Basic Dashboard
- Add `GET /dashboard` served by the same Worker.
- Keep the dashboard read-only in v1.
- Show:
  - open bugs first by default
  - status
  - votes
  - duplicate flags
  - sort and filter controls
- Prefer a simple Worker-served HTML page with lightweight client-side JS over a separate SPA build system.

### 13. Observability and Operations
- Log:
  - invalid signatures
  - failed database operations
  - failed Discord REST calls
  - authorization denials
- Avoid logging secrets, tokens, or raw sensitive headers.
- Add deployment and operations documentation covering:
  - secret setup
  - D1 migrations
  - command registration
  - local development
  - production deploy
  - credential rotation

## Test Plan

### Signature Verification
- Accept valid Discord signatures.
- Reject missing signatures.
- Reject invalid signatures with `401`.

### Command Handling
- `/bug` returns the expected modal structure.
- `/topbugs` returns a valid response for both empty and populated result sets.

### Modal Submission
- Valid modal submission creates a bug row.
- Valid submission posts a message into the configured channel.
- The created bug row is updated with `channel_id` and `message_id`.
- Invalid or oversized input is rejected cleanly.

### Upvote Behavior
- First upvote succeeds.
- Second upvote by the same user is rejected ephemerally.
- Upvoting a closed bug is rejected.
- Message re-render shows the updated vote count.

### Duplicate Behavior
- First duplicate flag succeeds.
- Repeat duplicate flag by the same user is rejected ephemerally.
- Message re-render shows the updated duplicate flag count.

### Mark Fixed Authorization
- Reporter can close their own bug.
- Moderator/admin can close any bug.
- Unauthorized users are rejected ephemerally.
- Closed bugs display updated status and disabled actions.

### API and Dashboard
- `/api/bugs` honors status and sort params.
- `/dashboard` renders correctly for empty and populated states.

### Regression Coverage
- Message re-renders use database state rather than mutated interaction payloads.
- Failures in Discord REST or D1 do not leave silent inconsistent behavior.

## Deployment Plan
- Create the Worker project and D1 database with Wrangler.
- Bind D1 in `wrangler.toml`.
- Store Discord secrets with Wrangler secrets.
- Apply the initial D1 migration before enabling commands.
- Register Discord commands:
  - guild-scoped first in development for fast iteration
  - global when ready for production
- Set the Discord Interactions Endpoint URL to the deployed Worker route.
- Verify end-to-end in a test Discord server before wider use.

## Deferred / Future Work
- Canonical duplicate linking via bug ID selection or moderator workflow.
- Additional moderation commands such as reopen, assign, or retag.
- Public/private dashboard access control.
- External integrations such as GitHub Issues or Jira.
- Analytics, summaries, and scheduled reports.
- Richer triage and categorization workflows.

## Tracking Conventions
- Future agents should update:
  - `Last updated`
  - `Overall status`
  - `Current focus`
  - `Known blockers`
  - milestone checkboxes
  - the append-only agent log
- Status labels should be limited to:
  - `Not started`
  - `In progress`
  - `Blocked`
  - `Done`
- Agents should not rewrite past log entries; add a new entry instead.

## Agent Update Log
- `2026-03-18` - `Codex` - Created the initial tracked implementation plan document and locked the agreed product defaults for future execution.
