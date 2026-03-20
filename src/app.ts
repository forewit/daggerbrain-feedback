import { Hono } from 'hono'
import { InteractionResponseType, type APIApplicationCommandInteraction, type APIInteraction, type APIInteractionResponse, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from './constants'
import {
  createBugPreflightSession,
  deleteBug,
  findSimilarBugs,
  getBugById,
  getBugPreflightSession,
  listBugs,
  normalizeBugTitle
} from './db/bugs'
import { setBugMessageMetadata } from './db/bugs'
import { deleteFeature, getFeatureById, listFeatures, setFeatureMessageMetadata, updateFeatureStatus } from './db/features'
import { createBugFromSubmission } from './feedback/create-bug'
import { createFeatureFromSubmission } from './feedback/create-feature'
import { deriveTitleFromDescription } from './feedback/derive-title'
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
import type { BugRelationshipType, Env } from './types'
import {
  bugLinkCommandSchema,
  bugStatusCommandSchema,
  bugSubmissionSchema,
  bugsQuerySchema,
  featureSubmissionSchema
} from './validation'
import { renderDashboardPage } from './ui/dashboard'

type DashboardBugFilter = 'all' | 'open' | 'resolved'
type DashboardFeedbackFilter = 'all' | 'open' | 'resolved'

function getDashboardBugFilter(value: string | undefined): DashboardBugFilter {
  return value === 'open' || value === 'resolved' ? value : 'all'
}

function getDashboardFeedbackFilter(value: string | undefined): DashboardFeedbackFilter {
  return value === 'open' || value === 'resolved' ? value : 'all'
}

function mapBugFilterToStatus(filter: DashboardBugFilter): 'all' | 'open' | 'closed' {
  if (filter === 'open') return 'open'
  if (filter === 'resolved') return 'closed'
  return 'all'
}

function mapFeedbackFilterToStatus(filter: DashboardFeedbackFilter): 'all' | 'active' | 'resolved' {
  if (filter === 'open') return 'active'
  if (filter === 'resolved') return 'resolved'
  return 'all'
}

function buildDashboardUrl(bugFilter: DashboardBugFilter, feedbackFilter: DashboardFeedbackFilter): string {
  const params = new URLSearchParams({
    bugStatus: bugFilter,
    feedbackStatus: feedbackFilter
  })

  return `/dashboard?${params.toString()}`
}

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

function buildCreatedMessage(kind: string, id: number, messageUrl: string | null, fallbackUrl?: string | null): string {
  const url = messageUrl ?? fallbackUrl ?? null
  return url ? `${kind} #${id} is live: ${url}` : `${kind} #${id} is live.`
}

function getBugCommandDraft(interaction: APIApplicationCommandInteraction) {
  return {
    platform: null,
    severity: null,
    description: getCommandOptionString(interaction, 'description')?.trim() ?? '',
    screenshot_url: null
  }
}

function getFeatureCommandDraft(interaction: APIApplicationCommandInteraction) {
  return {
    description: getCommandOptionString(interaction, 'description')?.trim() ?? '',
    screenshot_url: null
  }
}

async function handleDashboardBugAction(env: Env, client: DiscordRestClient, bugId: number, action: string) {
  if (action === 'resolve') {
    const result = await updateBugLifecycleStatus(env.DB, bugId, 'FIXED')
    if (!result.ok) {
      return result
    }

    await syncBugMessage(env, client, result.bugId)
    return { ok: true as const }
  }

  if (action === 'open') {
    const result = await updateBugLifecycleStatus(env.DB, bugId, 'OPEN')
    if (!result.ok) {
      return result
    }

    await syncBugMessage(env, client, result.bugId)
    return { ok: true as const }
  }

  if (action === 'delete') {
    const bug = await getBugById(env.DB, bugId)
    if (!bug) {
      return { ok: false as const, message: 'Bug not found.' }
    }

    await deleteBug(env.DB, bugId)
    return { ok: true as const }
  }

  return { ok: false as const, message: 'Unsupported bug action.' }
}

async function handleDashboardFeedbackAction(env: Env, client: DiscordRestClient, featureId: number, action: string) {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature) {
    return { ok: false as const, message: 'Feedback not found.' }
  }

  if (action === 'resolve') {
    await updateFeatureStatus(env.DB, featureId, 'CLOSED')
    await syncFeatureMessage(env, client, featureId)
    return { ok: true as const }
  }

  if (action === 'open') {
    await updateFeatureStatus(env.DB, featureId, 'OPEN')
    await syncFeatureMessage(env, client, featureId)
    return { ok: true as const }
  }

  if (action === 'delete') {
    await deleteFeature(env.DB, featureId)
    return { ok: true as const }
  }

  return { ok: false as const, message: 'Unsupported feedback action.' }
}

