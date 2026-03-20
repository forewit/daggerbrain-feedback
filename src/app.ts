import { Hono } from 'hono'
import { InteractionResponseType, type APIApplicationCommandAutocompleteInteraction, type APIApplicationCommandInteraction, type APIInteractionResponse, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, FEATURE_MODAL_FIELDS } from './constants'
import {
  createBugPreflightSession,
  deleteBug,
  findSimilarBugs,
  getBugById,
  getBugPreflightSession,
  listBugs,
  normalizeBugTitle,
  searchBugs,
  setBugMessageMetadata
} from './db/bugs'
import {
  deleteFeature,
  getFeatureById,
  listFeatures,
  searchFeatures,
  setFeatureMessageMetadata,
  updateFeatureStatus
} from './db/features'
import { addSubscription, isSubscribed, removeSubscription } from './db/subscriptions'
import { createBugFromSubmission } from './feedback/create-bug'
import { createFeatureFromSubmission } from './feedback/create-feature'
import { deriveTitleFromDescription } from './feedback/derive-title'
import { linkBugAsDuplicate, linkBugAsRegression } from './feedback/link-duplicate'
import { updateBugLifecycleStatus } from './feedback/update-status'
import { upvoteBug, upvoteFeature } from './feedback/upvote'
import {
  buildDashboardSessionCookie,
  buildDiscordOauthUrl,
  clearDashboardSessionCookie,
  createSignedSessionToken,
  exchangeOauthCode,
  fetchOauthUser,
  getCookieValue,
  verifySignedSessionToken
} from './discord/auth'
import {
  getCommandOptionInteger,
  getCommandOptionString,
  getFocusedAutocompleteOption,
  getInteractionChannelId,
  getInteractionGuildId,
  getInteractionUserId,
  getMessageCommandTarget,
  hasAnyRole,
  hasManageMessagesPermission,
  isApplicationCommandInteraction,
  isAutocompleteInteraction,
  isMessageCommandInteraction,
  isMessageComponentInteraction,
  isModalSubmitInteraction,
  isPingInteraction,
  parseBugModalCustomId,
  parseDiscordInteraction,
  parseDuplicateSelectionCustomId,
  parseFeatureModalCustomId,
  parseFeatureUpvote,
  parseManageAction,
  parsePreflightCustomId,
  parseStatusAction,
  parseSubscriptionAction,
  verifyDiscordRequest,
  getCommandPath,
  getModalFieldValues,
  getModalUploadedAttachmentUrl
} from './discord/interactions'
import {
  bugManageResponse,
  bugModalResponse,
  bugPreflightResponse,
  duplicateSelectionResponse,
  ephemeralMessage,
  featureManageResponse,
  featureModalResponse,
  myItemsResponse,
  silentComponentAck,
  topBugsResponse
} from './discord/messages'
import { notifyBugFollowers, notifyFeatureFollowers } from './discord/notifications'
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
import type { BugRelationshipType, BugStatus, Env, FeatureStatus } from './types'
import {
  bugLinkCommandSchema,
  bugStatusCommandSchema,
  bugSubmissionSchema,
  bugsQuerySchema,
  featureStatusCommandSchema,
  featureSubmissionSchema
} from './validation'
import { renderDashboardPage } from './ui/dashboard'

type DashboardBugFilter = 'all' | 'open' | 'resolved'
type DashboardSuggestionFilter = 'all' | 'open' | 'resolved'

function getDashboardBugFilter(value: string | undefined): DashboardBugFilter {
  return value === 'open' || value === 'resolved' ? value : 'all'
}

function getDashboardSuggestionFilter(value: string | undefined): DashboardSuggestionFilter {
  return value === 'open' || value === 'resolved' ? value : 'all'
}

function mapBugFilterToStatus(filter: DashboardBugFilter): 'all' | 'open' | 'closed' {
  if (filter === 'open') return 'open'
  if (filter === 'resolved') return 'closed'
  return 'all'
}

function mapSuggestionFilterToStatus(filter: DashboardSuggestionFilter): 'all' | 'active' | 'resolved' {
  if (filter === 'open') return 'active'
  if (filter === 'resolved') return 'resolved'
  return 'all'
}

function buildDashboardUrl(bugFilter: DashboardBugFilter, suggestionFilter: DashboardSuggestionFilter): string {
  const params = new URLSearchParams({
    bugStatus: bugFilter,
    suggestionStatus: suggestionFilter
  })

  return `/dashboard?${params.toString()}`
}

