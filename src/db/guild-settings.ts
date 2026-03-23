import type { GuildFeedbackSettings } from '../types'

function toGuildFeedbackSettings(row: Record<string, unknown>): GuildFeedbackSettings {
  return {
    guild_id: String(row.guild_id),
    bug_report_channel_id: row.bug_report_channel_id ? String(row.bug_report_channel_id) : null,
    feature_channel_id: row.feature_channel_id ? String(row.feature_channel_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }
}

export async function getGuildFeedbackSettings(
  db: D1Database,
  guildId: string
): Promise<GuildFeedbackSettings | null> {
  const row = await db
    .prepare(`
      SELECT
        guild_id,
        bug_report_channel_id,
        feature_channel_id,
        created_at,
        updated_at
      FROM guild_feedback_settings
      WHERE guild_id = ?
    `)
    .bind(guildId)
    .first<Record<string, unknown>>()

  return row ? toGuildFeedbackSettings(row) : null
}

export async function upsertGuildFeedbackSettings(
  db: D1Database,
  guildId: string,
  input: { bugReportChannelId: string | null; featureChannelId: string | null }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO guild_feedback_settings (
        guild_id,
        bug_report_channel_id,
        feature_channel_id
      )
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        bug_report_channel_id = excluded.bug_report_channel_id,
        feature_channel_id = excluded.feature_channel_id,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(guildId, input.bugReportChannelId, input.featureChannelId)
    .run()
}
