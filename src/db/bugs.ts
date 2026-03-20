import type {
  BugPlatform,
  BugClosedReason,
  BugPreflightMatch,
  BugPreflightSession,
  BugRecord,
  BugRelationshipType,
  BugSeverity,
  BugStatus,
  BugSummary,
  CreateBugInput
} from '../types'

const bugColumns = `
  b.id,
  b.title,
  b.title_normalized,
  b.description,
  b.steps,
  b.expected,
  b.actual,
  b.platform,
  b.severity,
  b.screenshot_url,
  b.status,
  b.reporter_id,
  b.votes_count,
  b.duplicate_flags_count,
  b.channel_id,
  b.message_id,
  b.source_guild_id,
  b.source_channel_id,
  b.source_message_id,
  b.related_bug_id,
  b.relationship_type,
  b.closed_reason,
  b.status_note,
  b.created_at,
  b.updated_at,
  COALESCE((
    SELECT COUNT(*)
    FROM bugs child
    WHERE child.related_bug_id = b.id AND child.relationship_type = 'DUPLICATE_OF'
  ), 0) AS linked_duplicates_count,
  COALESCE((
    SELECT COUNT(*)
    FROM bugs child
    WHERE child.related_bug_id = b.id AND child.relationship_type = 'REGRESSION_OF'
  ), 0) AS regressions_count,
  COALESCE((
    SELECT COUNT(*)
    FROM subscriptions s
    WHERE s.item_kind = 'bug' AND s.item_id = b.id
  ), 0) AS follower_count
`

const ACTIVE_BUG_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] as const
const CLOSED_BUG_STATUSES = ['FIXED', 'CLOSED', 'DUPLICATE'] as const

function toBugRecord(row: Record<string, unknown>): BugRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    title_normalized: String(row.title_normalized ?? ''),
    description: String(row.description),
    steps: String(row.steps),
    expected: String(row.expected),
    actual: String(row.actual),
    platform: (row.platform as BugPlatform | null) ?? null,
    severity: (row.severity as BugSeverity | null) ?? null,
    screenshot_url: row.screenshot_url ? String(row.screenshot_url) : null,
    status: row.status as BugStatus,
    reporter_id: String(row.reporter_id),
    votes_count: Number(row.votes_count),
    duplicate_flags_count: Number(row.duplicate_flags_count),
    linked_duplicates_count: Number(row.linked_duplicates_count ?? 0),
    regressions_count: Number(row.regressions_count ?? 0),
    channel_id: row.channel_id ? String(row.channel_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    source_guild_id: row.source_guild_id ? String(row.source_guild_id) : null,
    source_channel_id: row.source_channel_id ? String(row.source_channel_id) : null,
    source_message_id: row.source_message_id ? String(row.source_message_id) : null,
    related_bug_id: row.related_bug_id === null || row.related_bug_id === undefined ? null : Number(row.related_bug_id),
    relationship_type: (row.relationship_type as BugRelationshipType | null) ?? null,
    closed_reason: (row.closed_reason as BugClosedReason | null) ?? null,
    status_note: row.status_note ? String(row.status_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }
}

function toBugSummary(row: Record<string, unknown>): BugSummary {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    status: row.status as BugStatus,
    reporter_id: String(row.reporter_id ?? ''),
    votes_count: Number(row.votes_count),
    duplicate_flags_count: Number(row.duplicate_flags_count),
    linked_duplicates_count: Number(row.linked_duplicates_count ?? 0),
    regressions_count: Number(row.regressions_count ?? 0),
    channel_id: row.channel_id ? String(row.channel_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    source_guild_id: row.source_guild_id ? String(row.source_guild_id) : null,
    source_channel_id: row.source_channel_id ? String(row.source_channel_id) : null,
    source_message_id: row.source_message_id ? String(row.source_message_id) : null,
    related_bug_id: row.related_bug_id === null || row.related_bug_id === undefined ? null : Number(row.related_bug_id),
    relationship_type: (row.relationship_type as BugRelationshipType | null) ?? null,
    closed_reason: (row.closed_reason as BugClosedReason | null) ?? null,
    status_note: row.status_note ? String(row.status_note) : null,
    follower_count: Number(row.follower_count ?? 0),
    created_at: String(row.created_at)
  }
}

export function normalizeBugTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeBugTitle(title: string): string[] {
  return normalizeBugTitle(title)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function scoreTitleMatch(inputTitle: string, candidateTitle: string): number {
  const normalizedInput = normalizeBugTitle(inputTitle)
  const normalizedCandidate = normalizeBugTitle(candidateTitle)

  if (!normalizedInput || !normalizedCandidate) return 0
  if (normalizedInput === normalizedCandidate) return 1

  const inputTokens = new Set(tokenizeBugTitle(normalizedInput))
  const candidateTokens = new Set(tokenizeBugTitle(normalizedCandidate))

  if (inputTokens.size === 0 || candidateTokens.size === 0) {
    return normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate) ? 0.6 : 0
  }

  const sharedTokens = [...inputTokens].filter((token) => candidateTokens.has(token)).length
  if (sharedTokens === 0) return 0

  const overlap = sharedTokens / Math.max(inputTokens.size, candidateTokens.size)
  if (sharedTokens >= 2) return overlap
  return overlap >= 0.75 ? overlap : 0
}