function isModeratorInteraction(interaction: { member?: { permissions?: string; roles?: string[] } }, env: Env): boolean {
  return hasManageMessagesPermission(interaction.member?.permissions) || hasAnyRole(interaction.member?.roles, env.DISCORD_MOD_ROLE_IDS)
}

function responseWithCookie(response: Response, cookieValue: string): Response {
  response.headers.append('Set-Cookie', cookieValue)
  return response
}

async function canManageDashboard(env: Env, client: DiscordRestClient, cookieHeader: string | null): Promise<boolean> {
  if (!env.COOKIE_SECRET || !env.DISCORD_GUILD_ID || !env.DISCORD_MOD_ROLE_IDS) {
    return false
  }

  const token = getCookieValue(cookieHeader, 'dashboard_session')
  const session = await verifySignedSessionToken(env.COOKIE_SECRET, token)
  if (!session) {
    return false
  }

  try {
    const member = await client.getGuildMember(env.DISCORD_GUILD_ID, session.userId)
    return hasAnyRole(member.roles, env.DISCORD_MOD_ROLE_IDS)
  } catch {
    return false
  }
}

function buildCreatedMessage(kind: string, id: number, messageUrl: string | null, fallbackUrl?: string | null): string {
  const url = messageUrl ?? fallbackUrl ?? null
  return url ? `${kind} #${id} is live: ${url}` : `${kind} #${id} is live.`
}

async function createFeatureSubmissionResponse(
  env: Env,
  client: DiscordRestClient,
  userId: string,
  input: {
    description: string
    screenshot_url: string | null
    source_guild_id?: string | null
    source_channel_id?: string | null
    source_message_id?: string | null
  }
): Promise<APIInteractionResponse> {
  const result = await createFeatureFromSubmission(env.DB, userId, input)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await addSubscription(env.DB, 'feature', result.feature.id, userId)

  try {
    const message = await createFeatureReportMessage(env, client, result.feature)
    await setFeatureMessageMetadata(env.DB, result.feature.id, message.channel_id, message.id)
    return ephemeralMessage(buildCreatedMessage('Suggestion', result.feature.id, buildDiscordMessageUrl(env, message.channel_id, message.id)))
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
    source_guild_id?: string | null
    source_channel_id?: string | null
    source_message_id?: string | null
  },
  options?: { relationshipType?: BugRelationshipType | null; targetBugId?: number | null }
): Promise<APIInteractionResponse> {
  const result = await createBugFromSubmission(env.DB, userId, input, options)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await addSubscription(env.DB, 'bug', result.bug.id, userId)

  if (options?.relationshipType === 'DUPLICATE_OF' && result.targetBug) {
    await syncBugMessage(env, client, result.targetBug.id)
    return ephemeralMessage(buildCreatedMessage('Bug', result.bug.id, null, buildDashboardBugUrl(env, result.targetBug.id)))
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

async function handleBugReportCommand(env: Env, _client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the reporting user.')
  }

  return bugModalResponse({
    sessionId: interaction.id,
    initialDescription: '',
    relationshipType: null,
    targetBugId: null
  })
}

async function handleFeatureReportCommand(
  _env: Env,
  _client: DiscordRestClient,
  interaction: APIApplicationCommandInteraction
): Promise<APIInteractionResponse> {
  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the reporting user.')
  }

  return featureModalResponse('')
}

async function updateFeatureLifecycleStatus(
  env: Env,
  client: DiscordRestClient,
  featureId: number,
  nextStatus: FeatureStatus,
  note?: string | null
): Promise<{ ok: true; featureId: number; previousStatus: FeatureStatus; nextStatus: FeatureStatus } | { ok: false; message: string }> {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature) {
    return { ok: false, message: 'Suggestion not found.' }
  }

  if (feature.status === nextStatus && (feature.status_note ?? null) === (note ?? null)) {
    return { ok: false, message: `Suggestion #${feature.id} is already ${feature.status}.` }
  }

  await updateFeatureStatus(env.DB, feature.id, nextStatus, { statusNote: note ?? null })
  await syncFeatureMessage(env, client, feature.id)
  const updated = await getFeatureById(env.DB, feature.id)
  if (updated) {
    await notifyFeatureFollowers(env, client, updated)
  }

  return { ok: true, featureId: feature.id, previousStatus: feature.status, nextStatus }
}

