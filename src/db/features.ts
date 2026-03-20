import type { CreateFeatureInput, FeatureRecord, FeatureStatus, FeatureSummary } from '../types'

const ACTIVE_FEATURE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS'] as const
const RESOLVED_FEATURE_STATUSES = ['SHIPPED', 'DECLINED', 'CLOSED'] as const

function toFeatureRecord(row: Record<string, unknown>): FeatureRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    benefit: String(row.benefit),
    screenshot_url: row.screenshot_url ? String(row.screenshot_url) : null,
    status: row.status as FeatureStatus,
    reporter_id: String(row.reporter_id),
    votes_count: Number(row.votes_count),
    channel_id: row.channel_id ? String(row.channel_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    source_guild_id: row.source_guild_id ? String(row.source_guild_id) : null,
    source_channel_id: row.source_channel_id ? String(row.source_channel_id) : null,
    source_message_id: row.source_message_id ? String(row.source_message_id) : null,
    status_note: row.status_note ? String(row.status_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }
}

function toFeatureSummary(row: Record<string, unknown>): FeatureSummary {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    status: row.status as FeatureStatus,
    reporter_id: String(row.reporter_id ?? ''),
    votes_count: Number(row.votes_count),
    screenshot_url: row.screenshot_url ? String(row.screenshot_url) : null,
    channel_id: row.channel_id ? String(row.channel_id) : null,
    message_id: row.message_id ? String(row.message_id) : null,
    source_guild_id: row.source_guild_id ? String(row.source_guild_id) : null,
    source_channel_id: row.source_channel_id ? String(row.source_channel_id) : null,
    source_message_id: row.source_message_id ? String(row.source_message_id) : null,
    status_note: row.status_note ? String(row.status_note) : null,
    follower_count: Number(row.follower_count ?? 0),
    created_at: String(row.created_at)
  }
}

export async function createFeature(
  db: D1Database,
  input: CreateFeatureInput
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO features (
        title,
        description,
        benefit,
        screenshot_url,
        status,
        reporter_id,
        source_guild_id,
        source_channel_id,
        source_message_id,
        status_note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.title,
      input.description,
      input.benefit,
      input.screenshot_url ?? null,
      input.status ?? 'OPEN',
      input.reporter_id,
      input.source_guild_id ?? null,
      input.source_channel_id ?? null,
      input.source_message_id ?? null,
      input.status_note ?? null
    )
    .run()

  return Number(result.meta.last_row_id)
}

export async function getFeatureById(db: D1Database, featureId: number): Promise<FeatureRecord | null> {
  const row = await db
    .prepare(`
      SELECT
        id,
        title,
        description,
        benefit,
        screenshot_url,
        status,
        reporter_id,
        votes_count,
        channel_id,
        message_id,
        source_guild_id,
        source_channel_id,
        source_message_id,
        status_note,
        created_at,
        updated_at
      FROM features
      WHERE id = ?
    `)
    .bind(featureId)
    .first<Record<string, unknown>>()

  return row ? toFeatureRecord(row) : null
}

export async function listFeatures(
  db: D1Database,
  options?: { status?: 'active' | 'resolved' | 'all'; sort?: 'top' | 'newest'; limit?: number; reporterId?: string }
): Promise<FeatureSummary[]> {
  const status = options?.status ?? 'active'
  const sort = options?.sort ?? 'top'
  const limit = options?.limit ?? 6
  const whereClauses: string[] = []
  const bindValues: Array<string | number> = []

  if (status === 'active') {
    whereClauses.push(`status IN (${ACTIVE_FEATURE_STATUSES.map(() => '?').join(', ')})`)
    bindValues.push(...ACTIVE_FEATURE_STATUSES)
  } else if (status === 'resolved') {
    whereClauses.push(`status IN (${RESOLVED_FEATURE_STATUSES.map(() => '?').join(', ')})`)
    bindValues.push(...RESOLVED_FEATURE_STATUSES)
  }

  if (options?.reporterId) {
    whereClauses.push(`reporter_id = ?`)
    bindValues.push(options.reporterId)
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const order = sort === 'top' ? 'ORDER BY votes_count DESC, created_at DESC' : 'ORDER BY created_at DESC'
  const result = await db
    .prepare(`
      SELECT
        id,
        title,
        description,
        status,
        reporter_id,
        votes_count,
        screenshot_url,
        channel_id,
        message_id,
        source_guild_id,
        source_channel_id,
        source_message_id,
        status_note,
        created_at,
        COALESCE((
          SELECT COUNT(*)
          FROM subscriptions s
          WHERE s.item_kind = 'feature' AND s.item_id = features.id
        ), 0) AS follower_count
      FROM features
      ${where}
      ${order}
      LIMIT ?
    `)
    .bind(...bindValues, limit)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toFeatureSummary)
}

export async function updateFeatureStatus(
  db: D1Database,
  featureId: number,
  status: FeatureStatus,
  options?: { statusNote?: string | null }
): Promise<void> {
  await db
    .prepare(`UPDATE features SET status = ?, status_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(status, options?.statusNote ?? null, featureId)
    .run()
}

export async function deleteFeature(db: D1Database, featureId: number): Promise<void> {
  await db.prepare(`DELETE FROM features WHERE id = ?`).bind(featureId).run()
}

export async function addFeatureVote(db: D1Database, featureId: number, userId: string): Promise<'added' | 'duplicate'> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO feature_votes (feature_id, user_id) VALUES (?, ?)`)
    .bind(featureId, userId)
    .run()

  if ((result.meta.changes ?? 0) === 0) return 'duplicate'

  await db.prepare(`UPDATE features SET votes_count = votes_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(featureId).run()
  return 'added'
}

export async function setFeatureMessageMetadata(db: D1Database, featureId: number, channelId: string, messageId: string): Promise<void> {
  await db
    .prepare(`UPDATE features SET channel_id = ?, message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(channelId, messageId, featureId)
    .run()
}

export async function findFeaturesByIds(db: D1Database, featureIds: number[]): Promise<FeatureRecord[]> {
  if (featureIds.length === 0) return []

  const placeholders = featureIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`
      SELECT
        id,
        title,
        description,
        benefit,
        screenshot_url,
        status,
        reporter_id,
        votes_count,
        channel_id,
        message_id,
        source_guild_id,
        source_channel_id,
        source_message_id,
        status_note,
        created_at,
        updated_at
      FROM features
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `)
    .bind(...featureIds)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toFeatureRecord)
}

export async function searchFeatures(db: D1Database, query: string, limit = 8): Promise<FeatureSummary[]> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const result = await db
    .prepare(`
      SELECT
        id,
        title,
        description,
        status,
        reporter_id,
        votes_count,
        screenshot_url,
        channel_id,
        message_id,
        source_guild_id,
        source_channel_id,
        source_message_id,
        status_note,
        created_at,
        COALESCE((
          SELECT COUNT(*)
          FROM subscriptions s
          WHERE s.item_kind = 'feature' AND s.item_id = features.id
        ), 0) AS follower_count
      FROM features
      WHERE lower(title) LIKE ? OR lower(description) LIKE ?
      ORDER BY votes_count DESC, created_at DESC
      LIMIT ?
    `)
    .bind(`%${normalized}%`, `%${normalized}%`, limit)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toFeatureSummary)
}
