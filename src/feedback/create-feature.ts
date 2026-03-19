import { createFeature, getFeatureById } from '../db/features'
import type { FeatureRecord } from '../types'
import { deriveTitleFromDescription } from './derive-title'

interface CreateFeatureSubmissionInput {
  description: string
  screenshot_url: string | null
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
    reporter_id: userId
  })

  const feature = await getFeatureById(db, featureId)
  if (!feature) {
    return { ok: false, message: 'Feedback creation failed unexpectedly.' }
  }

  return { ok: true, feature }
}
