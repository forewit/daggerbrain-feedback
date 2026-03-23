import { Hono } from 'hono'
import { ChannelType, InteractionResponseType, type APIApplicationCommandAutocompleteInteraction, type APIApplicationCommandInteraction, type APIInteractionResponse, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS } from './constants'
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
import { getGuildFeedbackSettings, upsertGuildFeedbackSettings } from './db/guild-settings'
import { addSubscription, isSubscribed, listSubscribedItemIds, removeSubscription } from './db/subscriptions'
import { createBugFromSubmission } from './feedback/create-bug'
import { createFeatureFromSubmission } from './feedback/create-feature'
import { deriveTitleFromDescription } from './feedback/derive-title'
import { linkBugAsDuplicate, linkBugAsRegression } from './feedback/link-duplicate'
import { updateBugLifecycleStatus } from './feedback/update-status'
import { upvoteBug, upvoteFeature } from './feedback/upvote'
import {
  buildDashboardGuildSelectionCookie,
  buildDashboardSessionCookie,
  buildDiscordOauthUrl,
  clearDashboardGuildSelectionCookie,
  clearDashboardSessionCookie,
  createSignedSessionToken,
  exchangeOauthCode,
  fetchOauthGuilds,
  fetchOauthUser,
  getCookieValue,
  verifySignedSessionToken,
  type DashboardGuildSelectionPayload,
  type DashboardSessionPayload,
  type DiscordOauthGuild
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
  hasDashboardManagePermission,
  hasGuildConfigurationPermission,
  hasManageMessagesPermission,
  isApplicationCommandInteraction,
  isAutocompleteInteraction,
  isMessageCommandInteraction,
  isMessageComponentInteraction,
  isModalSubmitInteraction,
  isPingInteraction,
  parseBugModalCustomId,
  parseDiscordInteraction,
  parseDeleteAction,
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
  getFeatureSubmissionValues,
  getModalUploadedAttachmentUrl
} from './discord/interactions'
import {
  bugManageResponse,
  bugModalResponse,
  bugPreflightResponse,
  duplicateSelectionResponse,
  ephemeralMessage,
  ephemeralRichMessage,
  featureManageResponse,
  itemLinkButtonRows,
  linkedItemKeyText,
  featureModalResponse,
  myItemsResponse,
  silentComponentAck,
  topBugsResponse
} from './discord/messages'
import {
  formatBugStatusNotification,
  formatFeatureStatusNotification,
  notifyBugFollowers,
  notifyFeatureFollowers
} from './discord/notifications'
import {
  createBugReportMessage,
  createFeatureReportMessage,
  deleteBugDiscordArtifacts,
  deleteFeatureDiscordArtifacts,
  getCreateMessageFailureMessage,
  logDiscordApiError,
  resolveBugReportCardUrl,
  resolveFeatureReportCardUrl,
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
import { renderDashboardPage, renderGuildSelectionPage } from './ui/dashboard'

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

function isSupportedFeedbackChannelType(channelType: number): boolean {
  return channelType === ChannelType.GuildText
    || channelType === ChannelType.GuildAnnouncement
    || channelType === ChannelType.GuildForum
    || channelType === ChannelType.GuildMedia
}

function formatConfiguredChannel(channelId: string | null, source: 'guild' | 'default' | 'unset'): string {
  if (!channelId) {
    return 'Not configured'
  }

  if (source === 'guild') {
    return `<#${channelId}> (server setting)`
  }

  if (source === 'default') {
    return `<#${channelId}> (default fallback)`
  }

  return `<#${channelId}>`
}

async function validateFeedbackChannelSelection(
  client: DiscordRestClient,
  guildId: string,
  channelId: string,
  kind: 'bug' | 'feature'
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const channel = await client.getChannel(channelId)
    if (channel.guild_id !== guildId) {
      return { ok: false, message: `The selected ${kind === 'bug' ? 'bug' : 'suggestion'} channel must belong to this server.` }
    }

    if (!isSupportedFeedbackChannelType(channel.type)) {
      return {
        ok: false,
        message: `The selected ${kind === 'bug' ? 'bug' : 'suggestion'} channel must be a text, announcement, forum, or media channel.`
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      message: `I couldn't access that ${kind === 'bug' ? 'bug' : 'suggestion'} channel. Please make sure the bot can view it.`
    }
  }
}

async function buildFeedbackConfigResponse(env: Env, guildId: string): Promise<APIInteractionResponse> {
  const settings = await getGuildFeedbackSettings(env.DB, guildId)
  const bugChannelId = settings?.bug_report_channel_id ?? env.BUG_REPORT_CHANNEL_ID ?? null
  const featureChannelId = settings?.feature_channel_id ?? env.FEATURE_CHANNEL_ID ?? null
  const bugSource = settings?.bug_report_channel_id ? 'guild' : env.BUG_REPORT_CHANNEL_ID ? 'default' : 'unset'
  const featureSource = settings?.feature_channel_id ? 'guild' : env.FEATURE_CHANNEL_ID ? 'default' : 'unset'

  return ephemeralRichMessage([
    'Channel configuration:',
    `Bug reports: ${formatConfiguredChannel(bugChannelId, bugSource)}`,
    `Suggestions: ${formatConfiguredChannel(featureChannelId, featureSource)}`
  ].join('\n'))
}

function responseWithCookie(response: Response, cookieValue: string): Response {
  response.headers.append('Set-Cookie', cookieValue)
  return response
}

function responseWithCookies(response: Response, cookieValues: string[]): Response {
  for (const cookieValue of cookieValues) {
    response.headers.append('Set-Cookie', cookieValue)
  }

  return response
}

async function getDashboardSession(env: Env, cookieHeader: string | null): Promise<DashboardSessionPayload | null> {
  if (!env.COOKIE_SECRET) {
    return null
  }

  const token = getCookieValue(cookieHeader, 'dashboard_session')
  return verifySignedSessionToken<DashboardSessionPayload>(env.COOKIE_SECRET, token)
}

async function getDashboardGuildSelectionSession(
  env: Env,
  cookieHeader: string | null
): Promise<DashboardGuildSelectionPayload | null> {
  if (!env.COOKIE_SECRET) {
    return null
  }

  const token = getCookieValue(cookieHeader, 'dashboard_guild_selection')
  return verifySignedSessionToken<DashboardGuildSelectionPayload>(env.COOKIE_SECRET, token)
}

function isDashboardAuthConfigured(env: Env): boolean {
  return Boolean(env.COOKIE_SECRET && env.DISCORD_CLIENT_SECRET && env.PUBLIC_APP_URL)
}

async function getDashboardAccessContext(
  env: Env,
  cookieHeader: string | null
): Promise<{ session: DashboardSessionPayload | null; viewerId: string | null; guildId: string | null; guildName: string | null; canManage: boolean; authConfigured: boolean }> {
  const session = await getDashboardSession(env, cookieHeader)
  const authConfigured = isDashboardAuthConfigured(env)

  if (!session) {
    return {
      session: null,
      viewerId: null,
      guildId: null,
      guildName: null,
      canManage: false,
      authConfigured
    }
  }

  if (!session.guildId || !session.guildName || !session.guildPermissions) {
    return {
      session: null,
      viewerId: null,
      guildId: null,
      guildName: null,
      canManage: false,
      authConfigured
    }
  }

  return {
    session,
    viewerId: session.userId,
    guildId: session.guildId,
    guildName: session.guildName,
    canManage: hasDashboardManagePermission(session.guildPermissions),
    authConfigured
  }
}

function createDashboardSessionPayload(
  userId: string,
  guild: DiscordOauthGuild,
  now = Date.now()
): DashboardSessionPayload {
  return {
    userId,
    guildId: guild.id,
    guildName: guild.name,
    guildPermissions: guild.permissions,
    issuedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000
  }
}

function createGuildSelectionPayload(
  userId: string,
  guilds: DiscordOauthGuild[],
  now = Date.now()
): DashboardGuildSelectionPayload {
  return {
    userId,
    guilds,
    issuedAt: now,
    expiresAt: now + 10 * 60 * 1000
  }
}

function findSelectedGuild(guilds: DiscordOauthGuild[], guildId: string): DiscordOauthGuild | null {
  return guilds.find((guild) => guild.id === guildId) ?? null
}

function buildDashboardAuthRedirect(access: { authConfigured: boolean }): string {
  return access.authConfigured ? '/auth/discord/start' : '/dashboard'
}

async function getAuthorizedBugForDashboard(env: Env, bugId: number, guildId: string) {
  const bug = await getBugById(env.DB, bugId)
  if (!bug || bug.source_guild_id !== guildId) {
    return null
  }

  return bug
}

async function getAuthorizedFeatureForDashboard(env: Env, featureId: number, guildId: string) {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature || feature.source_guild_id !== guildId) {
    return null
  }

  return feature
}