function isMeaningfulTitleMatch(score: number): boolean {
  return score >= 0.45
}

export function isActiveBugStatus(status: BugStatus): boolean {
  return ACTIVE_BUG_STATUSES.includes(status as (typeof ACTIVE_BUG_STATUSES)[number])
}

export function isClosedBugStatus(status: BugStatus): boolean {
  return CLOSED_BUG_STATUSES.includes(status as (typeof CLOSED_BUG_STATUSES)[number])
}

export async function createBug(db: D1Database, input: CreateBugInput): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO bugs (
        title,
        title_normalized,
        description,
        steps,
        expected,
        actual,
        platform,
        severity,
        screenshot_url,
        status,
        reporter_id,
        related_bug_id,
        relationship_type,
        closed_reason,
        status_note,
        source_guild_id,
        source_channel_id,
        source_message_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.title,
      input.title_normalized,
      input.description,
      input.steps,
      input.expected,
      input.actual,
      input.platform ?? null,
      input.severity ?? null,
      input.screenshot_url ?? null,
      input.status ?? 'OPEN',
      input.reporter_id,
      input.related_bug_id ?? null,
      input.relationship_type ?? null,
      input.closed_reason ?? null,
      input.status_note ?? null,
      input.source_guild_id ?? null,
      input.source_channel_id ?? null,
      input.source_message_id ?? null
    )
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
  const row = await db.prepare(`SELECT ${bugColumns} FROM bugs b WHERE b.id = ?`).bind(bugId).first<Record<string, unknown>>()
  return row ? toBugRecord(row) : null
}

