import { addVote, getBugById, isActiveBugStatus } from '../db/bugs'
import { addFeatureVote, getFeatureById } from '../db/features'

export async function upvoteBug(db: D1Database, bugId: number, userId: string) {
  const bug = await getBugById(db, bugId)
  if (!bug) {
    return { ok: false as const, message: 'Bug not found.' }
  }

  if (!isActiveBugStatus(bug.status)) {
    return { ok: false as const, message: 'Only open bugs can receive more upvotes.' }
  }

  const outcome = await addVote(db, bug.id, userId)
  return { ok: true as const, bug, outcome }
}

export async function upvoteFeature(db: D1Database, featureId: number, userId: string) {
  const feature = await getFeatureById(db, featureId)
  if (!feature) {
    return { ok: false as const, message: 'Feedback not found.' }
  }

  if (!['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS'].includes(feature.status)) {
    return { ok: false as const, message: 'Only open feedback can be upvoted.' }
  }

  const outcome = await addFeatureVote(db, feature.id, userId)
  return { ok: true as const, feature, outcome }
}