function buildCreatedMessage(kind: 'bug' | 'feature', id: number, messageUrl: string | null): string {
  return `${linkedItemKeyText(kind, id, messageUrl)} is live.`
}

async function resolveBugMessageUrl(env: Env, client: DiscordRestClient, bug: {
  id: number
  channel_id?: string | null
  message_id?: string | null
  source_guild_id?: string | null
}): Promise<string | null> {
  return resolveBugReportCardUrl(env, client, {
    id: bug.id,
    channel_id: bug.channel_id ?? null,
    message_id: bug.message_id ?? null,
    source_guild_id: bug.source_guild_id ?? null
  })
}

async function resolveFeatureMessageUrl(
  env: Env,
  client: DiscordRestClient,
  feature: { channel_id?: string | null; message_id?: string | null; source_guild_id?: string | null }
): Promise<string | null> {
  return resolveFeatureReportCardUrl(env, client, {
    channel_id: feature.channel_id ?? null,
    message_id: feature.message_id ?? null,
    source_guild_id: feature.source_guild_id ?? null
  })
}

function buildStatusMessage(kind: 'bug' | 'feature', id: number, status: string, messageUrl: string | null): string {
  return `${linkedItemKeyText(kind, id, messageUrl)} is now ${status}.`
}

function buildAlreadyStatusMessage(kind: 'bug' | 'feature', id: number, status: string, messageUrl: string | null): string {
  return `${linkedItemKeyText(kind, id, messageUrl)} is already ${status}.`
}

function buildLinkedBugRelationMessage(bugId: number, bugUrl: string | null, targetBugId: number, targetBugUrl: string | null, relation: string): string {
  return `Linked ${linkedItemKeyText('bug', bugId, bugUrl, { capitalizeKind: false })} to ${linkedItemKeyText('bug', targetBugId, targetBugUrl, {
    capitalizeKind: false
  })} as ${relation}.`
}

function buildFollowMessage(kind: 'bug' | 'feature', id: number, messageUrl: string | null, following: boolean): string {
  const item = linkedItemKeyText(kind, id, messageUrl, { capitalizeKind: false })
  return following ? `You are now following ${item}.` : `You will no longer receive updates for ${item}.`
}