export async function listBugs(
  db: D1Database,
  status: 'open' | 'closed' | 'all',
  sort: 'top' | 'newest',
  options?: { reporterId?: string; limit?: number }
): Promise<BugSummary[]> {
  const whereClauses: string[] = []
  const bindValues: Array<string | number> = []

  if (status === 'open') {
    whereClauses.push(`b.status IN (${ACTIVE_BUG_STATUSES.map(() => '?').join(', ')})`)
    bindValues.push(...ACTIVE_BUG_STATUSES)
  } else if (status === 'closed') {
    whereClauses.push(`b.status IN (${CLOSED_BUG_STATUSES.map(() => '?').join(', ')})`)
    bindValues.push(...CLOSED_BUG_STATUSES)
  }

  if (options?.reporterId) {
    whereClauses.push(`b.reporter_id = ?`)
    bindValues.push(options.reporterId)
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const order = sort === 'top' ? 'ORDER BY b.votes_count DESC, b.created_at DESC' : 'ORDER BY b.created_at DESC'
  const limitClause = options?.limit ? 'LIMIT ?' : ''
  const stmt = db.prepare(`
    SELECT
      b.id,
      b.title,
      b.description,
      b.status,
      b.reporter_id,
      b.votes_count,
      b.duplicate_flags_count,
      b.channel_id,
      b.message_id,
      b.source_guild_id,
      b.source_channel_id,
      b.source_message_id,
      b.related_bug_id,
      b.relationship_type,
      b.closed_reason,
      b.status_note,
      b.created_at,
      COALESCE((
        SELECT COUNT(*)
        FROM bugs child
        WHERE child.related_bug_id = b.id AND child.relationship_type = 'DUPLICATE_OF'
      ), 0) AS linked_duplicates_count,
      COALESCE((
        SELECT COUNT(*)
        FROM bugs child
        WHERE child.related_bug_id = b.id AND child.relationship_type = 'REGRESSION_OF'
      ), 0) AS regressions_count,
      COALESCE((
        SELECT COUNT(*)
        FROM subscriptions s
        WHERE s.item_kind = 'bug' AND s.item_id = b.id
      ), 0) AS follower_count
    FROM bugs b
    ${where}
    ${order}
    ${limitClause}
  `)
  if (options?.limit) {
    bindValues.push(options.limit)
  }

  const result = await stmt.bind(...bindValues).all<Record<string, unknown>>()

  return (result.results ?? []).map(toBugSummary)
}

export async function deleteBug(db: D1Database, bugId: number): Promise<void> {
  await db.prepare(`DELETE FROM bugs WHERE id = ?`).bind(bugId).run()
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

export async function updateBugStatus(
  db: D1Database,
  bugId: number,
  status: BugStatus,
  options?: { closedReason?: BugClosedReason | null; statusNote?: string | null }
): Promise<void> {
  await db
    .prepare(`
      UPDATE bugs
      SET status = ?, closed_reason = ?, status_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(status, options?.closedReason ?? null, options?.statusNote ?? null, bugId)
    .run()
}

export async function setBugRelationship(
  db: D1Database,
  bugId: number,
  relatedBugId: number | null,
  relationshipType: BugRelationshipType | null
): Promise<void> {
  await db
    .prepare(`
      UPDATE bugs
      SET related_bug_id = ?, relationship_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(relatedBugId, relationshipType, bugId)
    .run()
}

export async function createBugPreflightSession(
  db: D1Database,
  input: {
    sessionId: string
    userId: string
    title: string
    titleNormalized: string
    sourceGuildId?: string | null
    sourceChannelId?: string | null
    sourceMessageId?: string | null
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT OR REPLACE INTO bug_preflight_sessions (
        session_id,
        user_id,
        title,
        title_normalized,
        source_guild_id,
        source_channel_id,
        source_message_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.sessionId,
      input.userId,
      input.title,
      input.titleNormalized,
      input.sourceGuildId ?? null,
      input.sourceChannelId ?? null,
      input.sourceMessageId ?? null
    )
    .run()
}

export async function getBugPreflightSession(db: D1Database, sessionId: string, userId: string): Promise<BugPreflightSession | null> {
  const row = await db
    .prepare(`
      SELECT session_id, user_id, title, title_normalized, source_guild_id, source_channel_id, source_message_id, created_at
      FROM bug_preflight_sessions
      WHERE session_id = ? AND user_id = ?
    `)
    .bind(sessionId, userId)
    .first<Record<string, unknown>>()

  if (!row) return null

  return {
    session_id: String(row.session_id),
    user_id: String(row.user_id),
    title: String(row.title),
    title_normalized: String(row.title_normalized),
    source_guild_id: row.source_guild_id ? String(row.source_guild_id) : null,
    source_channel_id: row.source_channel_id ? String(row.source_channel_id) : null,
    source_message_id: row.source_message_id ? String(row.source_message_id) : null,
    created_at: String(row.created_at)
  }
}

export async function findSimilarBugs(
  db: D1Database,
  title: string,
  options?: { excludeBugId?: number }
): Promise<{ duplicates: BugPreflightMatch[]; regressions: BugPreflightMatch[] }> {
  const result = await db
    .prepare(`
      SELECT id, title, title_normalized, status, relationship_type, created_at
      FROM bugs
      WHERE relationship_type IS NULL OR relationship_type != 'DUPLICATE_OF'
      ORDER BY created_at DESC
      LIMIT 250
    `)
    .all<Record<string, unknown>>()

  const matches = (result.results ?? [])
    .map((row) => ({
      id: Number(row.id),
      title: String(row.title),
      status: row.status as BugStatus,
      created_at: String(row.created_at),
      score: scoreTitleMatch(title, String(row.title_normalized || row.title))
    }))
    .filter((row) => row.id !== options?.excludeBugId)
    .filter((row) => isMeaningfulTitleMatch(row.score))
    .sort((left, right) => right.score - left.score || right.created_at.localeCompare(left.created_at))

  const duplicates: BugPreflightMatch[] = []
  const regressions: BugPreflightMatch[] = []

  for (const match of matches) {
    if (duplicates.length < 3 && isActiveBugStatus(match.status)) {
      duplicates.push({ id: match.id, title: match.title, status: match.status })
      continue
    }

    if (regressions.length < 2 && isClosedBugStatus(match.status)) {
      regressions.push({ id: match.id, title: match.title, status: match.status })
    }
  }

  return { duplicates, regressions }
}

export async function searchBugs(db: D1Database, query: string, limit = 8): Promise<BugSummary[]> {
  const normalized = normalizeBugTitle(query)
  if (!normalized) return []

  const result = await db
    .prepare(`
      SELECT
        b.id,
        b.title,
        b.description,
        b.status,
        b.reporter_id,
        b.votes_count,
        b.duplicate_flags_count,
        b.channel_id,
        b.message_id,
        b.source_guild_id,
        b.source_channel_id,
        b.source_message_id,
        b.related_bug_id,
        b.relationship_type,
        b.closed_reason,
        b.status_note,
        b.created_at,
        COALESCE((
          SELECT COUNT(*)
          FROM bugs child
          WHERE child.related_bug_id = b.id AND child.relationship_type = 'DUPLICATE_OF'
        ), 0) AS linked_duplicates_count,
        COALESCE((
          SELECT COUNT(*)
          FROM bugs child
          WHERE child.related_bug_id = b.id AND child.relationship_type = 'REGRESSION_OF'
        ), 0) AS regressions_count,
        COALESCE((
          SELECT COUNT(*)
          FROM subscriptions s
          WHERE s.item_kind = 'bug' AND s.item_id = b.id
        ), 0) AS follower_count
      FROM bugs b
      WHERE b.title_normalized LIKE ? OR lower(b.description) LIKE ?
      ORDER BY b.votes_count DESC, b.created_at DESC
      LIMIT ?
    `)
    .bind(`%${normalized}%`, `%${query.trim().toLowerCase()}%`, limit)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toBugSummary)
}

export async function resolveCanonicalBugId(db: D1Database, bugId: number): Promise<number> {
  const bug = await getBugById(db, bugId)
  if (bug?.relationship_type === 'DUPLICATE_OF' && bug.related_bug_id) {
    return bug.related_bug_id
  }

  return bugId
}
