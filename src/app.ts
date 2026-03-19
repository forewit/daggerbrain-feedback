import { Hono } from 'hono'
import { InteractionResponseType, type APIApplicationCommandInteraction, type APIInteraction, type APIInteractionResponse, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from './constants'
import {
  createBugPreflightSession,
  findSimilarBugs,
  getBugById,
  getBugPreflightSession,
  listBugs,
  normalizeBugTitle
} from './db/bugs'
import { setBugMessageMetadata } from './db/bugs'
import { setFeatureMessageMetadata } from './db/features'
import { createBugFromSubmission } from './feedback/create-bug'
import { createFeatureFromSubmission } from './feedback/create-feature'
import { linkBugAsDuplicate, linkBugAsRegression } from './feedback/link-duplicate'
import { updateBugLifecycleStatus } from './feedback/update-status'
import { upvoteBug, upvoteFeature } from './feedback/upvote'
import {
  getCommandOptionInteger,
  getCommandOptionString,
  getInteractionUserId,
  getModalFieldValues,
  getModalUploadedAttachmentUrl,
  hasAnyRole,
  hasManageMessagesPermission,
  isApplicationCommandInteraction,
  isMessageComponentInteraction,
  isModalSubmitInteraction,
  isPingInteraction,
  parseBugAction,
  parseBugModalCustomId,
  parseDiscordInteraction,
  parseDuplicateSelectionCustomId,
  parseFeatureUpvote,
  parsePreflightCustomId,
  verifyDiscordRequest
} from './discord/interactions'
import {
  bugModalResponse,
  bugPreflightResponse,
  duplicateSelectionResponse,
  ephemeralMessage,
  featureModalResponse,
  silentComponentAck,
  topBugsResponse
} from './discord/messages'
import {
  buildDashboardBugUrl,
  buildDiscordMessageUrl,
  createBugReportMessage,
  createFeatureReportMessage,
  getCreateMessageFailureMessage,
  logDiscordApiError,
  syncBugMessage,
  syncFeatureMessage
} from './discord/publisher'
import { DiscordRestClient } from './discord/rest'
import type { BugRelationshipType, BugStatus, Env } from './types'
import {
  bugLinkCommandSchema,
  bugPreflightTitleSchema,
  bugStatusCommandSchema,
  bugSubmissionSchema,
  bugsQuerySchema,
  featureSubmissionSchema
} from './validation'
import { renderDashboardPage } from './ui/dashboard'

function isModerator(interaction: APIInteraction, env: Env): boolean {
  return hasManageMessagesPermission(interaction.member?.permissions) || hasAnyRole(interaction.member?.roles, env.DISCORD_MOD_ROLE_IDS)
}

function buildBugSubmissionMessage(
  env: Env,
  options: { bugId: number; relatedBugId?: number; relationshipType?: BugRelationshipType | null }
): string {
  const link = buildDashboardBugUrl(env, options.relatedBugId ?? options.bugId)

  if (options.relationshipType === 'DUPLICATE_OF' && options.relatedBugId) {
    return link ? `Linked to bug #${options.relatedBugId}. Track it here: ${link}` : `Linked to bug #${options.relatedBugId}.`
  }

  if (options.relationshipType === 'REGRESSION_OF' && options.relatedBugId) {
    return link ? `Regression bug #${options.bugId} is live: ${link}` : `Regression bug #${options.bugId} is live.`
  }

  return link ? `Bug #${options.bugId} is live: ${link}` : `Bug #${options.bugId} is live.`
}

function buildCreatedMessage(kind: 'Bug' | 'Feature', id: number, messageUrl: string | null, fallbackUrl?: string | null): string {
  const url = messageUrl ?? fallbackUrl ?? null
  return url ? `${kind} #${id} is live: ${url}` : `${kind} #${id} is live.`
}

function getBugCommandDraft(interaction: APIApplicationCommandInteraction) {
  return {
    title: getCommandOptionString(interaction, 'title')?.trim() ?? '',
    platform: null,
    severity: null,
    description: getCommandOptionString(interaction, 'description')?.trim() ?? '',
    steps: getCommandOptionString(interaction, 'steps')?.trim() ?? '',
    expected: getCommandOptionString(interaction, 'expected')?.trim() ?? '',
    actual: getCommandOptionString(interaction, 'actual')?.trim() ?? '',
    screenshot_url: null
  }
}

function getFeatureCommandDraft(interaction: APIApplicationCommandInteraction) {
  return {
    feature_title: getCommandOptionString(interaction, 'title')?.trim() ?? '',
    feature_benefit: '',
    feature_description: getCommandOptionString(interaction, 'description')?.trim() ?? '',
    screenshot_url: null
  }
}

async function createFeatureSubmissionResponse(env: Env, client: DiscordRestClient, userId: string, input: {
  feature_title: string
  feature_benefit: string
  feature_description: string
  screenshot_url: string | null
}): Promise<APIInteractionResponse> {
  const result = await createFeatureFromSubmission(env.DB, userId, input)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  try {
    const message = await createFeatureReportMessage(env, client, result.feature)
    await setFeatureMessageMetadata(env.DB, result.feature.id, message.channel_id, message.id)
    return ephemeralMessage(buildCreatedMessage('Feature', result.feature.id, buildDiscordMessageUrl(env, message.channel_id, message.id)))
  } catch (error) {
    logDiscordApiError('discord.create_feature_message_failed', error, { featureId: result.feature.id })
    return ephemeralMessage(getCreateMessageFailureMessage('feature', error))
  }
}

async function createBugSubmissionResponse(
  env: Env,
  client: DiscordRestClient,
  userId: string,
  input: {
    title: string
    platform: 'WEB' | 'IOS' | 'ANDROID' | 'DESKTOP' | 'OTHER' | null
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
    description: string
    steps: string
    expected: string
    actual: string
    screenshot_url: string | null
  },
  options?: { relationshipType?: BugRelationshipType | null; targetBugId?: number | null }
): Promise<APIInteractionResponse> {
  const result = await createBugFromSubmission(env.DB, userId, input, options)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  if (options?.relationshipType === 'DUPLICATE_OF' && result.targetBug) {
    await syncBugMessage(env, client, result.targetBug.id)
    return ephemeralMessage(
      buildBugSubmissionMessage(env, {
        bugId: result.bug.id,
        relatedBugId: result.targetBug.id,
        relationshipType: options.relationshipType
      })
    )
  }

  try {
    const message = await createBugReportMessage(env, client, result.bug)
    await setBugMessageMetadata(env.DB, result.bug.id, message.channel_id, message.id)

    if (options?.relationshipType === 'REGRESSION_OF' && result.targetBug) {
      await syncBugMessage(env, client, result.targetBug.id)
    }

    return ephemeralMessage(
      buildCreatedMessage('Bug', result.bug.id, buildDiscordMessageUrl(env, message.channel_id, message.id), buildDashboardBugUrl(env, result.bug.id))
    )
  } catch (error) {
    if (options?.relationshipType === 'REGRESSION_OF' && result.targetBug) {
      await syncBugMessage(env, client, result.targetBug.id)
    }

    logDiscordApiError('discord.create_bug_message_failed', error, { bugId: result.bug.id })
    return ephemeralMessage(getCreateMessageFailureMessage('bug', error))
  }
}

async function handleBugCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the reporting user.')
  }

  const draft = getBugCommandDraft(interaction)
  const trimmedTitle = draft.title
  const hasInlineDetails = Boolean(draft.description || draft.steps || draft.expected || draft.actual)

  if (!trimmedTitle) {
    const sessionId = interaction.id
    await createBugPreflightSession(env.DB, {
      sessionId,
      userId,
      title: '',
      titleNormalized: ''
    })

    return bugModalResponse({
      sessionId,
      initialTitle: '',
      relationshipType: null,
      targetBugId: null
    })
  }

  const parsed = bugPreflightTitleSchema.safeParse(trimmedTitle)
  if (!parsed.success) {
    return ephemeralMessage('Please provide a short bug title with at least 3 characters.')
  }

  const sessionId = interaction.id
  await createBugPreflightSession(env.DB, {
    sessionId,
    userId,
    title: parsed.data,
    titleNormalized: normalizeBugTitle(parsed.data)
  })

  if (hasInlineDetails) {
    const submission = bugSubmissionSchema.safeParse(draft)
    if (!submission.success) {
      return ephemeralMessage('Bug submission validation failed. Please make the title clear and keep the fields concise.')
    }

    return createBugSubmissionResponse(env, client, userId, submission.data)
  }

  const matches = await findSimilarBugs(env.DB, parsed.data)
  if (matches.duplicates.length === 0 && matches.regressions.length === 0) {
    return bugModalResponse({
      sessionId,
      initialTitle: parsed.data,
      relationshipType: null,
      targetBugId: null
    })
  }

  return bugPreflightResponse(sessionId, parsed.data, matches.duplicates, matches.regressions)
}

