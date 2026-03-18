# Discord Bug Bot Implementation Plan

## Status
- Overall status: `Completed`
- Last updated: `2026-03-18`
- Current focus: Final validation, deployment documentation, and handoff.
- Known blockers: None currently. The repository now contains a deployable TypeScript Cloudflare Worker implementation and setup documentation.

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
- [x] Bootstrap Worker app and tooling
- [x] Add D1 schema and migrations
- [x] Implement Discord signature verification and interaction router
- [x] Implement `/bug` modal flow
- [x] Persist bug reports and post embeds to configured channel
- [x] Implement upvote flow
- [x] Implement duplicate flag flow
- [x] Implement mark-fixed authorization and flow
- [x] Implement `/topbugs`
- [x] Implement `/api/bugs`
- [x] Implement `/dashboard`
- [x] Add tests
- [x] Document deployment and operations

## Detailed Plan

### 1. Worker App and Tooling
- [x] Initialize the repo as a Cloudflare Worker project using `npm`, TypeScript, Hono, Wrangler, and Vitest.
- [x] Add a minimal project structure centered around:
  - `src/index.ts` for the Hono app entrypoint and route registration
  - a Discord integration layer for interaction parsing and REST calls
  - a database layer for D1 queries and row mapping
- [x] Configure `wrangler.toml` with the D1 binding and environment variable names for:
  - `DISCORD_PUBLIC_KEY`
  - `DISCORD_APPLICATION_ID`
  - `DISCORD_TOKEN`
  - `BUG_REPORT_CHANNEL_ID`
  - `DISCORD_MOD_ROLE_IDS`
  - `DISCORD_DEV_GUILD_ID`
- [x] Keep the initial implementation small and explicit instead of over-abstracting the codebase before behavior is proven.

### 2. D1 Schema and Persistence
- [x] Add an initial D1 migration that creates:
  - `bugs`
  - `votes`
  - `duplicate_flags`
- [x] `votes` enforces one upvote per user per bug through a composite primary key.
- [x] `duplicate_flags` enforces one duplicate flag per user per bug through a composite primary key.
- [x] All message updates are rendered from canonical database state rather than mutating stale Discord payload data.

### 3. Discord Interaction Endpoint
- [x] Implement `POST /interactions` as the single Discord entrypoint.
- [x] Verify every request using:
  - `X-Signature-Ed25519`
  - `X-Signature-Timestamp`
  - the raw request body
- [x] Return `{"type":1}` for Discord `PING` requests.
- [x] Route interaction payloads by type:
  - slash commands
  - modal submits
  - component interactions
- [x] Reject invalid signatures with `401` and log the failure in a structured, non-secret way.

### 4. Slash Commands
- [x] Register two commands:
  - `/bug`
  - `/topbugs`
- [x] `/bug` responds with a modal capturing title, description, steps, expected behavior, and actual behavior.
- [x] `/topbugs` queries open bugs ordered by vote count descending and then recency.
- [x] Command registration supports guild-scoped registration in development and global registration otherwise.

### 5. Modal Submission Flow
- [x] On modal submit, validate fields, persist a bug record, render canonical Discord content, post into the configured channel, persist returned message metadata, and return an ephemeral success response with the bug ID.
- [x] Posting into the configured channel uses the Discord REST API rather than relying on the modal callback channel.

### 6. Bug Message Rendering
- [x] Centralize message rendering in one function that takes a bug record plus counters and produces the embed and action row.
- [x] The embed displays title, description, reproduction fields, status, votes, duplicate flags, reporter, and bug ID.
- [x] Action row component IDs follow the required formats for upvote, duplicate, and fixed actions.
- [x] Closed bugs stay visible and disable `Upvote` and `Mark Fixed`.

### 7. Upvote Flow
- [x] Clicking `upvote:<bugId>` confirms the bug exists and remains open.
- [x] Repeated votes are rejected ephemerally.
- [x] Successful votes update D1 and refresh the canonical Discord message.

### 8. Duplicate Flag Flow
- [x] Clicking `duplicate:<bugId>` confirms the bug exists.
- [x] Repeated duplicate flags are rejected ephemerally.
- [x] Successful flags update D1 and refresh the canonical Discord message.
- [x] Duplicate handling remains informational only in v1.

### 9. Mark Fixed Flow
- [x] Clicking `fixed:<bugId>` loads the bug and reporter.
- [x] Authorization allows the original reporter, members with `Manage Messages`, or configured moderator roles.
- [x] Unauthorized attempts are rejected ephemerally and logged.
- [x] Successful closures update the bug status and refresh the canonical Discord message.

### 10. Discord REST Client
- [x] Implement a small typed Discord REST wrapper for command registration, channel message creation, and channel message editing.
- [x] Normalize Discord failure handling through explicit logging and safe user-facing messages.

### 11. Read-Only API
- [x] Add `GET /api/bugs` to return a JSON list of bug summaries.
- [x] Support filtering and sorting via query params:
  - `status=open|closed|all`
  - `sort=top|newest`
- [x] Return a stable summary shape containing `id`, `title`, `status`, `votes_count`, `duplicate_flags_count`, and `created_at`.

### 12. Basic Dashboard
- [x] Add `GET /dashboard` served by the same Worker.
- [x] Keep the dashboard read-only in v1.
- [x] Show open bugs first by default plus status, votes, duplicate flags, and sort/filter controls.
- [x] Serve a simple Worker-rendered HTML page rather than a separate SPA.

### 13. Observability and Operations
- [x] Log invalid signatures, failed Discord REST calls, authorization denials, and unhandled errors.
- [x] Avoid logging secrets, tokens, or raw sensitive headers.
- [x] Add deployment and operations documentation covering secret setup, D1 migrations, command registration, and local development.
