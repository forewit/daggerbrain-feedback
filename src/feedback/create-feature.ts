import { createFeature, getFeatureById } from '../db/features'
import type { FeatureRecord } from '../types'

interface CreateFeatureSubmissionInput {
  feature_title: string
  feature_benefit: string
  feature_description: string
  screenshot_url: string | null
}

export async function createFeatureFromSubmission(
  db: D1Database,
  userId: string,
  input: CreateFeatureSubmissionInput
): Promise<{ ok: true; feature: FeatureRecord } | { ok: false; message: string }> {
  const featureId = await createFeature(db, {
    title: input.feature_title,
    description: input.feature_description,
    benefit: input.feature_benefit,
    screenshot_url: input.screenshot_url,
    reporter_id: userId
  })

  const feature = await getFeatureById(db, featureId)
  if (!feature) {
    return { ok: false, message: 'Feature creation failed unexpectedly.' }
  }

  return { ok: true, feature }
}
