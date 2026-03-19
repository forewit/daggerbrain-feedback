import type { Env } from '../types'

interface DiscordCommandOptionChoice {
  name: string
  value: string | number
}

interface DiscordCommandOption {
  type: number
  name: string
  description: string
  required?: boolean
  choices?: DiscordCommandOptionChoice[]
}

interface DiscordCommandRegistration {
  name: string
  description: string
  type?: number
  options?: DiscordCommandOption[]
  default_member_permissions?: string
}

export interface DiscordMessagePayload {
  content?: string
  embeds?: unknown[]
  components?: unknown[]
  flags?: number
  allowed_mentions?: {
    parse?: string[]
    users?: string[]
    roles?: string[]
  }
}

export interface DiscordForumTag {
  id: string
  name: string
  moderated?: boolean
}

export interface DiscordChannel {
  id: string
  type: number
  name?: string
  flags?: number
  parent_id?: string
  available_tags?: DiscordForumTag[]
  applied_tags?: string[]
}

interface DiscordForumThreadResponse {
  id: string
  message?: { id: string }
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
  const manageMessagesPermission = String(1n << 13n)
  const commands: DiscordCommandRegistration[] = [
    {
      name: 'bug',
      description: 'Report a bug',
      options: [
        {
          type: 3,
          name: 'title',
          description: 'Short summary of the bug'
        },
        {
          type: 3,
          name: 'description',
          description: 'What happened?'
        },
        {
          type: 3,
          name: 'steps',
          description: 'Steps to reproduce'
        },
        {
          type: 3,
          name: 'expected',
          description: 'Expected behavior'
        },
        {
          type: 3,
          name: 'actual',
          description: 'Actual behavior'
        }
      ]
    },
    {
      name: 'feature',
      description: 'Request a feature',
      options: [
        {
          type: 3,
          name: 'title',
          description: 'Short summary of the feature'
        },
        {
          type: 3,
          name: 'description',
          description: 'What do you want?'
        }
      ]
    },
    { name: 'topbugs', description: 'List the highest voted open bugs' },
    {
      name: 'bug-status',
      description: 'Update the status for an existing bug',
      default_member_permissions: manageMessagesPermission,
      options: [
        {
          type: 4,
          name: 'bug_id',
          description: 'Bug ID to update',
          required: true
        },
        {
          type: 3,
          name: 'status',
          description: 'New status',
          required: true,
          choices: [
            { name: 'OPEN', value: 'OPEN' },
            { name: 'IN_PROGRESS', value: 'IN_PROGRESS' },
            { name: 'FIXED', value: 'FIXED' },
            { name: 'CLOSED', value: 'CLOSED' },
            { name: 'DUPLICATE', value: 'DUPLICATE' }
          ]
        }
      ]
    },
    {
      name: 'bug-link',
      description: 'Link a bug as a duplicate or regression of another bug',
      default_member_permissions: manageMessagesPermission,
      options: [
        {
          type: 4,
          name: 'bug_id',
          description: 'Bug ID to update',
          required: true
        },
        {
          type: 4,
          name: 'target_bug_id',
          description: 'Target bug ID',
          required: true
        },
        {
          type: 3,
          name: 'relation',
          description: 'How this bug relates to the target',
          required: true,
          choices: [
            { name: 'duplicate', value: 'duplicate' },
            { name: 'regression', value: 'regression' }
          ]
        }
      ]
    }
  ]

  const guildPath = env.DISCORD_DEV_GUILD_ID
    ? `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_DEV_GUILD_ID}/commands`
    : `/applications/${env.DISCORD_APPLICATION_ID}/commands`

  await discordRequest(env, guildPath, { method: 'PUT', body: JSON.stringify(commands) })
}

export async function getChannel(env: Env, channelId: string): Promise<DiscordChannel> {
  return discordRequest(env, `/channels/${channelId}`, { method: 'GET' })
}

export async function createChannelMessage(env: Env, channelId: string, payload: DiscordMessagePayload): Promise<{ id: string; channel_id: string }> {
  return discordRequest(env, `/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
}

export async function createForumThreadMessage(
  env: Env,
  channelId: string,
  name: string,
  payload: DiscordMessagePayload,
  options?: { appliedTags?: string[] }
): Promise<{ channel_id: string; id: string }> {
  const thread = await discordRequest<DiscordForumThreadResponse>(env, `/channels/${channelId}/threads`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      message: payload,
      applied_tags: options?.appliedTags
    })
  })

  return {
    channel_id: thread.id,
    id: thread.message?.id ?? thread.id
  }
}

export async function editChannelMessage(env: Env, channelId: string, messageId: string, payload: DiscordMessagePayload): Promise<void> {
  await discordRequest(env, `/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export async function updateThreadAppliedTags(env: Env, channelId: string, appliedTags: string[]): Promise<void> {
  await discordRequest(env, `/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify({ applied_tags: appliedTags })
  })
}
