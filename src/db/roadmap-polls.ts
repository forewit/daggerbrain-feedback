import type { RoadmapPollRecord } from '../types'

function toRoadmapPollRecord(row: Record<string, unknown>): RoadmapPollRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    channel_id: String(row.channel_id),
    message_id: String(row.message_id),
    feature_ids: String(row.feature_ids),
    created_by: String(row.created_by),
    created_at: String(row.created_at)
  }
}

export async function createRoadmapPoll(
  db: D1Database,
  input: { title: string; channelId: string; messageId: string; featureIds: number[]; createdBy: string }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO roadmap_polls (title, channel_id, message_id, feature_ids, created_by)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(input.title, input.channelId, input.messageId, JSON.stringify(input.featureIds), input.createdBy)
    .run()

  return Number(result.meta.last_row_id)
}

export async function listRoadmapPolls(db: D1Database, limit = 10): Promise<RoadmapPollRecord[]> {
  const result = await db
    .prepare(`
      SELECT id, title, channel_id, message_id, feature_ids, created_by, created_at
      FROM roadmap_polls
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toRoadmapPollRecord)
}
