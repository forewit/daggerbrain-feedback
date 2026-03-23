import { ChannelType } from 'discord-api-types/v10'
import { getBugById } from '../db/bugs'
import { getFeatureById } from '../db/features'
import { getGuildFeedbackSettings } from '../db/guild-settings'
import { countSubscriptions } from '../db/subscriptions'
import type { BugRecord, Env, FeatureRecord } from '../types'
import {
  renderLegacyBugMessage,
  renderLegacyFeatureMessage
} from './messages'
import { DiscordApiError, DiscordRestClient, type DiscordChannelRecord } from './rest'

export class MissingFeedbackChannelError extends Error {
  constructor(readonly kind: 'bug' | 'feature', readonly guildId: string | null) {
    super(`No ${kind} report channel configured.`)
  }
}

export function buildDiscordMessageUrl(
  env: Pick<Env, 'DISCORD_GUILD_ID'>,
  channelId: string | null,
  messageId: string | null,
  guildId?: string | null
): string | null {
  const resolvedGuildId = guildId ?? env.DISCORD_GUILD_ID ?? null
  if (!resolvedGuildId || !channelId || !messageId) {
    return null
  }

  return `https://discord.com/channels/${resolvedGuildId}/${channelId}/${messageId}`
}

export function buildSourceMessageUrl(
  env: Env,
  guildId: string | null,
  channelId: string | null,
  messageId: string | null
): string | null {
  const resolvedGuildId = guildId ?? env.DISCORD_GUILD_ID ?? null
  if (!resolvedGuildId || !channelId || !messageId) {
    return null
  }

  return `https://discord.com/channels/${resolvedGuildId}/${channelId}/${messageId}`
}

export function buildDashboardBugUrl(env: Env, bugId: number): string | null {
  const baseUrl = env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  return baseUrl ? `${baseUrl}/dashboard#bug-${bugId}` : null
}

export function buildBugLink(env: Env, bug: { id: number; channel_id: string | null; message_id: string | null }): string | null {
  return buildDiscordMessageUrl(env, bug.channel_id, bug.message_id) ?? buildDashboardBugUrl(env, bug.id)
}

export function buildFeatureLink(env: Env, feature: { channel_id: string | null; message_id: string | null }): string | null {
  return buildDiscordMessageUrl(env, feature.channel_id, feature.message_id)
}

function getDefaultReportChannelId(env: Env, kind: 'bug' | 'feature'): string | null {
  return kind === 'bug' ? env.BUG_REPORT_CHANNEL_ID ?? null : env.FEATURE_CHANNEL_ID ?? null
}

async function resolveConfiguredReportChannelId(
  env: Env,
  kind: 'bug' | 'feature',
  guildId?: string | null
): Promise<string | null> {
  if (guildId) {
    const settings = await getGuildFeedbackSettings(env.DB, guildId)
    const configured = kind === 'bug' ? settings?.bug_report_channel_id : settings?.feature_channel_id
    if (configured) {
      return configured
    }
  }

  return getDefaultReportChannelId(env, kind)
}

async function requireConfiguredReportChannelId(
  env: Env,
  kind: 'bug' | 'feature',
  guildId?: string | null
): Promise<string> {
  const channelId = await resolveConfiguredReportChannelId(env, kind, guildId)
  if (channelId) {
    return channelId
  }

  throw new MissingFeedbackChannelError(kind, guildId ?? null)
}

async function resolveReportGuildId(
  env: Env,
  client: DiscordRestClient,
  kind: 'bug' | 'feature',
  fallbackGuildId?: string | null,
  configuredChannelId?: string | null,
  postedChannelId?: string | null
): Promise<string | null> {
  if (env.DISCORD_GUILD_ID) {
    return env.DISCORD_GUILD_ID
  }

  if (fallbackGuildId) {
    return fallbackGuildId
  }

  try {
    const channelId = postedChannelId ?? configuredChannelId ?? getDefaultReportChannelId(env, kind)
    if (!channelId) {
      return null
    }

    const channel = await client.getChannel(channelId)
    return channel.guild_id ?? null
  } catch (error) {
    logDiscordApiError('discord.resolve_report_guild_failed', error, { kind })
    return null
  }
}

async function getParentReportChannel(
  client: DiscordRestClient,
  messageChannelId: string
): Promise<DiscordChannelRecord | null> {
  try {
    const channel = await client.getChannel(messageChannelId)
    if (!channel.parent_id) {
      return channel
    }

    return await client.getChannel(channel.parent_id)
  } catch (error) {
    logDiscordApiError('discord.resolve_parent_report_channel_failed', error, { messageChannelId })
    return null
  }
}

