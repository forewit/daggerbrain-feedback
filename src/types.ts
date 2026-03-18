export type BugStatus = 'OPEN' | 'CLOSED'

export interface Env {
  DB: D1Database
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_TOKEN: string
  BUG_REPORT_CHANNEL_ID: string
  DISCORD_MOD_ROLE_IDS?: string
  DISCORD_DEV_GUILD_ID?: string
}

export interface BugRecord {
  id: number
  title: string
  description: string
  steps: string
  expected: string
  actual: string
  status: BugStatus
  reporter_id: string
  votes_count: number
  duplicate_flags_count: number
  channel_id: string | null
  message_id: string | null
  created_at: string
  updated_at: string
}

export interface BugSummary {
  id: number
  title: string
  status: BugStatus
  votes_count: number
  duplicate_flags_count: number
  created_at: string
}