async function handleBugStatusCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (!isModeratorInteraction(interaction, env)) {
    return ephemeralMessage('You are not allowed to update bug statuses.')
  }

  const parsed = bugStatusCommandSchema.safeParse({
    bugId: getCommandOptionInteger(interaction, 'bug_id') ?? 0,
    status: getCommandOptionString(interaction, 'status') ?? '',
    note: getCommandOptionString(interaction, 'note')?.trim() || null
  })

  if (!parsed.success) {
    return ephemeralMessage('Invalid bug status command.')
  }

  const result = await updateBugLifecycleStatus(env.DB, parsed.data.bugId, parsed.data.status, { note: parsed.data.note ?? null })
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  const bug = await getBugById(env.DB, result.bugId)
  if (bug) {
    await notifyBugFollowers(env, client, bug)
  }

  return ephemeralMessage(`Bug #${result.bugId} is now ${result.nextStatus}.`)
}

async function handleFeatureStatusCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (!isModeratorInteraction(interaction, env)) {
    return ephemeralMessage('You are not allowed to update suggestion statuses.')
  }

  const parsed = featureStatusCommandSchema.safeParse({
    featureId: getCommandOptionInteger(interaction, 'feature_id') ?? 0,
    status: getCommandOptionString(interaction, 'status') ?? '',
    note: getCommandOptionString(interaction, 'note')?.trim() || null
  })

  if (!parsed.success) {
    return ephemeralMessage('Invalid suggestion status command.')
  }

  const result = await updateFeatureLifecycleStatus(env, client, parsed.data.featureId, parsed.data.status, parsed.data.note ?? null)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  return ephemeralMessage(`Suggestion #${result.featureId} is now ${result.nextStatus}.`)
}

async function handleBugLinkCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (!isModeratorInteraction(interaction, env)) {
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
  return ephemeralMessage(`Linked bug #${result.bugId} to bug #${result.targetBugId} as a regression.`)
}

async function handleMessageCommand(env: Env, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the acting user.')
  }

  const target = getMessageCommandTarget(interaction)
  if (!target) {
    return ephemeralMessage('Unable to load that message.')
  }

  const guildId = getInteractionGuildId(interaction)
  const channelId = getInteractionChannelId(interaction)

  if (interaction.data.name === 'Report Message as Bug') {
    await createBugPreflightSession(env.DB, {
      sessionId: interaction.id,
      userId,
      title: target.content,
      titleNormalized: normalizeBugTitle(deriveTitleFromDescription(target.content)),
      platform: null,
      severity: null,
      screenshotUrl: target.attachmentUrl,
      sourceGuildId: guildId,
      sourceChannelId: channelId,
      sourceMessageId: target.messageId
    })

    return bugModalResponse({
      sessionId: interaction.id,
      initialDescription: target.content,
      relationshipType: null,
      targetBugId: null
    })
  }

  return featureModalResponse(target.content, {
    sourceGuildId: guildId,
    sourceChannelId: channelId,
    sourceMessageId: target.messageId
  })
}

async function handleCommand(env: Env, client: DiscordRestClient, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
  if (isMessageCommandInteraction(interaction)) {
    return handleMessageCommand(env, interaction)
  }

  const path = getCommandPath(interaction)

  if (path[0] === 'bug') {
    return handleBugReportCommand(env, client, interaction)
  }

  if (path[0] === 'bugs') {
    if (path[1] === 'top') {
      return topBugsResponse(await listBugs(env.DB, 'open', 'top', { limit: 5 }))
    }

    if (path[1] === 'mine') {
      const userId = getInteractionUserId(interaction)
      if (!userId) return ephemeralMessage('Unable to determine the acting user.')
      return myItemsResponse('bug', await listBugs(env.DB, 'all', 'newest', { reporterId: userId, limit: 5 }))
    }

    if (path[1] === 'status') {
      return handleBugStatusCommand(env, client, interaction)
    }

    if (path[1] === 'link') {
      return handleBugLinkCommand(env, client, interaction)
    }

    return ephemeralMessage('Unknown command.')
  }

  if (path[0] === 'suggestion') {
    return handleFeatureReportCommand(env, client, interaction)
  }

  if (path[0] === 'suggestions' || path[0] === 'feedback') {
    if (path[1] === 'top') {
      return myItemsResponse('suggestion', await listFeatures(env.DB, { status: 'active', sort: 'top', limit: 5 }))
    }

    if (path[1] === 'mine') {
      const userId = getInteractionUserId(interaction)
      if (!userId) return ephemeralMessage('Unable to determine the acting user.')
      return myItemsResponse('suggestion', await listFeatures(env.DB, { status: 'all', sort: 'newest', reporterId: userId, limit: 5 }))
    }

    if (path[1] === 'status') {
      return handleFeatureStatusCommand(env, client, interaction)
    }

    return ephemeralMessage('Unknown command.')
  }

  return ephemeralMessage('Unknown command.')
}