export async function resolveBugReportCardUrl(
  env: Env,
  client: DiscordRestClient,
  bug: { id: number; channel_id?: string | null; message_id?: string | null; source_guild_id?: string | null }
): Promise<string | null> {
  const configuredChannelId = await resolveConfiguredReportChannelId(env, 'bug', bug.source_guild_id ?? null)
  const guildId = await resolveReportGuildId(env, client, 'bug', bug.source_guild_id ?? null, configuredChannelId, bug.channel_id ?? null)
  return buildDiscordMessageUrl(env, bug.channel_id ?? null, bug.message_id ?? null, guildId) ?? buildDashboardBugUrl(env, bug.id)
}

export async function resolveFeatureReportCardUrl(
  env: Env,
  client: DiscordRestClient,
  feature: { channel_id?: string | null; message_id?: string | null; source_guild_id?: string | null }
): Promise<string | null> {
  const configuredChannelId = await resolveConfiguredReportChannelId(env, 'feature', feature.source_guild_id ?? null)
  const guildId = await resolveReportGuildId(env, client, 'feature', feature.source_guild_id ?? null, configuredChannelId, feature.channel_id ?? null)
  return buildDiscordMessageUrl(env, feature.channel_id ?? null, feature.message_id ?? null, guildId)
}

function normalizeTagName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pickForumTagIds(channel: DiscordChannelRecord, desiredNames: string[]): string[] {
  const availableTags = channel.available_tags ?? []
  const wanted = new Set(desiredNames.map(normalizeTagName))
  const tagIds = availableTags
    .filter((tag) => wanted.has(normalizeTagName(tag.name)))
    .map((tag) => tag.id)

  const requiresTag = ((channel.flags ?? 0) & (1 << 4)) !== 0
  if (tagIds.length === 0 && requiresTag && availableTags[0]) {
    return [availableTags[0].id]
  }

  return tagIds
}

function getBugForumTagIds(channel: DiscordChannelRecord, bug: BugRecord): string[] {
  const desiredNames = [
    'bug',
    bug.status.toLowerCase().replace(/_/g, ' '),
    bug.relationship_type === 'REGRESSION_OF' ? 'regression' : '',
    bug.platform?.toLowerCase() ?? '',
    bug.severity?.toLowerCase() ?? ''
  ].filter(Boolean)

  return pickForumTagIds(channel, desiredNames)
}

function getFeatureForumTagIds(channel: DiscordChannelRecord, feature: FeatureRecord): string[] {
  return pickForumTagIds(channel, ['suggestion', 'feedback', 'feature', 'request', feature.status.toLowerCase()])
}

function isForumChannel(channelType: ChannelType): boolean {
  return channelType === ChannelType.GuildForum || channelType === ChannelType.GuildMedia
}

function isMessageChannel(channelType: ChannelType): boolean {
  return channelType === ChannelType.GuildText || channelType === ChannelType.GuildAnnouncement
}

function buildForumStarterMessage(kind: 'bug' | 'feature', title: string, reporterId: string) {
  return {
    content: `${kind === 'bug' ? 'Bug' : 'Suggestion'} intake: ${title}\nReporter: <@${reporterId}>`,
    allowed_mentions: { parse: [] as [] }
  }
}

export async function createBugReportMessage(env: Env, client: DiscordRestClient, bug: BugRecord) {
  const reportChannelId = await requireConfiguredReportChannelId(env, 'bug', bug.source_guild_id)
  const channel = await client.getChannel(reportChannelId)
  const relatedBug = bug.related_bug_id ? await getBugById(env.DB, bug.related_bug_id) : null
  const relatedBugUrl = relatedBug ? await resolveBugReportCardUrl(env, client, relatedBug) : null
  const bugUrl = buildBugLink(env, bug)
  const sourceMessageUrl = buildSourceMessageUrl(env, bug.source_guild_id, bug.source_channel_id, bug.source_message_id)
  const followerCount = await countSubscriptions(env.DB, 'bug', bug.id)
  const payload = renderLegacyBugMessage(bug, { relatedBug, relatedBugUrl, bugUrl, sourceMessageUrl, followerCount })

  if (isForumChannel(channel.type)) {
    const thread = await client.createForumThread(channel.id, {
      name: bug.title,
      message: buildForumStarterMessage('bug', bug.title, bug.reporter_id),
      applied_tags: getBugForumTagIds(channel, bug)
    })

    const message = await client.createMessage(thread.channel_id, payload)
    return {
      channel_id: thread.channel_id,
      id: message.id
    }
  }

  if (isMessageChannel(channel.type)) {
    return client.createMessage(channel.id, payload)
  }

  throw new Error(`Unsupported bug report channel type: ${channel.type}`)
}