async function handleBugStatusCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (!isModerator(interaction, env)) {
    return ephemeralMessage('You are not allowed to update bug statuses.')
  }

  const parsed = bugStatusCommandSchema.safeParse({
    bugId: getCommandOptionInteger(interaction, 'bug_id') ?? 0,
    status: getCommandOptionString(interaction, 'status') ?? ''
  })

  if (!parsed.success) {
    return ephemeralMessage('Invalid bug status command.')
  }

  const result = await updateBugLifecycleStatus(env.DB, parsed.data.bugId, parsed.data.status)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  if (result.previousStatus !== result.nextStatus) {
    console.info('bug.status_changed', { bugId: result.bugId, previousStatus: result.previousStatus, nextStatus: result.nextStatus })
  }

  return ephemeralMessage(`Bug #${result.bugId} is now ${result.nextStatus}.`)
}

async function handleBugLinkCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (!isModerator(interaction, env)) {
    return ephemeralMessage('You are not allowed to link bugs.')
  }

  const parsed = bugLinkCommandSchema.safeParse({
    bugId: getCommandOptionInteger(interaction, 'bug_id') ?? 0,
    targetBugId: getCommandOptionInteger(interaction, 'target_bug_id') ?? 0,
    relation: getCommandOptionString(interaction, 'relation') ?? ''
  })

  if (!parsed.success) {
    return ephemeralMessage('Invalid bug link command.')
  }

  if (parsed.data.relation === 'duplicate') {
    const result = await linkBugAsDuplicate(env.DB, parsed.data.bugId, parsed.data.targetBugId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    await syncBugMessage(env, client, result.bugId)
    await syncBugMessage(env, client, result.targetBugId)
    return ephemeralMessage(`Linked bug #${result.bugId} to bug #${result.targetBugId} as a duplicate.`)
  }

  const result = await linkBugAsRegression(env.DB, parsed.data.bugId, parsed.data.targetBugId)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  await syncBugMessage(env, client, result.targetBugId)
  if (result.previousStatus !== result.nextStatus) {
    console.info('bug.status_changed', { bugId: result.bugId, previousStatus: result.previousStatus, nextStatus: result.nextStatus })
  }

  return ephemeralMessage(`Linked bug #${result.bugId} to bug #${result.targetBugId} as a regression.`)
}

