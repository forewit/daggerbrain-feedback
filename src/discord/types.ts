export interface DiscordUser {
  id: string
}

export interface DiscordAttachment {
  id: string
  filename: string
  content_type?: string
  url: string
  proxy_url?: string
}

export interface DiscordMember {
  user?: DiscordUser
  permissions?: string
  roles?: string[]
}

export interface DiscordResolvedData {
  attachments?: Record<string, DiscordAttachment>
}

export interface DiscordModalComponentValue {
  type: number
  custom_id?: string
  value?: string
  values?: string[]
  component?: DiscordModalComponentValue
  components?: DiscordModalComponentValue[]
}

export interface DiscordModalValue {
  type: number
  custom_id?: string
  value?: string
  values?: string[]
  component?: DiscordModalComponentValue
  components?: DiscordModalComponentValue[]
}

export interface DiscordInteractionDataOption {
  name: string
  type: number
  value?: string | number | boolean
  options?: DiscordInteractionDataOption[]
}

export interface DiscordInteraction {
  type: number
  id: string
  token: string
  data?: {
    name?: string
    custom_id?: string
    component_type?: number
    values?: string[]
    components?: DiscordModalValue[]
    resolved?: DiscordResolvedData
    options?: DiscordInteractionDataOption[]
  }
  member?: DiscordMember
  user?: DiscordUser
}

export interface DiscordInteractionResponse {
  type: number
  data?: Record<string, unknown>
}
