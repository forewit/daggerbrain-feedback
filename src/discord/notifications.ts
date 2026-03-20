import { listSubscriptionsForItem } from '../db/subscriptions'
import type { BugRecord, FeatureRecord } from '../types'
import { DiscordApiError, DiscordRestClient } from './rest'

async function sendDm(client: DiscordRestClient, userId: string, content: string): Promise<void> {
  const channel = await client.createDmChannel(userId)
  await client.createMessage(channel.id, { content, allowed_mentions: { parse: [] } })
}

function uniqueUserIds(userIds: string[]): string[] {
  return [...new Set(userIds.filter(Boolean))]
}

export async function notifyBugFollowers(
  env: { DB: D1Database },
  client: DiscordRestClient,
  bug: BugRecord
): Promise<void> {
  const subscriptions = await listSubscriptionsForItem(env.DB, 'bug', bug.id)
  const recipients = uniqueUserIds([bug.reporter_id, ...subscriptions.map((subscription) => subscription.user_id)])
  const content = `Bug #${bug.id} is now ${bug.status}.${bug.status_note ? `\nNote: ${bug.status_note}` : ''}`

  await Promise.all(
    recipients.map(async (userId) => {
      try {
        await sendDm(client, userId, content)
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
  env: { DB: D1Database },
  client: DiscordRestClient,
  feature: FeatureRecord
): Promise<void> {
  const subscriptions = await listSubscriptionsForItem(env.DB, 'feature', feature.id)
  const recipients = uniqueUserIds([feature.reporter_id, ...subscriptions.map((subscription) => subscription.user_id)])
  const content = `Suggestion #${feature.id} is now ${feature.status}.${feature.status_note ? `\nNote: ${feature.status_note}` : ''}`

  await Promise.all(
    recipients.map(async (userId) => {
      try {
        await sendDm(client, userId, content)
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