export async function createFeatureReportMessage(env: Env, client: DiscordRestClient, feature: FeatureRecord) {
  const reportChannelId = await requireConfiguredReportChannelId(env, 'feature', feature.source_guild_id)
  const channel = await client.getChannel(reportChannelId)
  const featureUrl = buildFeatureLink(env, feature)
  const sourceMessageUrl = buildSourceMessageUrl(
    env,
    feature.source_guild_id,
    feature.source_channel_id,
    feature.source_message_id
  )
  const followerCount = await countSubscriptions(env.DB, 'feature', feature.id)
  const payload = renderLegacyFeatureMessage(feature, { featureUrl, sourceMessageUrl, followerCount })

  if (isForumChannel(channel.type)) {
    const thread = await client.createForumThread(channel.id, {
      name: feature.title,
      message: buildForumStarterMessage('feature', feature.title, feature.reporter_id),
      applied_tags: getFeatureForumTagIds(channel, feature)
    })

    const message = await client.createMessage(thread.channel_id, payload)
    return {
      channel_id: thread.channel_id,
      id: message.id
    }
  }

  if (isMessageChannel(channel.type)) {
    return client.createMessage(channel.id, payload)
  }

  throw new Error(`Unsupported feature report channel type: ${channel.type}`)
}

export async function syncBugMessage(env: Env, client: DiscordRestClient, bugId: number): Promise<void> {
  const bug = await getBugById(env.DB, bugId)
  if (!bug?.channel_id || !bug.message_id) {
    return
  }

  try {
    const relatedBug = bug.related_bug_id ? await getBugById(env.DB, bug.related_bug_id) : null
    const relatedBugUrl = relatedBug ? await resolveBugReportCardUrl(env, client, relatedBug) : null
    const bugUrl = await resolveBugReportCardUrl(env, client, bug)
    const sourceMessageUrl = buildSourceMessageUrl(env, bug.source_guild_id, bug.source_channel_id, bug.source_message_id)
    const followerCount = await countSubscriptions(env.DB, 'bug', bug.id)
    await client.editMessage(
      bug.channel_id,
      bug.message_id,
      renderLegacyBugMessage(bug, { relatedBug, relatedBugUrl, bugUrl, sourceMessageUrl, followerCount })
    )

    const parentChannel = await getParentReportChannel(client, bug.channel_id)
    if (parentChannel && isForumChannel(parentChannel.type)) {
      await client.updateThreadTags(bug.channel_id, getBugForumTagIds(parentChannel, bug))
    }
  } catch (error) {
    logDiscordApiError('discord.edit_bug_message_failed', error, { bugId })
  }
}

export async function syncFeatureMessage(env: Env, client: DiscordRestClient, featureId: number): Promise<void> {
  const feature = await getFeatureById(env.DB, featureId)
  if (!feature?.channel_id || !feature.message_id) {
    return
  }

  try {
    const featureUrl = await resolveFeatureReportCardUrl(env, client, feature)
    const sourceMessageUrl = buildSourceMessageUrl(
      env,
      feature.source_guild_id,
      feature.source_channel_id,
      feature.source_message_id
    )
    const followerCount = await countSubscriptions(env.DB, 'feature', feature.id)
    await client.editMessage(
      feature.channel_id,
      feature.message_id,
      renderLegacyFeatureMessage(feature, { featureUrl, sourceMessageUrl, followerCount })
    )

    const parentChannel = await getParentReportChannel(client, feature.channel_id)
    if (parentChannel && isForumChannel(parentChannel.type)) {
      await client.updateThreadTags(feature.channel_id, getFeatureForumTagIds(parentChannel, feature))
    }
  } catch (error) {
    logDiscordApiError('discord.edit_feature_message_failed', error, { featureId })
  }
}

export function logDiscordApiError(event: string, error: unknown, metadata?: Record<string, unknown>) {
  if (error instanceof DiscordApiError) {
    console.error(event, {
      status: error.status,
      discordCode: error.discordCode,
      body: error.body,
      route: error.context.route,
      method: error.context.method,
      payloadSummary: error.context.payloadSummary,
      ...(metadata ?? {})
    })
    return
  }

  console.error(event, { error, ...(metadata ?? {}) })
}

export function getCreateMessageFailureMessage(kind: 'bug' | 'feature', error: unknown): string {
  if (error instanceof MissingFeedbackChannelError) {
    return `Saved, but no ${kind === 'bug' ? 'bug' : 'suggestion'} channel is configured for this server. An admin can run /feedback-config set.`
  }

  if (error instanceof DiscordApiError) {
    if (error.status === 403 && error.discordCode === 50001) {
      return `${kind === 'bug' ? 'Bug' : 'Suggestion'} saved, but the bot cannot access the configured channel.`
    }

    if (error.status === 403 && error.discordCode === 50013) {
      return `${kind === 'bug' ? 'Bug' : 'Suggestion'} saved, but the bot is missing permission to post in the configured channel.`
    }
  }

  return `${kind === 'bug' ? 'Bug' : 'Suggestion'} saved, but posting to Discord failed.`
}