function buildItemLinkRows(kind: 'bug' | 'feature', id: number, messageUrl: string | null) {
  return itemLinkButtonRows([{ kind, id, url: messageUrl }])
}

function buildBugRelationLinkRows(
  bugId: number,
  bugUrl: string | null,
  targetBugId: number,
  targetBugUrl: string | null
) {
  return itemLinkButtonRows([
    { kind: 'bug', id: bugId, url: bugUrl },
    { kind: 'bug', id: targetBugId, url: targetBugUrl }
  ])
}

function summarizeResponseLinkRows(rows: unknown[]): Array<{ labels: Array<string | null>; urls: Array<string | null> }> {
  return rows
    .filter(
      (row): row is { components?: Array<{ label?: string; url?: string }> } =>
        row !== null && typeof row === 'object' && 'components' in row
    )
    .map((row) => ({
      labels: (row.components ?? []).map((component) => component.label ?? null),
      urls: (row.components ?? []).map((component) => component.url ?? null)
    }))
}

function logInteractionResponseDebug(
  event: string,
  content: string,
  rows: unknown[],
  metadata?: Record<string, unknown>
): void {
  console.log(event, {
    content,
    linkRows: summarizeResponseLinkRows(rows),
    ...(metadata ?? {})
  })
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

  try {
    const message = await createFeatureReportMessage(env, client, result.feature)
    await setFeatureMessageMetadata(env.DB, result.feature.id, message.channel_id, message.id)
    const messageUrl = await resolveFeatureReportCardUrl(env, client, {
      channel_id: message.channel_id,
      message_id: message.id,
      source_guild_id: input.source_guild_id ?? null
    })
    const content = buildCreatedMessage('feature', result.feature.id, messageUrl)
    const rows = buildItemLinkRows('feature', result.feature.id, messageUrl)
    logInteractionResponseDebug('discord.interaction_feature_created', content, rows, { featureId: result.feature.id, messageUrl })
    return ephemeralRichMessage(content, rows)
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

  if (options?.relationshipType === 'DUPLICATE_OF' && result.targetBug) {
    await syncBugMessage(env, client, result.targetBug.id)
    const content = buildCreatedMessage('bug', result.bug.id, null)
    logInteractionResponseDebug('discord.interaction_bug_created_duplicate', content, [], { bugId: result.bug.id })
    return ephemeralRichMessage(content)
  }

  try {
    const message = await createBugReportMessage(env, client, result.bug)
    await setBugMessageMetadata(env.DB, result.bug.id, message.channel_id, message.id)

    if (options?.relationshipType === 'REGRESSION_OF' && result.targetBug) {
      await syncBugMessage(env, client, result.targetBug.id)
    }

    const messageUrl = await resolveBugReportCardUrl(env, client, {
      id: result.bug.id,
      channel_id: message.channel_id,
      message_id: message.id,
      source_guild_id: input.source_guild_id ?? null
    })
    const content = buildCreatedMessage('bug', result.bug.id, messageUrl)
    const rows = buildItemLinkRows('bug', result.bug.id, messageUrl)
    logInteractionResponseDebug('discord.interaction_bug_created', content, rows, { bugId: result.bug.id, messageUrl })
    return ephemeralRichMessage(content, rows)
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

  await createBugPreflightSession(env.DB, {
    sessionId: interaction.id,
    userId,
    title: '',
    titleNormalized: '',
    platform: null,
    severity: null,
    screenshotUrl: null,
    sourceGuildId: getInteractionGuildId(interaction),
    sourceChannelId: getInteractionChannelId(interaction),
    sourceMessageId: null
  })

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

  return featureModalResponse('', {
    sourceGuildId: getInteractionGuildId(interaction),
    sourceChannelId: getInteractionChannelId(interaction),
    sourceMessageId: null
  })
}

async function handleFeedbackConfigCommand(
  env: Env,
  client: DiscordRestClient,
  interaction: APIApplicationCommandInteraction
): Promise<APIInteractionResponse> {
  const guildId = getInteractionGuildId(interaction)
  if (!guildId) {
    return ephemeralMessage('This command can only be used inside a server.')
  }

  if (!hasGuildConfigurationPermission(interaction.member?.permissions)) {
    return ephemeralMessage('You need Manage Server or Manage Channels permission to configure bug and suggestion channels.')
  }

  const path = getCommandPath(interaction)
  if (path[1] === 'show') {
    return buildFeedbackConfigResponse(env, guildId)
  }

  if (path[1] !== 'set') {
    return ephemeralMessage('Unknown command.')
  }

  const selectedBugChannelId = getCommandOptionString(interaction, 'bug_channel')
  const selectedFeatureChannelId = getCommandOptionString(interaction, 'suggestion_channel')
  if (!selectedBugChannelId && !selectedFeatureChannelId) {
    return ephemeralMessage('Select at least one channel to update.')
  }

  if (selectedBugChannelId) {
    const validation = await validateFeedbackChannelSelection(client, guildId, selectedBugChannelId, 'bug')
    if (!validation.ok) {
      return ephemeralMessage(validation.message)
    }
  }

  if (selectedFeatureChannelId) {
    const validation = await validateFeedbackChannelSelection(client, guildId, selectedFeatureChannelId, 'feature')
    if (!validation.ok) {
      return ephemeralMessage(validation.message)
    }
  }

  const current = await getGuildFeedbackSettings(env.DB, guildId)
  await upsertGuildFeedbackSettings(env.DB, guildId, {
    bugReportChannelId: selectedBugChannelId ?? current?.bug_report_channel_id ?? null,
    featureChannelId: selectedFeatureChannelId ?? current?.feature_channel_id ?? null
  })

  return buildFeedbackConfigResponse(env, guildId)
}

async function updateFeatureLifecycleStatus(
  env: Env,
  client: DiscordRestClient,
  featureId: number,
  nextStatus: FeatureStatus,
  note?: string | null
): Promise<
  | { ok: true; featureId: number; previousStatus: FeatureStatus; nextStatus: FeatureStatus; feature: NonNullable<Awaited<ReturnType<typeof getFeatureById>>> }
  | { ok: false; message: string; feature?: NonNullable<Awaited<ReturnType<typeof getFeatureById>>> }
> {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature) {
    return { ok: false, message: 'Suggestion not found.' }
  }

  if (feature.status === nextStatus && (feature.status_note ?? null) === (note ?? null)) {
    return { ok: false, message: `Suggestion #${feature.id} is already ${feature.status}.`, feature }
  }

  await updateFeatureStatus(env.DB, feature.id, nextStatus, { statusNote: note ?? null })
  await syncFeatureMessage(env, client, feature.id)
  const updated = await getFeatureById(env.DB, feature.id)
  if (updated) {
    await notifyFeatureFollowers(env, client, updated)
    return { ok: true, featureId: feature.id, previousStatus: feature.status, nextStatus, feature: updated }
  }

  return { ok: true, featureId: feature.id, previousStatus: feature.status, nextStatus, feature }
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
    if (result.bugId) {
      const bug = await getBugById(env.DB, result.bugId)
      if (bug) {
        const bugUrl = await resolveBugMessageUrl(env, client, bug)
        const content = buildAlreadyStatusMessage('bug', bug.id, bug.status, bugUrl)
        const rows = buildItemLinkRows('bug', bug.id, bugUrl)
        logInteractionResponseDebug('discord.interaction_bug_status_already', content, rows, { bugId: bug.id, bugUrl })
        return ephemeralRichMessage(content, rows)
      }
    }

    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  const bug = await getBugById(env.DB, result.bugId)
  if (bug) {
    await notifyBugFollowers(env, client, bug)
    const bugUrl = await resolveBugMessageUrl(env, client, bug)
    const content = formatBugStatusNotification(bug, bugUrl)
    const rows = buildItemLinkRows('bug', bug.id, bugUrl)
    logInteractionResponseDebug('discord.interaction_bug_status_updated', content, rows, { bugId: bug.id, bugUrl })
    return ephemeralRichMessage(content, rows)
  }

  return ephemeralRichMessage(buildStatusMessage('bug', result.bugId, result.nextStatus, null))
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
    if ('feature' in result && result.feature) {
      const featureUrl = await resolveFeatureMessageUrl(env, client, result.feature)
      const content = buildAlreadyStatusMessage('feature', result.feature.id, result.feature.status, featureUrl)
      const rows = buildItemLinkRows('feature', result.feature.id, featureUrl)
      logInteractionResponseDebug('discord.interaction_feature_status_already', content, rows, {
        featureId: result.feature.id,
        featureUrl
      })
      return ephemeralRichMessage(
        content,
        rows
      )
    }

    return ephemeralMessage(result.message)
  }

  const featureUrl = await resolveFeatureMessageUrl(env, client, result.feature)
  const featureStatusContent = formatFeatureStatusNotification(result.feature, featureUrl)
  const featureStatusRows = buildItemLinkRows('feature', result.featureId, featureUrl)
  logInteractionResponseDebug('discord.interaction_feature_status_updated', featureStatusContent, featureStatusRows, {
    featureId: result.featureId,
    featureUrl
  })
  return ephemeralRichMessage(featureStatusContent, featureStatusRows)
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
    const [bug, targetBug] = await Promise.all([getBugById(env.DB, result.bugId), getBugById(env.DB, result.targetBugId)])
    const [bugUrl, targetBugUrl] = await Promise.all([
      bug ? resolveBugMessageUrl(env, client, bug) : Promise.resolve(null),
      targetBug ? resolveBugMessageUrl(env, client, targetBug) : Promise.resolve(null)
    ])
    return ephemeralRichMessage(
      buildLinkedBugRelationMessage(result.bugId, bugUrl, result.targetBugId, targetBugUrl, 'a duplicate'),
      buildBugRelationLinkRows(result.bugId, bugUrl, result.targetBugId, targetBugUrl)
    )
  }

  const result = await linkBugAsRegression(env.DB, parsed.data.bugId, parsed.data.targetBugId)
  if (!result.ok) {
    return ephemeralMessage(result.message)
  }

  await syncBugMessage(env, client, result.bugId)
  await syncBugMessage(env, client, result.targetBugId)
  const [bug, targetBug] = await Promise.all([getBugById(env.DB, result.bugId), getBugById(env.DB, result.targetBugId)])
  const [bugUrl, targetBugUrl] = await Promise.all([
    bug ? resolveBugMessageUrl(env, client, bug) : Promise.resolve(null),
    targetBug ? resolveBugMessageUrl(env, client, targetBug) : Promise.resolve(null)
  ])
  return ephemeralRichMessage(
    buildLinkedBugRelationMessage(result.bugId, bugUrl, result.targetBugId, targetBugUrl, 'a regression'),
    buildBugRelationLinkRows(result.bugId, bugUrl, result.targetBugId, targetBugUrl)
  )
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
      const bugs = await listBugs(env.DB, 'open', 'top', { limit: 5 })
      return topBugsResponse(
        await Promise.all(bugs.map(async (bug) => ({
          ...bug,
          message_url: await resolveBugMessageUrl(env, client, bug)
        })))
      )
    }

    if (path[1] === 'mine') {
      const userId = getInteractionUserId(interaction)
      if (!userId) return ephemeralMessage('Unable to determine the acting user.')
      const bugs = await listBugs(env.DB, 'all', 'newest', { reporterId: userId, limit: 5 })
      return myItemsResponse(
        'bug',
        await Promise.all(bugs.map(async (bug) => ({
          ...bug,
          message_url: await resolveBugMessageUrl(env, client, bug)
        })))
      )
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

  if (path[0] === 'config') {
    return handleFeedbackConfigCommand(env, client, interaction)
  }

  if (path[0] === 'suggestions' || path[0] === 'feedback') {
    if (path[1] === 'top') {
      const features = await listFeatures(env.DB, { status: 'active', sort: 'top', limit: 5 })
      return myItemsResponse(
        'suggestion',
        await Promise.all(features.map(async (feature) => ({
          ...feature,
          message_url: await resolveFeatureMessageUrl(env, client, feature)
        })))
      )
    }

    if (path[1] === 'mine') {
      const userId = getInteractionUserId(interaction)
      if (!userId) return ephemeralMessage('Unable to determine the acting user.')
      const features = await listFeatures(env.DB, { status: 'all', sort: 'newest', reporterId: userId, limit: 5 })
      return myItemsResponse(
        'suggestion',
        await Promise.all(features.map(async (feature) => ({
          ...feature,
          message_url: await resolveFeatureMessageUrl(env, client, feature)
        })))
      )
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
      ...getFeatureSubmissionValues(interaction),
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
      const [duplicates, regressions] = await Promise.all([
        Promise.all(matches.duplicates.map(async (bug) => ({ ...bug, message_url: await resolveBugMessageUrl(env, client, bug) }))),
        Promise.all(matches.regressions.map(async (bug) => ({ ...bug, message_url: await resolveBugMessageUrl(env, client, bug) })))
      ])
      return bugPreflightResponse(
        modalState.sessionId ?? interaction.id,
        derivedTitle,
        duplicates,
        regressions
      )
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

    if (subscriptionAction.itemKind === 'bug') {
      const bug = await getBugById(env.DB, subscriptionAction.itemId)
      const bugUrl = bug ? await resolveBugMessageUrl(env, client, bug) : null
      const content = buildFollowMessage('bug', subscriptionAction.itemId, bugUrl, !currentlySubscribed)
      const rows = buildItemLinkRows('bug', subscriptionAction.itemId, bugUrl)
      logInteractionResponseDebug('discord.interaction_bug_follow_updated', content, rows, {
        bugId: subscriptionAction.itemId,
        bugUrl,
        following: !currentlySubscribed
      })
      return ephemeralRichMessage(
        content,
        rows
      )
    }

    const feature = await getFeatureById(env.DB, subscriptionAction.itemId)
    const featureUrl = feature ? await resolveFeatureMessageUrl(env, client, feature) : null
    const featureFollowContent = buildFollowMessage('feature', subscriptionAction.itemId, featureUrl, !currentlySubscribed)
    const featureFollowRows = buildItemLinkRows('feature', subscriptionAction.itemId, featureUrl)
    logInteractionResponseDebug('discord.interaction_feature_follow_updated', featureFollowContent, featureFollowRows, {
      featureId: subscriptionAction.itemId,
      featureUrl,
      following: !currentlySubscribed
    })
    return ephemeralRichMessage(
      featureFollowContent,
      featureFollowRows
    )
  }

  const manageAction = parseManageAction(interaction.data.custom_id)
  if (manageAction) {
    if (!isModeratorInteraction(interaction, env)) {
      return ephemeralMessage('Only moderators can manage item status.')
    }

    if (manageAction.itemKind === 'bug') {
      const bug = await getBugById(env.DB, manageAction.itemId)
      return bug ? bugManageResponse(bug, await resolveBugMessageUrl(env, client, bug)) : ephemeralMessage('Bug not found.')
    }

    const feature = await getFeatureById(env.DB, manageAction.itemId)
    return feature ? featureManageResponse(feature, await resolveFeatureMessageUrl(env, client, feature)) : ephemeralMessage('Suggestion not found.')
  }

  const statusAction = parseStatusAction(interaction.data.custom_id)
  if (statusAction) {
    if (!isModeratorInteraction(interaction, env)) {
      return ephemeralMessage('Only moderators can update item status.')
    }

    if (statusAction.itemKind === 'bug') {
      const result = await updateBugLifecycleStatus(env.DB, statusAction.itemId, statusAction.status as BugStatus)
      if (!result.ok) {
        if (result.bugId) {
          const bug = await getBugById(env.DB, result.bugId)
          if (bug) {
            const bugUrl = await resolveBugMessageUrl(env, client, bug)
            const content = buildAlreadyStatusMessage('bug', bug.id, bug.status, bugUrl)
            const rows = buildItemLinkRows('bug', bug.id, bugUrl)
            logInteractionResponseDebug('discord.component_bug_status_already', content, rows, { bugId: bug.id, bugUrl })
            return ephemeralRichMessage(content, rows)
          }
        }

        return ephemeralMessage(result.message)
      }

      await syncBugMessage(env, client, result.bugId)
      const bug = await getBugById(env.DB, result.bugId)
      if (bug) {
        await notifyBugFollowers(env, client, bug)
        const bugUrl = await resolveBugMessageUrl(env, client, bug)
        const content = formatBugStatusNotification(bug, bugUrl)
        const rows = buildItemLinkRows('bug', bug.id, bugUrl)
        logInteractionResponseDebug('discord.component_bug_status_updated', content, rows, { bugId: bug.id, bugUrl })
        return ephemeralRichMessage(content, rows)
      }
      return ephemeralRichMessage(buildStatusMessage('bug', result.bugId, result.nextStatus, null))
    }

    const result = await updateFeatureLifecycleStatus(env, client, statusAction.itemId, statusAction.status as FeatureStatus)
    if (!result.ok) {
      if (result.feature) {
        const featureUrl = await resolveFeatureMessageUrl(env, client, result.feature)
        const content = buildAlreadyStatusMessage('feature', result.feature.id, result.feature.status, featureUrl)
        const rows = buildItemLinkRows('feature', result.feature.id, featureUrl)
        logInteractionResponseDebug('discord.component_feature_status_already', content, rows, {
          featureId: result.feature.id,
          featureUrl
        })
        return ephemeralRichMessage(
          content,
          rows
        )
      }

      return ephemeralMessage(result.message)
    }

    const featureUrl2 = await resolveFeatureMessageUrl(env, client, result.feature)
    const featureStatusContent2 = formatFeatureStatusNotification(result.feature, featureUrl2)
    const featureStatusRows2 = buildItemLinkRows('feature', result.featureId, featureUrl2)
    logInteractionResponseDebug('discord.component_feature_status_updated', featureStatusContent2, featureStatusRows2, {
      featureId: result.featureId,
      featureUrl: featureUrl2
    })
    return ephemeralRichMessage(
      featureStatusContent2,
      featureStatusRows2
    )
  }

  const deleteAction = parseDeleteAction(interaction.data.custom_id)
  if (deleteAction) {
    if (!isModeratorInteraction(interaction, env)) {
      return ephemeralMessage('Only moderators can delete bugs or suggestions.')
    }

    if (deleteAction.itemKind === 'bug') {
      const bug = await getBugById(env.DB, deleteAction.itemId)
      if (!bug) {
        return ephemeralMessage('Bug not found.')
      }

      try {
        await deleteBugDiscordArtifacts(client, bug)
      } catch (error) {
        logDiscordApiError('discord.component_bug_delete_failed', error, { bugId: bug.id })
        return ephemeralMessage('Failed to delete the bug messages from Discord.')
      }

      await deleteBug(env.DB, bug.id)
      return ephemeralMessage(`Deleted bug #${bug.id} and removed its Discord messages.`)
    }

    const feature = await getFeatureById(env.DB, deleteAction.itemId)
    if (!feature) {
      return ephemeralMessage('Suggestion not found.')
    }

    try {
      await deleteFeatureDiscordArtifacts(client, feature)
    } catch (error) {
      logDiscordApiError('discord.component_feature_delete_failed', error, { featureId: feature.id })
      return ephemeralMessage('Failed to delete the suggestion messages from Discord.')
    }

    await deleteFeature(env.DB, feature.id)
    return ephemeralMessage(`Deleted suggestion #${feature.id} and removed its Discord messages.`)
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
  const bugStatusActions = new Set<BugStatus>(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE'])

  if (bugStatusActions.has(action as BugStatus)) {
    const result = await updateBugLifecycleStatus(env.DB, bugId, action as BugStatus)
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

    try {
      await deleteBugDiscordArtifacts(client, bug)
    } catch (error) {
      logDiscordApiError('discord.delete_bug_artifacts_failed', error, { bugId })
      return { ok: false as const, message: 'Failed to delete the bug messages from Discord.' }
    }

    await deleteBug(env.DB, bugId)
    return { ok: true as const }
  }

  if (action === 'resolve') {
    return handleDashboardBugAction(env, client, bugId, 'FIXED')
  }

  if (action === 'open') {
    return handleDashboardBugAction(env, client, bugId, 'OPEN')
  }

  return { ok: false as const, message: 'Unsupported bug action.' }
}

async function handleDashboardFeedbackAction(env: Env, client: DiscordRestClient, featureId: number, action: string) {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature) {
    return { ok: false as const, message: 'Suggestion not found.' }
  }

  const featureStatusActions = new Set<FeatureStatus>([
    'OPEN',
    'UNDER_REVIEW',
    'PLANNED',
    'IN_PROGRESS',
    'SHIPPED',
    'DECLINED',
    'CLOSED'
  ])

  if (featureStatusActions.has(action as FeatureStatus)) {
    const result = await updateFeatureLifecycleStatus(env, client, featureId, action as FeatureStatus)
    if (!result.ok) {
      return result
    }

    return { ok: true as const }
  }

  if (action === 'delete') {
    try {
      await deleteFeatureDiscordArtifacts(client, feature)
    } catch (error) {
      logDiscordApiError('discord.delete_feature_artifacts_failed', error, { featureId })
      return { ok: false as const, message: 'Failed to delete the suggestion messages from Discord.' }
    }

    await deleteFeature(env.DB, featureId)
    return { ok: true as const }
  }

  if (action === 'resolve') {
    return handleDashboardFeedbackAction(env, client, featureId, 'CLOSED')
  }

  if (action === 'open') {
    return handleDashboardFeedbackAction(env, client, featureId, 'OPEN')
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

    const verifiedState = await verifySignedSessionToken<{ userId: string; issuedAt: number; expiresAt: number }>(c.env.COOKIE_SECRET, state)
    if (!verifiedState) {
      return c.redirect('/dashboard')
    }

    try {
      const token = await exchangeOauthCode(c.env, code)
      const user = await fetchOauthUser(token.access_token)
      const guilds = (await fetchOauthGuilds(token.access_token)).sort((left, right) => left.name.localeCompare(right.name))

      if (guilds.length === 0) {
        return c.text('No Discord servers were found for this account.', 403)
      }

      if (guilds.length === 1) {
        const sessionToken = await createSignedSessionToken(c.env.COOKIE_SECRET, createDashboardSessionPayload(user.id, guilds[0]))
        return responseWithCookies(c.redirect('/dashboard'), [
          buildDashboardSessionCookie(sessionToken),
          clearDashboardGuildSelectionCookie()
        ])
      }

      const selectionToken = await createSignedSessionToken(c.env.COOKIE_SECRET, createGuildSelectionPayload(user.id, guilds))
      return responseWithCookies(c.redirect('/auth/discord/select-guild'), [
        buildDashboardGuildSelectionCookie(selectionToken),
        clearDashboardSessionCookie()
      ])
    } catch (error) {
      console.error('dashboard.oauth_callback_failed', error)
      return c.redirect('/dashboard')
    }
  })

  app.get('/auth/discord/select-guild', async (c) => {
    const selection = await getDashboardGuildSelectionSession(c.env, c.req.header('Cookie') ?? null)
    if (!selection) {
      return c.redirect('/dashboard')
    }

    return c.html(renderGuildSelectionPage({
      guilds: selection.guilds,
      logoutUrl: '/auth/logout'
    }))
  })

  app.post('/auth/discord/select-guild', async (c) => {
    if (!c.env.COOKIE_SECRET) {
      return c.redirect('/dashboard')
    }

    const cookieHeader = c.req.header('Cookie') ?? null
    const selection = await getDashboardGuildSelectionSession(c.env, cookieHeader)
    const guildId = String((await c.req.formData()).get('guildId') ?? '')
    const selectedGuild = selection ? findSelectedGuild(selection.guilds, guildId) : null

    if (!selection || !selectedGuild) {
      return c.redirect('/auth/discord/start')
    }

    const sessionToken = await createSignedSessionToken(c.env.COOKIE_SECRET, createDashboardSessionPayload(selection.userId, selectedGuild))
    return responseWithCookies(c.redirect('/dashboard'), [
      buildDashboardSessionCookie(sessionToken),
      clearDashboardGuildSelectionCookie()
    ])
  })

  app.get('/auth/logout', (c) => responseWithCookies(c.redirect('/dashboard'), [
    clearDashboardSessionCookie(),
    clearDashboardGuildSelectionCookie()
  ]))

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
    const access = await getDashboardAccessContext(c.env, c.req.header('Cookie') ?? null)
    if (!access.viewerId || !access.guildId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const query = bugsQuerySchema.parse({
      status: c.req.query('status') ?? 'open',
      sort: c.req.query('sort') ?? 'top'
    })

    return c.json({ bugs: await listBugs(c.env.DB, query.status, query.sort, { sourceGuildId: access.guildId }) })
  })

  app.get('/api/features', async (c) => {
    const access = await getDashboardAccessContext(c.env, c.req.header('Cookie') ?? null)
    if (!access.viewerId || !access.guildId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const status = c.req.query('status') === 'resolved' ? 'resolved' : c.req.query('status') === 'all' ? 'all' : 'active'
    const sort = c.req.query('sort') === 'newest' ? 'newest' : 'top'
    return c.json({ features: await listFeatures(c.env.DB, { status, sort, limit: 50, sourceGuildId: access.guildId }) })
  })

  app.get('/api/suggestions', async (c) => {
    const access = await getDashboardAccessContext(c.env, c.req.header('Cookie') ?? null)
    if (!access.viewerId || !access.guildId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const status = c.req.query('status') === 'resolved' ? 'resolved' : c.req.query('status') === 'all' ? 'all' : 'active'
    const sort = c.req.query('sort') === 'newest' ? 'newest' : 'top'
    return c.json({ suggestions: await listFeatures(c.env.DB, { status, sort, limit: 50, sourceGuildId: access.guildId }) })
  })

  app.get('/dashboard', async (c) => {
    const bugFilter = getDashboardBugFilter(c.req.query('bugStatus'))
    const suggestionFilter = getDashboardSuggestionFilter(c.req.query('suggestionStatus') ?? c.req.query('feedbackStatus'))
    const cookieHeader = c.req.header('Cookie') ?? null
    const client = new DiscordRestClient(c.env)
    const access = await getDashboardAccessContext(c.env, cookieHeader)

    if (!access.viewerId || !access.guildId) {
      if (!access.authConfigured) {
        return c.text('Dashboard authentication is not configured.', 501)
      }

      return c.redirect('/auth/discord/start')
    }

    const [rawBugs, rawFeatures] = await Promise.all([
      listBugs(c.env.DB, mapBugFilterToStatus(bugFilter), 'newest', { sourceGuildId: access.guildId }),
      listFeatures(c.env.DB, { status: mapSuggestionFilterToStatus(suggestionFilter), sort: 'newest', limit: 200, sourceGuildId: access.guildId })
    ])

    let followedBugIds = new Set<number>()
    let followedFeatureIds = new Set<number>()

    ;[followedBugIds, followedFeatureIds] = await Promise.all([
      listSubscribedItemIds(
        c.env.DB,
        'bug',
        access.viewerId,
        rawBugs.map((bug) => bug.id)
      ),
      listSubscribedItemIds(
        c.env.DB,
        'feature',
        access.viewerId,
        rawFeatures.map((feature) => feature.id)
      )
    ])

    const [bugs, features] = await Promise.all([
      Promise.all(rawBugs.map(async (bug) => ({
        ...bug,
        viewer_is_following: followedBugIds.has(bug.id),
        message_url: await resolveBugReportCardUrl(c.env, client, bug),
        source_message_url:
          bug.source_guild_id && bug.source_channel_id && bug.source_message_id
            ? `https://discord.com/channels/${bug.source_guild_id}/${bug.source_channel_id}/${bug.source_message_id}`
            : null
      }))),
      Promise.all(rawFeatures.map(async (feature) => ({
        ...feature,
        viewer_is_following: followedFeatureIds.has(feature.id),
        message_url: await resolveFeatureReportCardUrl(c.env, client, feature),
        source_message_url:
          feature.source_guild_id && feature.source_channel_id && feature.source_message_id
            ? `https://discord.com/channels/${feature.source_guild_id}/${feature.source_channel_id}/${feature.source_message_id}`
            : null
      })))
    ])

    return c.html(
      renderDashboardPage({
        bugs,
        features,
        currentBugFilter: bugFilter,
        currentSuggestionFilter: suggestionFilter,
        canManage: access.canManage,
        isAuthenticated: true,
        authUrl: null,
        logoutUrl: '/auth/logout',
        guildName: access.guildName ?? undefined,
        changeGuildUrl: '/auth/discord/start'
      })
    )
  })

  app.post('/dashboard/actions', async (c) => {
    const client = new DiscordRestClient(c.env)
    const formData = await c.req.formData()
    const kind = String(formData.get('kind') ?? '')
    const action = String(formData.get('action') ?? '')
    const id = Number(formData.get('id') ?? 0)
    const bugFilter = getDashboardBugFilter(String(formData.get('bugStatus') ?? 'all'))
    const suggestionFilter = getDashboardSuggestionFilter(
      String(formData.get('suggestionStatus') ?? formData.get('feedbackStatus') ?? 'all')
    )
    const cookieHeader = c.req.header('Cookie') ?? null
    const access = await getDashboardAccessContext(c.env, cookieHeader)

    if (!Number.isInteger(id) || id <= 0) {
      return c.redirect(buildDashboardUrl(bugFilter, suggestionFilter))
    }

    if ((action === 'upvote' || action === 'follow') && (!access.viewerId || !access.guildId)) {
      if (!access.authConfigured) {
        return c.text('Dashboard authentication is not configured.', 501)
      }

      return c.redirect(buildDashboardAuthRedirect(access))
    }

    if (action !== 'upvote' && action !== 'follow' && !access.canManage) {
      return c.text('Unauthorized', 401)
    }

    let result: { ok: true } | { ok: false; message: string }

    if (kind === 'bug') {
      const bug = access.guildId ? await getAuthorizedBugForDashboard(c.env, id, access.guildId) : null
      if (!bug) {
        result = { ok: false as const, message: 'Bug not found.' }
      } else if (action === 'upvote') {
        const upvoteResult = await upvoteBug(c.env.DB, id, access.viewerId as string)
        if (!upvoteResult.ok) {
          result = upvoteResult
        } else {
          await syncBugMessage(c.env, client, upvoteResult.bug.id)
          result = { ok: true as const }
        }
      } else if (action === 'follow') {
        const currentlySubscribed = await isSubscribed(c.env.DB, 'bug', id, access.viewerId as string)
        if (currentlySubscribed) {
          await removeSubscription(c.env.DB, 'bug', id, access.viewerId as string)
        } else {
          await addSubscription(c.env.DB, 'bug', id, access.viewerId as string)
        }
        await syncBugMessage(c.env, client, id)
        result = { ok: true as const }
      } else {
        result = await handleDashboardBugAction(c.env, client, id, action)
      }
    } else if (kind === 'feedback' || kind === 'suggestion') {
      const feature = access.guildId ? await getAuthorizedFeatureForDashboard(c.env, id, access.guildId) : null
      if (!feature) {
        result = { ok: false as const, message: 'Suggestion not found.' }
      } else if (action === 'upvote') {
        const upvoteResult = await upvoteFeature(c.env.DB, id, access.viewerId as string)
        if (!upvoteResult.ok) {
          result = upvoteResult
        } else {
          await syncFeatureMessage(c.env, client, upvoteResult.feature.id)
          result = { ok: true as const }
        }
      } else if (action === 'follow') {
        const currentlySubscribed = await isSubscribed(c.env.DB, 'feature', id, access.viewerId as string)
        if (currentlySubscribed) {
          await removeSubscription(c.env.DB, 'feature', id, access.viewerId as string)
        } else {
          await addSubscription(c.env.DB, 'feature', id, access.viewerId as string)
        }
        await syncFeatureMessage(c.env, client, id)
        result = { ok: true as const }
      } else {
        result = await handleDashboardFeedbackAction(c.env, client, id, action)
      }
    } else {
      result = { ok: false as const, message: 'Unsupported dashboard action.' }
    }

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