async function createFeatureSubmissionResponse(env: Env, client: DiscordRestClient, userId: string, input: {
  description: string
  screenshot_url: string | null
}): Promise<APIInteractionResponse> {
  const result = await createFeatureFromSubmission(env.DB, userId, input)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  try {
    const message = await createFeatureReportMessage(env, client, result.feature)
    await setFeatureMessageMetadata(env.DB, result.feature.id, message.channel_id, message.id)
    return ephemeralMessage(buildCreatedMessage('Feedback', result.feature.id, buildDiscordMessageUrl(env, message.channel_id, message.id)))
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
    platform: 'WEB' | 'IOS' | 'ANDROID' | 'DESKTOP' | 'OTHER' | null
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
    description: string
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
  const trimmedDescription = draft.description.trim()

  if (!trimmedDescription) {
    const sessionId = interaction.id
    await createBugPreflightSession(env.DB, {
      sessionId,
      userId,
      title: '',
      titleNormalized: ''
    })

    return bugModalResponse({
      sessionId,
      initialDescription: '',
      relationshipType: null,
      targetBugId: null
    })
  }

  const derivedTitle = deriveTitleFromDescription(trimmedDescription)

  const sessionId = interaction.id
  await createBugPreflightSession(env.DB, {
    sessionId,
    userId,
    title: trimmedDescription,
    titleNormalized: normalizeBugTitle(derivedTitle)
  })

  const submission = bugSubmissionSchema.safeParse(draft)
  if (!submission.success) {
    return ephemeralMessage('Bug submission validation failed. Please add a description and keep it concise.')
  }

  const matches = await findSimilarBugs(env.DB, derivedTitle)
  if (matches.duplicates.length === 0 && matches.regressions.length === 0) {
    return createBugSubmissionResponse(env, client, userId, submission.data)
  }

  return bugPreflightResponse(sessionId, derivedTitle, matches.duplicates, matches.regressions)
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

  if (commandName === 'feedback' || commandName === 'feature') {
    const userId = getInteractionUserId(interaction)
    if (!userId) {
      return ephemeralMessage('Unable to determine the reporting user.')
    }

    const draft = getFeatureCommandDraft(interaction)
    if (draft.description) {
      const parsed = featureSubmissionSchema.safeParse(draft)
      if (!parsed.success) {
        return ephemeralMessage('Feedback validation failed.')
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
      return ephemeralMessage('Feedback validation failed.')
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
  if (typeof modalValues.description === 'string' && !modalValues.description.trim() && preflightSession?.title) {
    modalValues.description = preflightSession.title
  }

  const parsed = bugSubmissionSchema.safeParse({
    ...modalValues,
    platform: typeof modalValues.platform === 'string' && modalValues.platform.trim() ? modalValues.platform : null,
    severity: typeof modalValues.severity === 'string' && modalValues.severity.trim() ? modalValues.severity : null,
    screenshot_url: getModalUploadedAttachmentUrl(interaction, BUG_MODAL_FIELDS.screenshot)
  })

  if (!parsed.success) {
    return ephemeralMessage('Bug submission validation failed. Please add a description and keep it concise.')
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
      initialDescription: session.title,
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

  return ephemeralMessage('Mark bugs as fixed from the admin workflow instead.')
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
    const bugFilter = getDashboardBugFilter(c.req.query('bugStatus'))
    const feedbackFilter = getDashboardFeedbackFilter(c.req.query('feedbackStatus'))

    const [rawBugs, rawFeatures] = await Promise.all([
      listBugs(c.env.DB, mapBugFilterToStatus(bugFilter), 'newest'),
      listFeatures(c.env.DB, { status: mapFeedbackFilterToStatus(feedbackFilter), sort: 'newest', limit: 200 })
    ])

    const bugs = rawBugs.map((bug) => ({
      ...bug,
      message_url: buildDiscordMessageUrl(c.env, bug.channel_id ?? null, bug.message_id ?? null)
    }))

    const features = rawFeatures.map((feature) => ({
      ...feature,
      message_url: buildDiscordMessageUrl(c.env, feature.channel_id ?? null, feature.message_id ?? null)
    }))

    return c.html(
      renderDashboardPage({
        bugs,
        features,
        currentBugFilter: bugFilter,
        currentFeedbackFilter: feedbackFilter
      })
    )
  })

  app.post('/dashboard/actions', async (c) => {
    const formData = await c.req.formData()
    const kind = String(formData.get('kind') ?? '')
    const action = String(formData.get('action') ?? '')
    const id = Number(formData.get('id') ?? 0)
    const bugFilter = getDashboardBugFilter(String(formData.get('bugStatus') ?? 'all'))
    const feedbackFilter = getDashboardFeedbackFilter(String(formData.get('feedbackStatus') ?? 'all'))
    const client = new DiscordRestClient(c.env)

    if (!Number.isInteger(id) || id <= 0) {
      return c.redirect(buildDashboardUrl(bugFilter, feedbackFilter))
    }

    const result =
      kind === 'bug'
        ? await handleDashboardBugAction(c.env, client, id, action)
        : kind === 'feedback'
          ? await handleDashboardFeedbackAction(c.env, client, id, action)
          : { ok: false as const, message: 'Unsupported dashboard action.' }

    if (!result.ok) {
      console.error('dashboard.action_failed', { kind, action, id, message: result.message })
    }

    return c.redirect(buildDashboardUrl(bugFilter, feedbackFilter))
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
