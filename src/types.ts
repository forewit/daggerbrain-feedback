export type BugStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'CLOSED' | 'DUPLICATE'
export type BugRelationshipType = 'DUPLICATE_OF' | 'REGRESSION_OF'
export type BugClosedReason = 'DUPLICATE' | 'RESOLVED' | 'OTHER'
export type FeatureStatus = 'OPEN' | 'PLANNED' | 'SHIPPED' | 'CLOSED'
export type BugPlatform = 'WEB' | 'IOS' | 'ANDROID' | 'DESKTOP' | 'OTHER'
export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface Env {
  DB: D1Database
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_TOKEN: string
  BUG_REPORT_CHANNEL_ID: string
  FEATURE_CHANNEL_ID: string
  PUBLIC_APP_URL?: string
  DISCORD_MOD_ROLE_IDS?: string
  DISCORD_DEV_GUILD_ID?: string
  DISCORD_GUILD_ID?: string
}

export interface BugRecord {
  id: number
  title: string
  title_normalized: string
  description: string
  steps: string
  expected: string
  actual: string
  platform: BugPlatform | null
  severity: BugSeverity | null
  screenshot_url: string | null
  status: BugStatus
  reporter_id: string
  votes_count: number
  duplicate_flags_count: number
  linked_duplicates_count: number
  regressions_count: number
  channel_id: string | null
  message_id: string | null
  related_bug_id: number | null
  relationship_type: BugRelationshipType | null
  closed_reason: BugClosedReason | null
  status_note: string | null
  created_at: string
  updated_at: string
}

export interface BugSummary {
  id: number
  title: string
  status: BugStatus
  votes_count: number
  duplicate_flags_count: number
  linked_duplicates_count: number
  regressions_count: number
  related_bug_id: number | null
  relationship_type: BugRelationshipType | null
  closed_reason: BugClosedReason | null
  status_note: string | null
  created_at: string
}

export interface CreateBugInput {
  title: string
  description: string
  steps: string
  expected: string
  actual: string
  platform?: BugPlatform | null
  severity?: BugSeverity | null
  screenshot_url?: string | null
  reporter_id: string
  title_normalized: string
  status?: BugStatus
  related_bug_id?: number | null
  relationship_type?: BugRelationshipType | null
  closed_reason?: BugClosedReason | null
  status_note?: string | null
}

export interface BugPreflightSession {
  session_id: string
  user_id: string
  title: string
  title_normalized: string
  created_at: string
}

export interface BugPreflightMatch {
  id: number
  title: string
  status: BugStatus
}

export interface FeatureRecord {
  id: number
  title: string
  description: string
  benefit: string
  screenshot_url: string | null
  status: FeatureStatus
  reporter_id: string
  votes_count: number
  channel_id: string | null
  message_id: string | null
  created_at: string
  updated_at: string
}