async function handleCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  const commandName = interaction.data.name

  if (commandName === 'bug') {
    return handleBugCommand(env, client, interaction)
  }

  if (commandName === 'feature') {
    const userId = getInteractionUserId(interaction)
    if (!userId) {
      return ephemeralMessage('Unable to determine the reporting user.')
    }

    const draft = getFeatureCommandDraft(interaction)
    if (draft.feature_title) {
      const parsed = featureSubmissionSchema.safeParse(draft)
      if (!parsed.success) {
        return ephemeralMessage('Feature request validation failed.')
      }

      return createFeatureSubmissionResponse(env, client, userId, parsed.data)
    }

    return featureModalResponse('')
  }

  if (commandName === 'topbugs') {
    return topBugsResponse(await listBugs(env.DB, 'open', 'top'))
  }

  if (commandName === 'bug-status') {
    return handleBugStatusCommand(env, client, interaction)
  }

  if (commandName === 'bug-link') {
    return handleBugLinkCommand(env, client, interaction)
  }

  return ephemeralMessage('Unknown command.')
}

async function handleModalSubmit(env: Env, client: DiscordRestClient, interaction: APIModalSubmitInteraction): Promise<APIInteractionResponse> {
  if (interaction.data.custom_id === CUSTOM_IDS.featureModal) {
    const parsed = featureSubmissionSchema.safeParse({
      ...getModalFieldValues(interaction, 'feature'),
      screenshot_url: getModalUploadedAttachmentUrl(interaction, FEATURE_MODAL_FIELDS.screenshot)
    })

    if (!parsed.success) {
      return ephemeralMessage('Feature request validation failed.')
    }

    const userId = getInteractionUserId(interaction)
    if (!userId) {
      return ephemeralMessage('Unable to determine the reporting user.')
    }

    return createFeatureSubmissionResponse(env, client, userId, parsed.data)
  }

  const modalState = parseBugModalCustomId(interaction.data.custom_id)
  if (!modalState) {
    return ephemeralMessage('Unknown modal submission.')
  }

  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the reporting user.')
  }

  const preflightSession = modalState.sessionId ? await getBugPreflightSession(env.DB, modalState.sessionId, userId) : null
  if (modalState.sessionId && !preflightSession) {
    return ephemeralMessage('That report draft expired. Please run /bug again.')
  }

  const modalValues = getModalFieldValues(interaction)
  if (typeof modalValues.title === 'string' && !modalValues.title.trim() && preflightSession?.title) {
    modalValues.title = preflightSession.title
  }

  const parsed = bugSubmissionSchema.safeParse({
    ...modalValues,
    platform: typeof modalValues.platform === 'string' && modalValues.platform.trim() ? modalValues.platform : null,
    severity: typeof modalValues.severity === 'string' && modalValues.severity.trim() ? modalValues.severity : null,
    screenshot_url: getModalUploadedAttachmentUrl(interaction, BUG_MODAL_FIELDS.screenshot)
  })

  if (!parsed.success) {
    return ephemeralMessage('Bug submission validation failed. Please make the title clear and keep the fields concise.')
  }

  return createBugSubmissionResponse(env, client, userId, parsed.data, {
    relationshipType: modalState.relationshipType,
    targetBugId: modalState.targetBugId
  })
}

