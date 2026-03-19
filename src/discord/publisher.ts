import { ChannelType } from 'discord-api-types/v10'
import { getBugById } from '../db/bugs'
import { getFeatureById } from '../db/features'
import type { BugRecord, Env, FeatureRecord } from '../types'
import {
  renderLegacyBugMessage,
  renderLegacyFeatureMessage
} from './messages'
import { DiscordApiError, DiscordRestClient, type DiscordChannelRecord } from './rest'

export function buildDiscordMessageUrl(env: Env, channelId: string | null, messageId: string | null): string | null {
  if (!env.DISCORD_GUILD_ID || !channelId || !messageId) {
    return null
  }

  return `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channelId}/${messageId}`
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
  return pickForumTagIds(channel, ['feature', 'request', feature.status.toLowerCase()])
}

function isForumChannel(channelType: ChannelType): boolean {
  return channelType === ChannelType.GuildForum || channelType === ChannelType.GuildMedia
}

function isMessageChannel(channelType: ChannelType): boolean {
  return channelType === ChannelType.GuildText || channelType === ChannelType.GuildAnnouncement
}

export async function createBugReportMessage(env: Env, client: DiscordRestClient, bug: BugRecord) {
  const channel = await client.getChannel(env.BUG_REPORT_CHANNEL_ID)
  const relatedBug = bug.related_bug_id ? await getBugById(env.DB, bug.related_bug_id) : null
  const relatedBugUrl = relatedBug ? buildBugLink(env, relatedBug) : null
  const bugUrl = buildBugLink(env, bug)
  const payload = renderLegacyBugMessage(bug, { relatedBug, relatedBugUrl, bugUrl })

  if (isForumChannel(channel.type)) {
    return client.createForumThread(channel.id, {
      name: bug.title,
      message: payload,
      applied_tags: getBugForumTagIds(channel, bug)
    })
  }

  if (isMessageChannel(channel.type)) {
    return client.createMessage(channel.id, payload)
  }

  throw new Error(`Unsupported bug report channel type: ${channel.type}`)
}

export async function createFeatureReportMessage(env: Env, client: DiscordRestClient, feature: FeatureRecord) {
  const channel = await client.getChannel(env.FEATURE_CHANNEL_ID)
  const featureUrl = buildFeatureLink(env, feature)
  const payload = renderLegacyFeatureMessage(feature, { featureUrl })

  if (isForumChannel(channel.type)) {
    return client.createForumThread(channel.id, {
      name: feature.title,
      message: payload,
      applied_tags: getFeatureForumTagIds(channel, feature)
    })
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
    const relatedBugUrl = relatedBug ? buildBugLink(env, relatedBug) : null
    const bugUrl = buildBugLink(env, bug)
    await client.editMessage(
      bug.channel_id,
      bug.message_id,
      renderLegacyBugMessage(bug, { relatedBug, relatedBugUrl, bugUrl })
    )

    const parentChannel = await client.getChannel(env.BUG_REPORT_CHANNEL_ID)
    if (isForumChannel(parentChannel.type)) {
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
    const featureUrl = buildFeatureLink(env, feature)
    await client.editMessage(feature.channel_id, feature.message_id, renderLegacyFeatureMessage(feature, { featureUrl }))

    const parentChannel = await client.getChannel(env.FEATURE_CHANNEL_ID)
    if (isForumChannel(parentChannel.type)) {
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
  if (error instanceof DiscordApiError) {
    if (error.status === 403 && error.discordCode === 50001) {
      return `${kind === 'bug' ? 'Bug' : 'Feature'} saved, but the bot cannot access the configured channel.`
    }

    if (error.status === 403 && error.discordCode === 50013) {
      return `${kind === 'bug' ? 'Bug' : 'Feature'} saved, but the bot is missing permission to post in the configured channel.`
    }
  }

  return `${kind === 'bug' ? 'Bug' : 'Feature'} saved, but posting to Discord failed.`
}
