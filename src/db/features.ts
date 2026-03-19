import type { FeatureRecord, FeatureStatus } from '../types'

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
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }
}

export async function createFeature(
  db: D1Database,
  input: { title: string; description: string; benefit: string; screenshot_url?: string | null; reporter_id: string; status?: FeatureStatus }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO features (title, description, benefit, screenshot_url, status, reporter_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(input.title, input.description, input.benefit, input.screenshot_url ?? null, input.status ?? 'OPEN', input.reporter_id)
    .run()

  return Number(result.meta.last_row_id)
}

export async function getFeatureById(db: D1Database, featureId: number): Promise<FeatureRecord | null> {
  const row = await db
    .prepare(`
      SELECT id, title, description, benefit, screenshot_url, status, reporter_id, votes_count, channel_id, message_id, created_at, updated_at
      FROM features
      WHERE id = ?
    `)
    .bind(featureId)
    .first<Record<string, unknown>>()

  return row ? toFeatureRecord(row) : null
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