async function handleComponent(env: Env, client: DiscordRestClient, interaction: APIMessageComponentInteraction): Promise<APIInteractionResponse> {
  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unknown action.')
  }

  const preflightAction = parsePreflightCustomId(interaction.data.custom_id)
  if (preflightAction) {
    const session = await getBugPreflightSession(env.DB, preflightAction.sessionId, userId)
    if (!session) {
      return ephemeralMessage('That report draft expired. Please run /bug again.')
    }

    return bugModalResponse({
      sessionId: session.session_id,
      initialTitle: session.title,
      relationshipType: preflightAction.relationshipType,
      targetBugId: preflightAction.targetBugId
    })
  }

  const duplicateSelection = parseDuplicateSelectionCustomId(interaction.data.custom_id)
  if (duplicateSelection) {
    const bug = await getBugById(env.DB, duplicateSelection.sourceBugId)
    if (!bug) {
      return ephemeralMessage('Bug not found.')
    }

    const authorized = bug.reporter_id === userId || isModerator(interaction, env)
    if (!authorized) {
      return ephemeralMessage('Only the reporter or a moderator can mark this bug as a duplicate.')
    }

    const result = await linkBugAsDuplicate(env.DB, bug.id, duplicateSelection.targetBugId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    await syncBugMessage(env, client, result.bugId)
    await syncBugMessage(env, client, result.targetBugId)
    return silentComponentAck()
  }

  const featureVote = parseFeatureUpvote(interaction.data.custom_id)
  if (featureVote) {
    const result = await upvoteFeature(env.DB, featureVote.featureId, userId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    if (result.outcome === 'duplicate') {
      return silentComponentAck()
    }

    await syncFeatureMessage(env, client, result.feature.id)
    return silentComponentAck()
  }

  const action = parseBugAction(interaction.data.custom_id)
  if (!action) {
    return ephemeralMessage('Unknown action.')
  }

  const bug = await getBugById(env.DB, action.bugId)
  if (!bug) {
    return ephemeralMessage('Bug not found.')
  }

  if (action.action === 'upvote') {
    const result = await upvoteBug(env.DB, bug.id, userId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    if (result.outcome === 'duplicate') {
      return silentComponentAck()
    }

    await syncBugMessage(env, client, result.bug.id)
    return silentComponentAck()
  }

  if (action.action === 'duplicate') {
    const authorized = bug.reporter_id === userId || isModerator(interaction, env)
    if (!authorized) {
      return ephemeralMessage('Only the reporter or a moderator can mark this bug as a duplicate.')
    }

    if (bug.status === 'DUPLICATE' || bug.relationship_type === 'DUPLICATE_OF') {
      return ephemeralMessage('This bug is already marked as a duplicate.')
    }

    const matches = await findSimilarBugs(env.DB, bug.title, { excludeBugId: bug.id })
    if (matches.duplicates.length === 0) {
      return ephemeralMessage('No close open matches were found. Use /bug-link to link it manually.')
    }

    return duplicateSelectionResponse(bug, matches.duplicates)
  }

  const authorized = bug.reporter_id === userId || isModerator(interaction, env)
  if (!authorized) {
    console.error('discord.fixed_unauthorized', { bugId: bug.id, userId })
    return ephemeralMessage('You cannot close this bug.')
  }

  if (bug.status === 'FIXED') {
    return ephemeralMessage('This bug is already marked fixed.')
  }

  if (bug.status === 'CLOSED' || bug.status === 'DUPLICATE') {
    return ephemeralMessage('This bug is already closed.')
  }

  const result = await updateBugLifecycleStatus(env.DB, bug.id, 'FIXED' satisfies BugStatus)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  if (result.previousStatus !== result.nextStatus) {
    console.info('bug.status_changed', { bugId: result.bugId, previousStatus: result.previousStatus, nextStatus: result.nextStatus })
  }

  return silentComponentAck()
}

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', (c) => c.json({ ok: true, service: 'daggerbrain-feedback' }))

  app.post('/commands/register', async (c) => {
    try {
      await new DiscordRestClient(c.env).registerCommands()
      return c.json({ ok: true })
    } catch (error) {
      logDiscordApiError('discord.command_registration_failed', error)
      return c.json({ ok: false }, 500)
    }
  })

  app.get('/api/bugs', async (c) => {
    const query = bugsQuerySchema.parse({
      status: c.req.query('status') ?? 'open',
      sort: c.req.query('sort') ?? 'top'
    })

    return c.json({ bugs: await listBugs(c.env.DB, query.status, query.sort) })
  })

  app.get('/dashboard', async (c) => {
    const query = bugsQuerySchema.parse({
      status: c.req.query('status') ?? 'open',
      sort: c.req.query('sort') ?? 'top'
    })
    const bugs = await listBugs(c.env.DB, query.status, query.sort)
    return c.html(renderDashboardPage(bugs, query.status, query.sort))
  })

  app.post('/interactions', async (c) => {
    const body = await c.req.text()
    const signature = c.req.header('X-Signature-Ed25519')
    const timestamp = c.req.header('X-Signature-Timestamp')

    if (!(await verifyDiscordRequest(signature, timestamp, body, c.env.DISCORD_PUBLIC_KEY))) {
      console.error('discord.invalid_signature', { hasSignature: Boolean(signature), hasTimestamp: Boolean(timestamp) })
      return c.text('invalid request signature', 401)
    }

    const interaction = parseDiscordInteraction(body)
    const client = new DiscordRestClient(c.env)

    if (isPingInteraction(interaction)) {
      return c.json({ type: InteractionResponseType.Pong })
    }

    if (isApplicationCommandInteraction(interaction)) {
      return c.json(await handleCommand(c.env, client, interaction))
    }

    if (isModalSubmitInteraction(interaction)) {
      return c.json(await handleModalSubmit(c.env, client, interaction))
    }

    if (isMessageComponentInteraction(interaction)) {
      return c.json(await handleComponent(c.env, client, interaction))
    }

    return c.json(ephemeralMessage('Unsupported interaction.'))
  })

  app.onError((error, c) => {
    console.error('app.unhandled_error', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  })

  return app
}
