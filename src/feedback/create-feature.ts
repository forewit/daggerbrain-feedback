import { createFeature, getFeatureById } from '../db/features'
import type { FeatureRecord } from '../types'
import { deriveTitleFromDescription } from './derive-title'

interface CreateFeatureSubmissionInput {
  description: string
  screenshot_url: string | null
  source_guild_id?: string | null
  source_channel_id?: string | null
  source_message_id?: string | null
}

export async function createFeatureFromSubmission(
  db: D1Database,
  userId: string,
  input: CreateFeatureSubmissionInput
): Promise<{ ok: true; feature: FeatureRecord } | { ok: false; message: string }> {
  const featureId = await createFeature(db, {
    title: deriveTitleFromDescription(input.description),
    description: input.description,
    benefit: '',
    screenshot_url: input.screenshot_url,
    reporter_id: userId,
    source_guild_id: input.source_guild_id ?? null,
    source_channel_id: input.source_channel_id ?? null,
    source_message_id: input.source_message_id ?? null,
    status_note: null
  })

  const feature = await getFeatureById(db, featureId)
  if (!feature) {
    return { ok: false, message: 'Suggestion creation failed unexpectedly.' }
  }

  return { ok: true, feature }
}
