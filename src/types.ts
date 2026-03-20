export type BugStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'FIXED' | 'CLOSED' | 'DUPLICATE'
export type BugRelationshipType = 'DUPLICATE_OF' | 'REGRESSION_OF'
export type BugClosedReason = 'DUPLICATE' | 'RESOLVED' | 'OTHER'
export type FeatureStatus = 'OPEN' | 'UNDER_REVIEW' | 'PLANNED' | 'IN_PROGRESS' | 'SHIPPED' | 'DECLINED' | 'CLOSED'
export type BugPlatform = 'WEB' | 'IOS' | 'ANDROID' | 'DESKTOP' | 'OTHER'
export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SubscriptionItemKind = 'bug' | 'feature'

export interface Env {
  DB: D1Database
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_TOKEN: string
  DISCORD_CLIENT_SECRET?: string
  BUG_REPORT_CHANNEL_ID: string
  FEATURE_CHANNEL_ID: string
  PUBLIC_APP_URL?: string
  DISCORD_MOD_ROLE_IDS?: string
  DISCORD_DEV_GUILD_ID?: string
  DISCORD_GUILD_ID?: string
  COOKIE_SECRET?: string
  COMMANDS_REGISTER_SECRET?: string
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
  source_guild_id: string | null
  source_channel_id: string | null
  source_message_id: string | null
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
  description: string
  status: BugStatus
  reporter_id: string
  votes_count: number
  duplicate_flags_count: number
  linked_duplicates_count: number
  regressions_count: number
  channel_id?: string | null
  message_id?: string | null
  message_url?: string | null
  source_guild_id?: string | null
  source_channel_id?: string | null
  source_message_id?: string | null
  source_message_url?: string | null
  related_bug_id: number | null
  relationship_type: BugRelationshipType | null
  closed_reason: BugClosedReason | null
  status_note: string | null
  follower_count?: number
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
  source_guild_id?: string | null
  source_channel_id?: string | null
  source_message_id?: string | null
}

export interface BugPreflightSession {
  session_id: string
  user_id: string
  title: string
  title_normalized: string
  source_guild_id: string | null
  source_channel_id: string | null
  source_message_id: string | null
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
  source_guild_id: string | null
  source_channel_id: string | null
  source_message_id: string | null
  status_note: string | null
  created_at: string
  updated_at: string
}

export interface FeatureSummary {
  id: number
  title: string
  description: string
  status: FeatureStatus
  reporter_id: string
  votes_count: number
  screenshot_url: string | null
  channel_id?: string | null
  message_id?: string | null
  message_url?: string | null
  source_guild_id?: string | null
  source_channel_id?: string | null
  source_message_id?: string | null
  source_message_url?: string | null
  status_note?: string | null
  follower_count?: number
  created_at: string
}

export interface CreateFeatureInput {
  title: string
  description: string
  benefit: string
  screenshot_url?: string | null
  reporter_id: string
  status?: FeatureStatus
  status_note?: string | null
  source_guild_id?: string | null
  source_channel_id?: string | null
  source_message_id?: string | null
}

export interface ItemSubscription {
  item_kind: SubscriptionItemKind
  item_id: number
  user_id: string
  created_at: string
}

export interface RoadmapPollRecord {
  id: number
  title: string
  channel_id: string
  message_id: string
  feature_ids: string
  created_by: string
  created_at: string
}