function statusChoiceName(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function handleAutocomplete(env: Env, interaction: APIApplicationCommandAutocompleteInteraction): Promise<APIInteractionResponse> {
  const focused = getFocusedAutocompleteOption(interaction)
  if (!focused) {
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [] }
    }
  }

  const path = getCommandPath(interaction as unknown as APIApplicationCommandInteraction)
  const query = String(focused.value ?? '').trim()

  if (focused.name === 'status') {
    const statuses = path[0] === 'suggestions' || path[0] === 'feedback'
      ? ['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED', 'CLOSED']
      : ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE']

    const choices = statuses
      .filter((status) => !query || status.includes(query.toUpperCase()))
      .slice(0, 25)
      .map((status) => ({ name: statusChoiceName(status), value: status }))

    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices }
    }
  }

  if (focused.name === 'feature_id' || focused.name.startsWith('feature_')) {
    const choices = await searchFeatures(env.DB, query || ' ', 8)
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices: choices.map((feature) => ({
          name: `#${feature.id} ${feature.title}`.slice(0, 100),
          value: feature.id
        }))
      }
    }
  }

  if (focused.name === 'bug_id' || focused.name === 'target_bug_id') {
    const choices = await searchBugs(env.DB, query || ' ', 8)
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices: choices.map((bug) => ({
          name: `#${bug.id} ${bug.title}`.slice(0, 100),
          value: bug.id
        }))
      }
    }
  }

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices: [] }
  }
}

