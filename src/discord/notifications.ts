import { listSubscriptionsForItem } from '../db/subscriptions'
import type { APIActionRowComponent, APIButtonComponentWithCustomId, APIButtonComponentWithURL } from 'discord-api-types/v10'
import type { BugRecord, Env, FeatureRecord } from '../types'
import { bugStatusLabel, featureStatusLabel, itemKeyText, itemLinkButtonRows, richTextMessage } from './messages'
import { resolveBugReportCardUrl, resolveFeatureReportCardUrl } from './publisher'
import { DiscordApiError, DiscordRestClient } from './rest'

type MessageButton = APIButtonComponentWithCustomId | APIButtonComponentWithURL
type ButtonRow = APIActionRowComponent<MessageButton>

async function sendDm(client: DiscordRestClient, userId: string, content: string, components: ButtonRow[] = []): Promise<void> {
  const channel = await client.createDmChannel(userId)
  console.log('discord.notification_dm', {
    userId,
    channelId: channel.id,
    content,
    linkRows: components.map((row) => ({
      labels: (row.components ?? []).map((component) => component.label ?? null),
      urls: (row.components ?? []).map((component) => ('url' in component ? component.url ?? null : null))
    }))
  })
  await client.createMessage(channel.id, richTextMessage(content, components))
}

function uniqueUserIds(userIds: string[]): string[] {
  return [...new Set(userIds.filter(Boolean))]
}

function formatStatusNotification(
  kind: 'bug' | 'feature',
  id: number,
  statusLabel: string,
  note?: string | null,
  url?: string | null
): string {
  return `${itemKeyText(kind, id, url)} is now ${statusLabel}${note ? `\nNote: ${note}` : ''}`
}

export function formatBugStatusNotification(bug: BugRecord, bugUrl?: string | null): string {
  return formatStatusNotification('bug', bug.id, bugStatusLabel(bug.status), bug.status_note, bugUrl)
}

export function formatFeatureStatusNotification(feature: FeatureRecord, featureUrl?: string | null): string {
  return formatStatusNotification('feature', feature.id, featureStatusLabel(feature.status), feature.status_note, featureUrl)
}

export async function notifyBugFollowers(
  env: Env,
  client: DiscordRestClient,
  bug: BugRecord
): Promise<void> {
  const subscriptions = await listSubscriptionsForItem(env.DB, 'bug', bug.id)
  const recipients = uniqueUserIds(subscriptions.map((subscription) => subscription.user_id))
  const bugUrl = await resolveBugReportCardUrl(env, client, bug)
  const content = formatBugStatusNotification(bug, bugUrl)
  const components = itemLinkButtonRows([{ kind: 'bug', id: bug.id, url: bugUrl }])
  console.log('discord.notify_bug_followers', { bugId: bug.id, bugUrl, recipientCount: recipients.length, hasLinkButtons: components.length > 0 })

  await Promise.all(
    recipients.map(async (userId) => {
      try {
        await sendDm(client, userId, content, components)
      } catch (error) {
        if (error instanceof DiscordApiError) {
          console.warn('discord.bug_notification_failed', { userId, bugId: bug.id, status: error.status, code: error.discordCode })
          return
        }

        console.warn('discord.bug_notification_failed', { userId, bugId: bug.id, error })
      }
    })
  )
}

export async function notifyFeatureFollowers(
  env: Env,
  client: DiscordRestClient,
  feature: FeatureRecord
): Promise<void> {
  const subscriptions = await listSubscriptionsForItem(env.DB, 'feature', feature.id)
  const recipients = uniqueUserIds(subscriptions.map((subscription) => subscription.user_id))
  const featureUrl = await resolveFeatureReportCardUrl(env, client, feature)
  const content = formatFeatureStatusNotification(feature, featureUrl)
  const components = itemLinkButtonRows([{ kind: 'feature', id: feature.id, url: featureUrl }])
  console.log('discord.notify_feature_followers', {
    featureId: feature.id,
    featureUrl,
    recipientCount: recipients.length,
    hasLinkButtons: components.length > 0
  })

  await Promise.all(
    recipients.map(async (userId) => {
      try {
        await sendDm(client, userId, content, components)
      } catch (error) {
        if (error instanceof DiscordApiError) {
          console.warn('discord.feature_notification_failed', {
            userId,
            featureId: feature.id,
            status: error.status,
            code: error.discordCode
          })
          return
        }

        console.warn('discord.feature_notification_failed', { userId, featureId: feature.id, error })
      }
    })
  )
}
