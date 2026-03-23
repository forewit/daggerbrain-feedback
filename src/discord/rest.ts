import {
  Routes,
  type APIChannel,
  type RESTPatchAPIChannelJSONBody,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPostAPIGuildForumThreadsJSONBody,
  type RESTPutAPIApplicationCommandsJSONBody
} from 'discord-api-types/v10'
import type { Env } from '../types'
import { buildApplicationCommands } from './commands'

type JsonBody =
  | RESTPatchAPIChannelJSONBody
  | RESTPatchAPIChannelMessageJSONBody
  | RESTPostAPIChannelMessageJSONBody
  | RESTPostAPIGuildForumThreadsJSONBody
  | RESTPutAPIApplicationCommandsJSONBody

export interface DiscordRequestContext {
  route: string
  method: string
  payloadSummary?: Record<string, unknown>
}

export class DiscordApiError extends Error {
  readonly discordCode: number | null

  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly context: DiscordRequestContext
  ) {
    super(message)
    this.discordCode = parseDiscordApiCode(body)
  }
}

function parseDiscordApiCode(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { code?: unknown }
    return typeof parsed.code === 'number' ? parsed.code : null
  } catch {
    return null
  }
}

function summarizePayload(body: JsonBody | undefined): Record<string, unknown> | undefined {
  if (!body) return undefined

  const summary: Record<string, unknown> = {}

  if ('name' in body && typeof body.name === 'string') summary.name = body.name
  if ('content' in body && typeof body.content === 'string') summary.content_length = body.content.length
  if ('embeds' in body && Array.isArray(body.embeds)) summary.embed_count = body.embeds.length
  if ('components' in body && Array.isArray(body.components)) summary.component_count = body.components.length
  if ('flags' in body && typeof body.flags === 'number') summary.flags = body.flags
  if ('applied_tags' in body && Array.isArray(body.applied_tags)) summary.applied_tag_count = body.applied_tags.length
  if ('poll' in body && body.poll) summary.has_poll = true

  if ('components' in body && Array.isArray(body.components)) {
    const actionRows = body.components.filter(
      (component): component is { type: number; components?: Array<{ style?: number; label?: string; url?: string }> } =>
        Boolean(component) && typeof component === 'object' && 'type' in component && (component as { type?: unknown }).type === 1
    )
    const linkButtons = actionRows.flatMap((row) => (row.components ?? []).filter((component) => component.style === 5))
    summary.link_button_count = linkButtons.length
    if (linkButtons.length > 0) {
      summary.link_button_labels = linkButtons.map((button) => button.label ?? null)
      summary.link_button_urls = linkButtons.map((button) => button.url ?? null)
    }
  }

  return summary
}

async function discordRequest<T>(env: Env, route: string, method: string, body?: JsonBody): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  if (!response.ok) {
    const rawBody = await response.text()
    throw new DiscordApiError(`Discord API request failed for ${route}`, response.status, rawBody, {
      route,
      method,
      payloadSummary: summarizePayload(body)
    })
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export type DiscordChannelRecord = Pick<APIChannel, 'id' | 'type' | 'name' | 'flags'> & {
  guild_id?: string
  parent_id?: string
  available_tags?: Array<{ id: string; name: string; moderated?: boolean }>
  applied_tags?: string[]
}

export type DiscordGuildMemberRecord = { user?: { id: string }; roles?: string[] }

export class DiscordRestClient {
  constructor(private readonly env: Env) {}

  async registerCommands(): Promise<void> {
    const manageMessagesPermission = String(1n << 13n)
    const commands = buildApplicationCommands(manageMessagesPermission)
    const route = this.env.DISCORD_DEV_GUILD_ID
      ? Routes.applicationGuildCommands(this.env.DISCORD_APPLICATION_ID, this.env.DISCORD_DEV_GUILD_ID)
      : Routes.applicationCommands(this.env.DISCORD_APPLICATION_ID)

    await discordRequest<unknown>(this.env, route, 'PUT', commands)
  }

  async getChannel(channelId: string): Promise<DiscordChannelRecord> {
    return discordRequest<DiscordChannelRecord>(this.env, Routes.channel(channelId), 'GET')
  }

  async createMessage(channelId: string, payload: RESTPostAPIChannelMessageJSONBody): Promise<{ id: string; channel_id: string }> {
    console.log('discord.create_message', { channelId, payloadSummary: summarizePayload(payload) })
    return discordRequest<{ id: string; channel_id: string }>(this.env, Routes.channelMessages(channelId), 'POST', payload)
  }

  async createForumThread(
    channelId: string,
    payload: RESTPostAPIGuildForumThreadsJSONBody
  ): Promise<{ channel_id: string; id: string }> {
    const thread = await discordRequest<{ id: string; message?: { id: string } }>(this.env, Routes.threads(channelId), 'POST', payload)

    return {
      channel_id: thread.id,
      id: thread.message?.id ?? thread.id
    }
  }

  async editMessage(channelId: string, messageId: string, payload: RESTPatchAPIChannelMessageJSONBody): Promise<void> {
    console.log('discord.edit_message', { channelId, messageId, payloadSummary: summarizePayload(payload as JsonBody) })
    await discordRequest<unknown>(this.env, Routes.channelMessage(channelId, messageId), 'PATCH', payload)
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    console.log('discord.delete_message', { channelId, messageId })
    await discordRequest<unknown>(this.env, Routes.channelMessage(channelId, messageId), 'DELETE')
  }

  async deleteChannel(channelId: string): Promise<void> {
    console.log('discord.delete_channel', { channelId })
    await discordRequest<unknown>(this.env, Routes.channel(channelId), 'DELETE')
  }

  async updateThreadTags(channelId: string, appliedTags: string[]): Promise<void> {
    await discordRequest<unknown>(this.env, Routes.channel(channelId), 'PATCH', {
      applied_tags: appliedTags
    })
  }

  async createDmChannel(userId: string): Promise<{ id: string }> {
    return discordRequest<{ id: string }>(this.env, '/users/@me/channels', 'POST', {
      recipient_id: userId
    } as unknown as RESTPatchAPIChannelJSONBody)
  }

  async getGuildMember(guildId: string, userId: string): Promise<DiscordGuildMemberRecord> {
    return discordRequest<DiscordGuildMemberRecord>(this.env, Routes.guildMember(guildId, userId), 'GET')
  }
}
