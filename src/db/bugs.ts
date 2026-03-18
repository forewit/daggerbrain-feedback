import type { BugRecord, BugStatus, BugSummary } from '../types'

const bugColumns = `
  id, title, description, steps, expected, actual, status,
  reporter_id, votes_count, duplicate_flags_count, channel_id, message_id,
  created_at, updated_at
`

function toBugRecord(row: Record<string, unknown>): BugRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    steps: String(row.steps),
    expected: String(row.expected),
    actual: String(row.actual),
    status: row.status as BugStatus,
    reporter_id: String(row.reporter_id),
    votes_count: Number(row.votes_count),
    duplicate_flags_count: Number(row.duplicate_flags_count),
    channel_id: row.channel_id ? String(row.channel_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }
}

export async function createBug(db: D1Database, input: Omit<BugRecord, 'id' | 'status' | 'votes_count' | 'duplicate_flags_count' | 'channel_id' | 'message_id' | 'created_at' | 'updated_at'>): Promise<number> {
  const result = await db
    .prepare(`INSERT INTO bugs (title, description, steps, expected, actual, reporter_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(input.title, input.description, input.steps, input.expected, input.actual, input.reporter_id)
    .run()

  return Number(result.meta.last_row_id)
}

export async function setBugMessageMetadata(db: D1Database, bugId: number, channelId: string, messageId: string): Promise<void> {
  await db
    .prepare(`UPDATE bugs SET channel_id = ?, message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(channelId, messageId, bugId)
    .run()
}

export async function getBugById(db: D1Database, bugId: number): Promise<BugRecord | null> {
  const row = await db.prepare(`SELECT ${bugColumns} FROM bugs WHERE id = ?`).bind(bugId).first<Record<string, unknown>>()
  return row ? toBugRecord(row) : null
}

export async function listBugs(db: D1Database, status: 'open' | 'closed' | 'all', sort: 'top' | 'newest'): Promise<BugSummary[]> {
  const where = status === 'all' ? '' : 'WHERE status = ?'
  const order = sort === 'top' ? 'ORDER BY votes_count DESC, created_at DESC' : 'ORDER BY created_at DESC'
  const stmt = db.prepare(`SELECT id, title, status, votes_count, duplicate_flags_count, created_at FROM bugs ${where} ${order}`)
  const result = status === 'all' ? await stmt.all<Record<string, unknown>>() : await stmt.bind(status.toUpperCase()).all<Record<string, unknown>>()

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    status: row.status as BugStatus,
    votes_count: Number(row.votes_count),
    duplicate_flags_count: Number(row.duplicate_flags_count),
    created_at: String(row.created_at)
  }))
}

export async function addVote(db: D1Database, bugId: number, userId: string): Promise<'added' | 'duplicate'> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO votes (bug_id, user_id) VALUES (?, ?)`)
    .bind(bugId, userId)
    .run()

  if ((result.meta.changes ?? 0) === 0) return 'duplicate'

  await db.prepare(`UPDATE bugs SET votes_count = votes_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(bugId).run()
  return 'added'
}

export async function addDuplicateFlag(db: D1Database, bugId: number, userId: string): Promise<'added' | 'duplicate'> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO duplicate_flags (bug_id, user_id) VALUES (?, ?)`)
    .bind(bugId, userId)
    .run()

  if ((result.meta.changes ?? 0) === 0) return 'duplicate'

  await db.prepare(`UPDATE bugs SET duplicate_flags_count = duplicate_flags_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(bugId).run()
  return 'added'
}

export async function closeBug(db: D1Database, bugId: number): Promise<void> {
  await db.prepare(`UPDATE bugs SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(bugId).run()
}
