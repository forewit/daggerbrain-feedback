import {
  addVote,
  createBug,
  getBugById,
  normalizeBugTitle,
  resolveCanonicalBugId
} from '../db/bugs'
import { deriveTitleFromDescription } from './derive-title'
import type { BugPlatform, BugRecord, BugRelationshipType, BugSeverity } from '../types'

interface CreateBugSubmissionInput {
  platform: BugPlatform | null
  severity: BugSeverity | null
  description: string
  screenshot_url: string | null
}

export async function createBugFromSubmission(
  db: D1Database,
  userId: string,
  input: CreateBugSubmissionInput,
  options?: { relationshipType?: BugRelationshipType | null; targetBugId?: number | null }
): Promise<
  | { ok: true; bug: BugRecord; targetBug: BugRecord | null }
  | { ok: false; message: string }
> {
  const targetBugId = options?.targetBugId ? await resolveCanonicalBugId(db, options.targetBugId) : null
  const targetBug = targetBugId ? await getBugById(db, targetBugId) : null
  if (options?.relationshipType && !targetBug) {
    return { ok: false, message: 'The bug you selected is no longer available. Please run /bug again.' }
  }

  const bugId = await createBug(db, {
    ...input,
    title: deriveTitleFromDescription(input.description),
    steps: '',
    expected: '',
    actual: '',
    reporter_id: userId,
    title_normalized: normalizeBugTitle(deriveTitleFromDescription(input.description)),
    status: options?.relationshipType === 'DUPLICATE_OF' ? 'DUPLICATE' : 'OPEN',
    related_bug_id: targetBug?.id ?? null,
    relationship_type: options?.relationshipType ?? null,
    closed_reason: options?.relationshipType === 'DUPLICATE_OF' ? 'DUPLICATE' : null,
    status_note: null
  })

  const bug = await getBugById(db, bugId)
  if (!bug) {
    return { ok: false, message: 'Bug creation failed unexpectedly.' }
  }

  if (options?.relationshipType === 'DUPLICATE_OF' && targetBug) {
    await addVote(db, targetBug.id, userId)
  }

  return { ok: true, bug, targetBug }
}
