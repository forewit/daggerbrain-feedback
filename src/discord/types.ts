export interface DiscordUser {
  id: string
}

export interface DiscordMember {
  user?: DiscordUser
  permissions?: string
  roles?: string[]
}

export interface DiscordModalValue {
  type: number
  components: Array<{ type: number; custom_id: string; value: string }>
}

export interface DiscordInteraction {
  type: number
  id: string
  token: string
  data?: {
    name?: string
    custom_id?: string
    components?: DiscordModalValue[]
  }
  member?: DiscordMember
  user?: DiscordUser
}

export interface DiscordInteractionResponse {
  type: number
  data?: Record<string, unknown>
}
