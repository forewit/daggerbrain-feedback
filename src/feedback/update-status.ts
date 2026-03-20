import { getBugById, updateBugStatus } from '../db/bugs'
import type { BugClosedReason, BugStatus } from '../types'

function getClosedReason(previousStatus: BugStatus, nextStatus: BugStatus): BugClosedReason | null {
  if (nextStatus === 'DUPLICATE') return 'DUPLICATE'
  if (nextStatus !== 'CLOSED') return null
  return previousStatus === 'FIXED' ? 'RESOLVED' : 'OTHER'
}

export async function updateBugLifecycleStatus(
  db: D1Database,
  bugId: number,
  nextStatus: BugStatus,
  options?: { note?: string | null }
): Promise<
  | { ok: true; bugId: number; previousStatus: BugStatus; nextStatus: BugStatus }
  | { ok: false; message: string }
> {
  const bug = await getBugById(db, bugId)
  if (!bug) {
    return { ok: false, message: 'Bug not found.' }
  }

  if (bug.status === nextStatus) {
    return { ok: false, message: `Bug #${bug.id} is already ${bug.status}.` }
  }

  await updateBugStatus(db, bug.id, nextStatus, {
    closedReason: getClosedReason(bug.status, nextStatus),
    statusNote: options?.note ?? null
  })

  return { ok: true, bugId: bug.id, previousStatus: bug.status, nextStatus }
}
