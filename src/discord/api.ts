import type { Env } from '../types'

interface DiscordCommandRegistration {
  name: string
  description: string
  type?: number
}

interface DiscordMessagePayload {
  embeds: unknown[]
  components: unknown[]
}

export class DiscordApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message)
  }
}

async function discordRequest<T>(env: Env, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new DiscordApiError(`Discord API request failed for ${path}`, response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function registerCommands(env: Env): Promise<void> {
  const commands: DiscordCommandRegistration[] = [
    { name: 'bug', description: 'Report a bug using a modal' },
    { name: 'topbugs', description: 'List the highest voted open bugs' }
  ]

  const guildPath = env.DISCORD_DEV_GUILD_ID
    ? `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_DEV_GUILD_ID}/commands`
    : `/applications/${env.DISCORD_APPLICATION_ID}/commands`

  await discordRequest(env, guildPath, { method: 'PUT', body: JSON.stringify(commands) })
}

export async function createChannelMessage(env: Env, channelId: string, payload: DiscordMessagePayload): Promise<{ id: string; channel_id: string }> {
  return discordRequest(env, `/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
}

export async function editChannelMessage(env: Env, channelId: string, messageId: string, payload: DiscordMessagePayload): Promise<void> {
  await discordRequest(env, `/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
