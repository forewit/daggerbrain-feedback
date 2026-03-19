import {
  addVote,
  getBugById,
  isClosedBugStatus,
  resolveCanonicalBugId,
  setBugRelationship,
  updateBugStatus
} from '../db/bugs'
import type { BugStatus } from '../types'

export async function linkBugAsDuplicate(
  db: D1Database,
  bugId: number,
  targetBugId: number
): Promise<
  | { ok: true; bugId: number; targetBugId: number }
  | { ok: false; message: string }
> {
  const bug = await getBugById(db, bugId)
  if (!bug) {
    return { ok: false, message: 'Bug not found.' }
  }

  const canonicalBugId = await resolveCanonicalBugId(db, targetBugId)
  if (bug.id === canonicalBugId) {
    return { ok: false, message: 'A bug cannot be marked as a duplicate of itself.' }
  }

  const targetBug = await getBugById(db, canonicalBugId)
  if (!targetBug) {
    return { ok: false, message: 'Target bug not found.' }
  }

  await setBugRelationship(db, bug.id, targetBug.id, 'DUPLICATE_OF')
  await updateBugStatus(db, bug.id, 'DUPLICATE', {
    closedReason: 'DUPLICATE',
    statusNote: null
  })
  await addVote(db, targetBug.id, bug.reporter_id)

  return { ok: true, bugId: bug.id, targetBugId: targetBug.id }
}

export async function linkBugAsRegression(
  db: D1Database,
  bugId: number,
  targetBugId: number
): Promise<
  | { ok: true; bugId: number; targetBugId: number; previousStatus: BugStatus; nextStatus: BugStatus }
  | { ok: false; message: string }
> {
  const bug = await getBugById(db, bugId)
  if (!bug) {
    return { ok: false, message: 'Bug not found.' }
  }

  const canonicalBugId = await resolveCanonicalBugId(db, targetBugId)
  if (bug.id === canonicalBugId) {
    return { ok: false, message: 'A bug cannot link to itself.' }
  }

  const targetBug = await getBugById(db, canonicalBugId)
  if (!targetBug) {
    return { ok: false, message: 'Target bug not found.' }
  }

  const nextStatus = isClosedBugStatus(bug.status) ? 'OPEN' : bug.status
  await setBugRelationship(db, bug.id, targetBug.id, 'REGRESSION_OF')
  await updateBugStatus(db, bug.id, nextStatus, {
    closedReason: null,
    statusNote: null
  })

  return { ok: true, bugId: bug.id, targetBugId: targetBug.id, previousStatus: bug.status, nextStatus }
}