async function handleModalSubmit(env: Env, client: DiscordRestClient, interaction: APIModalSubmitInteraction): Promise<APIInteractionResponse> {
  const featureModalState = parseFeatureModalCustomId(interaction.data.custom_id)
  if (featureModalState) {
    const parsed = featureSubmissionSchema.safeParse({
      ...getModalFieldValues(interaction, 'feature'),
      screenshot_url: getModalUploadedAttachmentUrl(interaction, FEATURE_MODAL_FIELDS.screenshot),
      source_guild_id: featureModalState.sourceGuildId,
      source_channel_id: featureModalState.sourceChannelId,
      source_message_id: featureModalState.sourceMessageId
    })

    if (!parsed.success) {
      return ephemeralMessage('Suggestion validation failed.')
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

  const modalValues = getModalFieldValues(interaction)
  if (typeof modalValues.description === 'string' && !modalValues.description.trim() && preflightSession?.title) {
    modalValues.description = preflightSession.title
  }

  const parsed = bugSubmissionSchema.safeParse({
    ...modalValues,
    platform: typeof modalValues.platform === 'string' && modalValues.platform.trim() ? modalValues.platform : null,
    severity: typeof modalValues.severity === 'string' && modalValues.severity.trim() ? modalValues.severity : null,
    screenshot_url: getModalUploadedAttachmentUrl(interaction, BUG_MODAL_FIELDS.screenshot),
    source_guild_id: preflightSession?.source_guild_id ?? null,
    source_channel_id: preflightSession?.source_channel_id ?? null,
    source_message_id: preflightSession?.source_message_id ?? null
  })

  if (!parsed.success) {
    return ephemeralMessage('Bug submission validation failed. Please add a description and keep it concise.')
  }

  if (!modalState.relationshipType && !modalState.targetBugId) {
    const derivedTitle = deriveTitleFromDescription(parsed.data.description)
    await createBugPreflightSession(env.DB, {
      sessionId: modalState.sessionId ?? interaction.id,
      userId,
      title: parsed.data.description,
      titleNormalized: normalizeBugTitle(derivedTitle),
      platform: parsed.data.platform,
      severity: parsed.data.severity,
      screenshotUrl: parsed.data.screenshot_url,
      sourceGuildId: preflightSession?.source_guild_id ?? null,
      sourceChannelId: preflightSession?.source_channel_id ?? null,
      sourceMessageId: preflightSession?.source_message_id ?? null
    })

    const matches = await findSimilarBugs(env.DB, derivedTitle)
    if (matches.duplicates.length > 0 || matches.regressions.length > 0) {
      return bugPreflightResponse(modalState.sessionId ?? interaction.id, derivedTitle, matches.duplicates, matches.regressions)
    }
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

    return createBugSubmissionResponse(
      env,
      client,
      userId,
      {
        platform: session.platform,
        severity: session.severity,
        description: session.title,
        screenshot_url: session.screenshot_url,
        source_guild_id: session.source_guild_id,
        source_channel_id: session.source_channel_id,
        source_message_id: session.source_message_id
      },
      {
        relationshipType: preflightAction.relationshipType,
        targetBugId: preflightAction.targetBugId
      }
    )
  }

  const duplicateSelection = parseDuplicateSelectionCustomId(interaction.data.custom_id)
  if (duplicateSelection) {
    const bug = await getBugById(env.DB, duplicateSelection.sourceBugId)
    if (!bug) {
      return ephemeralMessage('Bug not found.')
    }

    const authorized = bug.reporter_id === userId || isModeratorInteraction(interaction, env)
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

  const subscriptionAction = parseSubscriptionAction(interaction.data.custom_id)
  if (subscriptionAction) {
    const currentlySubscribed = await isSubscribed(env.DB, subscriptionAction.itemKind, subscriptionAction.itemId, userId)
    if (currentlySubscribed) {
      await removeSubscription(env.DB, subscriptionAction.itemKind, subscriptionAction.itemId, userId)
    } else {
      await addSubscription(env.DB, subscriptionAction.itemKind, subscriptionAction.itemId, userId)
    }

    if (subscriptionAction.itemKind === 'bug') {
      await syncBugMessage(env, client, subscriptionAction.itemId)
    } else {
      await syncFeatureMessage(env, client, subscriptionAction.itemId)
    }

    return ephemeralMessage(
      currentlySubscribed
        ? `You will no longer receive updates for ${subscriptionAction.itemKind === 'feature' ? 'suggestion' : 'bug'} #${subscriptionAction.itemId}.`
        : `You are now following ${subscriptionAction.itemKind === 'feature' ? 'suggestion' : 'bug'} #${subscriptionAction.itemId}.`
    )
  }

  const manageAction = parseManageAction(interaction.data.custom_id)
  if (manageAction) {
    if (!isModeratorInteraction(interaction, env)) {
      return ephemeralMessage('Only moderators can manage item status.')
    }

    if (manageAction.itemKind === 'bug') {
      const bug = await getBugById(env.DB, manageAction.itemId)
      return bug ? bugManageResponse(bug) : ephemeralMessage('Bug not found.')
    }

    const feature = await getFeatureById(env.DB, manageAction.itemId)
    return feature ? featureManageResponse(feature) : ephemeralMessage('Suggestion not found.')
  }

  const statusAction = parseStatusAction(interaction.data.custom_id)
  if (statusAction) {
    if (!isModeratorInteraction(interaction, env)) {
      return ephemeralMessage('Only moderators can update item status.')
    }

    if (statusAction.itemKind === 'bug') {
      const result = await updateBugLifecycleStatus(env.DB, statusAction.itemId, statusAction.status as BugStatus)
      if (!result.ok) {
        return ephemeralMessage(result.message)
      }

      await syncBugMessage(env, client, result.bugId)
      const bug = await getBugById(env.DB, result.bugId)
      if (bug) {
        await notifyBugFollowers(env, client, bug)
      }
      return ephemeralMessage(`Bug #${result.bugId} is now ${result.nextStatus}.`)
    }

    const result = await updateFeatureLifecycleStatus(env, client, statusAction.itemId, statusAction.status as FeatureStatus)
    return result.ok ? ephemeralMessage(`Suggestion #${result.featureId} is now ${result.nextStatus}.`) : ephemeralMessage(result.message)
  }

  const featureVote = parseFeatureUpvote(interaction.data.custom_id)
  if (featureVote) {
    const result = await upvoteFeature(env.DB, featureVote.featureId, userId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    await syncFeatureMessage(env, client, result.feature.id)
    return silentComponentAck()
  }

  const bugUpvoteId = interaction.data.custom_id?.startsWith('upvote:') ? Number(interaction.data.custom_id.slice('upvote:'.length)) : null
  if (typeof bugUpvoteId === 'number' && !Number.isNaN(bugUpvoteId) && bugUpvoteId > 0) {
    const result = await upvoteBug(env.DB, bugUpvoteId, userId)
    if (!result.ok) {
      return ephemeralMessage(result.message)
    }

    await syncBugMessage(env, client, result.bug.id)
    return silentComponentAck()
  }

  return ephemeralMessage('Unknown action.')
}

async function handleDashboardBugAction(env: Env, client: DiscordRestClient, bugId: number, action: string) {
  if (action === 'resolve') {
    const result = await updateBugLifecycleStatus(env.DB, bugId, 'FIXED')
    if (!result.ok) {
      return result
    }

    await syncBugMessage(env, client, result.bugId)
    const bug = await getBugById(env.DB, result.bugId)
    if (bug) {
      await notifyBugFollowers(env, client, bug)
    }
    return { ok: true as const }
  }

  if (action === 'open') {
    const result = await updateBugLifecycleStatus(env.DB, bugId, 'OPEN')
    if (!result.ok) {
      return result
    }

    await syncBugMessage(env, client, result.bugId)
    const bug = await getBugById(env.DB, result.bugId)
    if (bug) {
      await notifyBugFollowers(env, client, bug)
    }
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
    return { ok: false as const, message: 'Suggestion not found.' }
  }

  if (action === 'resolve') {
    await updateFeatureStatus(env.DB, featureId, 'CLOSED')
    await syncFeatureMessage(env, client, featureId)
    const updated = await getFeatureById(env.DB, featureId)
    if (updated) {
      await notifyFeatureFollowers(env, client, updated)
    }
    return { ok: true as const }
  }

  if (action === 'open') {
    await updateFeatureStatus(env.DB, featureId, 'OPEN')
    await syncFeatureMessage(env, client, featureId)
    const updated = await getFeatureById(env.DB, featureId)
    if (updated) {
      await notifyFeatureFollowers(env, client, updated)
    }
    return { ok: true as const }
  }

  if (action === 'delete') {
    await deleteFeature(env.DB, featureId)
    return { ok: true as const }
  }

  return { ok: false as const, message: 'Unsupported suggestion action.' }
}

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', (c) => c.json({ ok: true, service: 'daggerbrain-feedback' }))

  app.get('/auth/discord/start', async (c) => {
    if (!c.env.COOKIE_SECRET || !c.env.DISCORD_CLIENT_SECRET || !c.env.PUBLIC_APP_URL) {
      return c.text('Discord OAuth is not configured.', 501)
    }

    const state = await createSignedSessionToken(c.env.COOKIE_SECRET, {
      userId: crypto.randomUUID(),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    })

    return c.redirect(buildDiscordOauthUrl(c.env, state))
  })

  app.get('/auth/discord/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!c.env.COOKIE_SECRET || !code || !state) {
      return c.redirect('/dashboard')
    }

    const verifiedState = await verifySignedSessionToken(c.env.COOKIE_SECRET, state)
    if (!verifiedState) {
      return c.redirect('/dashboard')
    }

    try {
      const token = await exchangeOauthCode(c.env, code)
      const user = await fetchOauthUser(token.access_token)
      const sessionToken = await createSignedSessionToken(c.env.COOKIE_SECRET, {
        userId: user.id,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      })

      return responseWithCookie(c.redirect('/dashboard'), buildDashboardSessionCookie(sessionToken))
    } catch (error) {
      console.error('dashboard.oauth_callback_failed', error)
      return c.redirect('/dashboard')
    }
  })

  app.get('/auth/logout', (c) => responseWithCookie(c.redirect('/dashboard'), clearDashboardSessionCookie()))

  app.post('/commands/register', async (c) => {
    if (c.env.COMMANDS_REGISTER_SECRET) {
      const providedSecret = c.req.header('x-register-secret')
      if (providedSecret !== c.env.COMMANDS_REGISTER_SECRET) {
        return c.json({ ok: false }, 403)
      }
    }

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

  app.get('/api/features', async (c) => {
    const status = c.req.query('status') === 'resolved' ? 'resolved' : c.req.query('status') === 'all' ? 'all' : 'active'
    const sort = c.req.query('sort') === 'newest' ? 'newest' : 'top'
    return c.json({ features: await listFeatures(c.env.DB, { status, sort, limit: 50 }) })
  })

  app.get('/api/suggestions', async (c) => {
    const status = c.req.query('status') === 'resolved' ? 'resolved' : c.req.query('status') === 'all' ? 'all' : 'active'
    const sort = c.req.query('sort') === 'newest' ? 'newest' : 'top'
    return c.json({ suggestions: await listFeatures(c.env.DB, { status, sort, limit: 50 }) })
  })

  app.get('/dashboard', async (c) => {
    const bugFilter = getDashboardBugFilter(c.req.query('bugStatus'))
    const suggestionFilter = getDashboardSuggestionFilter(c.req.query('suggestionStatus') ?? c.req.query('feedbackStatus'))
    const client = new DiscordRestClient(c.env)
    const canManage = await canManageDashboard(c.env, client, c.req.header('Cookie') ?? null)

    const [rawBugs, rawFeatures] = await Promise.all([
      listBugs(c.env.DB, mapBugFilterToStatus(bugFilter), 'newest'),
      listFeatures(c.env.DB, { status: mapSuggestionFilterToStatus(suggestionFilter), sort: 'newest', limit: 200 })
    ])

    const bugs = rawBugs.map((bug) => ({
      ...bug,
      message_url: buildDiscordMessageUrl(c.env, bug.channel_id ?? null, bug.message_id ?? null),
      source_message_url:
        bug.source_guild_id && bug.source_channel_id && bug.source_message_id
          ? `https://discord.com/channels/${bug.source_guild_id}/${bug.source_channel_id}/${bug.source_message_id}`
          : null
    }))

    const features = rawFeatures.map((feature) => ({
      ...feature,
      message_url: buildDiscordMessageUrl(c.env, feature.channel_id ?? null, feature.message_id ?? null),
      source_message_url:
        feature.source_guild_id && feature.source_channel_id && feature.source_message_id
          ? `https://discord.com/channels/${feature.source_guild_id}/${feature.source_channel_id}/${feature.source_message_id}`
          : null
    }))

    return c.html(
      renderDashboardPage({
        bugs,
        features,
        currentBugFilter: bugFilter,
        currentSuggestionFilter: suggestionFilter,
        canManage,
        authUrl: c.env.COOKIE_SECRET && c.env.DISCORD_CLIENT_SECRET && c.env.PUBLIC_APP_URL ? '/auth/discord/start' : null,
        logoutUrl: canManage ? '/auth/logout' : null
      })
    )
  })

  app.post('/dashboard/actions', async (c) => {
    const client = new DiscordRestClient(c.env)
    const authorized = await canManageDashboard(c.env, client, c.req.header('Cookie') ?? null)
    if (!authorized) {
      return c.text('Unauthorized', 401)
    }

    const formData = await c.req.formData()
    const kind = String(formData.get('kind') ?? '')
    const action = String(formData.get('action') ?? '')
    const id = Number(formData.get('id') ?? 0)
    const bugFilter = getDashboardBugFilter(String(formData.get('bugStatus') ?? 'all'))
    const suggestionFilter = getDashboardSuggestionFilter(
      String(formData.get('suggestionStatus') ?? formData.get('feedbackStatus') ?? 'all')
    )

    if (!Number.isInteger(id) || id <= 0) {
      return c.redirect(buildDashboardUrl(bugFilter, suggestionFilter))
    }

    const result =
      kind === 'bug'
        ? await handleDashboardBugAction(c.env, client, id, action)
        : kind === 'feedback' || kind === 'suggestion'
          ? await handleDashboardFeedbackAction(c.env, client, id, action)
          : { ok: false as const, message: 'Unsupported dashboard action.' }

    if (!result.ok) {
      console.error('dashboard.action_failed', { kind, action, id, message: result.message })
    }

    return c.redirect(buildDashboardUrl(bugFilter, suggestionFilter))
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

    if (isAutocompleteInteraction(interaction)) {
      return c.json(await handleAutocomplete(c.env, interaction as APIApplicationCommandAutocompleteInteraction))
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
