import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComponentType, InteractionResponseType, MessageFlags } from 'discord-api-types/v10'
import nacl from 'tweetnacl'
import { buildApplicationCommands } from '../src/discord/commands'
import {
  buildBugModalCustomId,
  buildDuplicateSelectionCustomId,
  buildPreflightCustomId,
  getCommandOptionInteger,
  getCommandOptionString,
  getModalFieldValues,
  getModalUploadedAttachmentUrl,
  hasAnyRole,
  hasManageMessagesPermission,
  parseBugAction,
  parseBugModalCustomId,
  parseDuplicateSelectionCustomId,
  parseFeatureUpvote,
  parsePreflightCustomId,
  verifyDiscordRequest
} from '../src/discord/interactions'
import {
  bugModalResponse,
  featureModalResponse,
  renderBugMessage,
  renderFeatureMessage
} from '../src/discord/messages'
import { DiscordApiError, DiscordRestClient } from '../src/discord/rest'
import { normalizeBugTitle } from '../src/db/bugs'
import { bugSubmissionSchema } from '../src/validation'
import { renderDashboardPage } from '../src/ui/dashboard'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const env = {
  DB: {} as D1Database,
  DISCORD_PUBLIC_KEY: 'pk',
  DISCORD_APPLICATION_ID: 'app-id',
  DISCORD_TOKEN: 'token',
  BUG_REPORT_CHANNEL_ID: 'bug-channel',
  FEATURE_CHANNEL_ID: 'feature-channel'
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('custom id helpers', () => {
  it('parses known action custom ids', () => {
    expect(parseBugAction('upvote:12')).toEqual({ action: 'upvote', bugId: 12 })
    expect(parseBugAction('duplicate:7')).toEqual({ action: 'duplicate', bugId: 7 })
    expect(parseFeatureUpvote('feature:upvote:12')).toEqual({ featureId: 12 })
  })

  it('round-trips modal and preflight state', () => {
    const modalId = buildBugModalCustomId('session-1', 'DUPLICATE_OF', 42)
    expect(parseBugModalCustomId(modalId)).toEqual({
      sessionId: 'session-1',
      relationshipType: 'DUPLICATE_OF',
      targetBugId: 42
    })

    const preflightId = buildPreflightCustomId('session-2', 'REGRESSION_OF', 5)
    expect(parsePreflightCustomId(preflightId)).toEqual({
      sessionId: 'session-2',
      relationshipType: 'REGRESSION_OF',
      targetBugId: 5
    })

    const duplicateId = buildDuplicateSelectionCustomId(7, 42)
    expect(parseDuplicateSelectionCustomId(duplicateId)).toEqual({
      sourceBugId: 7,
      targetBugId: 42
    })
  })
})

describe('authorization helpers', () => {
  it('detects configured roles', () => {
    expect(hasAnyRole(['a', 'b'], 'x,b')).toBe(true)
    expect(hasAnyRole(['a'], 'x,y')).toBe(false)
  })

  it('detects manage messages permission', () => {
    expect(hasManageMessagesPermission(String(1n << 13n))).toBe(true)
    expect(hasManageMessagesPermission('0')).toBe(false)
  })
})

describe('command helpers', () => {
  it('reads string and integer command options', () => {
    expect(
      getCommandOptionString(
        {
          type: 2,
          id: '1',
          application_id: 'app',
          token: 'token',
          version: 1,
          data: {
            id: 'cmd',
            name: 'bug',
            type: 1,
            options: [{ name: 'description', type: 3, value: 'Crash on login' }]
          }
        } as never,
        'description'
      )
    ).toBe('Crash on login')

    expect(
      getCommandOptionInteger(
        {
          type: 2,
          id: '1',
          application_id: 'app',
          token: 'token',
          version: 1,
          data: {
            id: 'cmd',
            name: 'bug-status',
            type: 1,
            options: [
              {
                name: 'admin',
                type: 1,
                options: [{ name: 'bug_id', type: 4, value: 42 }]
              }
            ]
          }
        } as never,
        'bug_id'
      )
    ).toBe(42)
  })

  it('builds the full slash command set with typed shapes', () => {
    const commands = buildApplicationCommands(String(1n << 13n))
    expect(commands.map((command) => command.name)).toEqual([
      'bug',
      'bugs',
      'suggestion',
      'suggestions',
      'Report Message as Bug',
      'Turn Message into Suggestion'
    ])
    expect(commands.find((command) => command.name === 'bug')?.options).toBeUndefined()
    expect(commands.find((command) => command.name === 'bugs')?.options?.length).toBeGreaterThan(0)
    expect(commands.find((command) => command.name === 'suggestion')?.options).toBeUndefined()
    expect(commands.find((command) => command.name === 'suggestions')?.options?.length).toBeGreaterThan(0)
  })
})

describe('modal builders and parsers', () => {
  it('builds typed modals for bug and feature flows', () => {
    const bugModal = bugModalResponse({
      sessionId: 'session-1',
      initialDescription: 'Crash on login',
      relationshipType: null,
      targetBugId: null
    })
    const featureModal = featureModalResponse('Search bar')

    expect(bugModal.type).toBe(InteractionResponseType.Modal)
    expect(bugModal.data.custom_id).toContain('bug:create:')
    expect(bugModal.data.components[0]?.type).toBe(ComponentType.Label)

    expect(featureModal.type).toBe(InteractionResponseType.Modal)
    expect(featureModal.data.custom_id).toBe('feature:create')
  })

  it('normalizes modal values and uploaded attachments', () => {
    const interaction = {
      type: 5,
      id: '1',
      application_id: 'app',
      token: 'token',
      version: 1,
      data: {
        custom_id: 'feature:modal',
        resolved: {
          attachments: {
            file1: { id: 'file1', filename: 'mock.png', size: 10, url: 'https://example.com/mock.png', proxy_url: '', content_type: 'image/png' }
          }
        },
        components: [
          {
            type: ComponentType.Label,
            label: 'Mockup or screenshot',
            component: { type: ComponentType.FileUpload, custom_id: 'feature_screenshot', values: ['file1'] }
          },
          {
            type: ComponentType.Label,
            label: 'Description',
            component: { type: ComponentType.TextInput, custom_id: 'feature_description', value: 'A quick filter for the dashboard.' }
          }
        ]
      }
    } as never

    expect(getModalFieldValues(interaction, 'feature')).toEqual({
      feature_description: 'A quick filter for the dashboard.',
      feature_screenshot: ['file1']
    })
    expect(getModalUploadedAttachmentUrl(interaction, 'feature_screenshot')).toBe('https://example.com/mock.png')
  })
})

describe('public message builders', () => {
  it('renders a component-driven bug card', () => {
    const rendered = renderBugMessage(
      {
        id: 1,
        title: 'Bug title',
        title_normalized: 'bug title',
        description: 'desc',
        steps: 'steps',
        expected: 'expected',
        actual: 'actual',
        platform: 'WEB',
        severity: 'HIGH',
        screenshot_url: 'https://example.com/shot.png',
        status: 'FIXED',
        reporter_id: '123',
        votes_count: 2,
        duplicate_flags_count: 1,
        linked_duplicates_count: 4,
        regressions_count: 1,
        channel_id: '1',
        message_id: '2',
        source_guild_id: 'guild-1',
        source_channel_id: 'source-channel',
        source_message_id: 'source-message',
        related_bug_id: 10,
        relationship_type: 'REGRESSION_OF',
        closed_reason: null,
        status_note: null,
        created_at: '2026-03-18T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z'
      },
      {
        relatedBug: { id: 10, title: 'Original regression target' },
        relatedBugUrl: 'https://example.com/bug/10',
        bugUrl: 'https://example.com/dashboard#bug-1'
      }
    )

    expect(rendered.flags).toBe(MessageFlags.IsComponentsV2)
    expect(rendered.components?.[0]?.type).toBe(ComponentType.Container)
    const container = rendered.components?.[0] as { accent_color?: number; components: Array<{ type: number; components?: Array<{ label?: string; disabled?: boolean; url?: string }> }> }
    expect(container.accent_color).toBe(0x27ae60)
    const buttons = container.components.find((component) => component.type === ComponentType.ActionRow)?.components ?? []
    expect(buttons[0]?.label).toBe('Upvote')
    expect(buttons[0]?.disabled).toBe(true)
    expect(buttons[1]?.label).toBe('🔔 Follow')
    expect(buttons[2]?.url).toBe('https://example.com/dashboard#bug-1')
    expect(buttons[3]?.label).toBe('Manage')
  })

  it('renders a component-driven feature card', () => {
    const rendered = renderFeatureMessage(
      {
        id: 3,
        title: 'Search bar',
        description: 'Add search to the dashboard',
        benefit: '',
        screenshot_url: 'https://example.com/mock.png',
        status: 'OPEN',
        reporter_id: '123',
        votes_count: 5,
        channel_id: '1',
        message_id: '2',
        source_guild_id: 'guild-1',
        source_channel_id: 'source-channel',
        source_message_id: 'source-message',
        status_note: null,
        created_at: '2026-03-18T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z'
      },
      { featureUrl: 'https://discord.com/channels/1/2/3' }
    )

    expect(rendered.flags).toBe(MessageFlags.IsComponentsV2)
    expect(rendered.components?.[0]?.type).toBe(ComponentType.Container)
    const container = rendered.components?.[0] as { accent_color?: number; components: Array<{ type: number; components?: Array<{ disabled?: boolean; url?: string; label?: string }> }> }
    expect(container.accent_color).toBe(0xf1c40f)
    const buttons = container.components.find((component) => component.type === ComponentType.ActionRow)?.components ?? []
    expect(buttons[0]?.disabled).not.toBe(true)
    expect(buttons[1]?.label).toBe('🔔 Follow')
    expect(buttons[2]?.url).toBe('https://discord.com/channels/1/2/3')
  })
})

describe('schemas and normalization', () => {
  it('accepts concise bug submissions with optional metadata', () => {
    const parsed = bugSubmissionSchema.safeParse({
      platform: null,
      severity: null,
      description: 'test',
      screenshot_url: null
    })

    expect(parsed.success).toBe(true)
  })

  it('normalizes punctuation and spacing in bug titles', () => {
    expect(normalizeBugTitle('  Crash! On login???  ')).toBe('crash on login')
  })
})

describe('dashboard renderer', () => {
  it('renders the simplified admin tables with row actions', () => {
    const html = renderDashboardPage({
      currentBugFilter: 'all',
      currentSuggestionFilter: 'all',
      canManage: true,
      bugs: [
        {
          id: 7,
          title: 'App freezes after reconnect',
          description: 'The app freezes after reconnecting to the session.',
          status: 'OPEN',
          reporter_id: 'user-123',
          votes_count: 9,
          message_url: 'https://discord.com/channels/guild/channel/message',
          duplicate_flags_count: 2,
          linked_duplicates_count: 3,
          regressions_count: 1,
          source_guild_id: null,
          source_channel_id: null,
          source_message_id: null,
          related_bug_id: null,
          relationship_type: null,
          closed_reason: null,
          status_note: null,
          follower_count: 0,
          created_at: '2026-03-18 15:00:00'
        }
      ],
      features: [
        {
          id: 11,
          title: 'Saved dashboard filters',
          description: 'Remember the last dashboard view for returning moderators.',
          status: 'PLANNED',
          reporter_id: 'user-456',
          votes_count: 5,
          screenshot_url: null,
          source_guild_id: null,
          source_channel_id: null,
          source_message_id: null,
          status_note: null,
          follower_count: 0,
          created_at: '2026-03-16 09:00:00'
        }
      ]
    })

    expect(html).toContain('Description')
    expect(html).toContain('Resolve')
    expect(html).toContain('Delete')
    expect(html).toContain('data-sort-header')
    expect(html).toContain('https://discord.com/channels/guild/channel/message')
    expect(html).toContain('Remember the last dashboard view for returning moderators.')
  })
})

describe('request verification', () => {
  it('verifies a valid signed payload', async () => {
    const pair = nacl.sign.keyPair()
    const timestamp = '12345'
    const body = JSON.stringify({ hello: 'world' })
    const payload = new TextEncoder().encode(timestamp + body)
    const signature = nacl.sign.detached(payload, pair.secretKey)

    await expect(verifyDiscordRequest(toHex(signature), timestamp, body, toHex(pair.publicKey))).resolves.toBe(true)
  })
})

describe('DiscordRestClient', () => {
  it('surfaces Discord API errors with status, code, and route context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(JSON.stringify({ code: 50013, message: 'Missing Permissions' }))
      })
    )

    const client = new DiscordRestClient(env)

    await expect(client.createMessage('123', { content: 'hello' })).rejects.toMatchObject({
      status: 403,
      discordCode: 50013,
      context: {
        route: '/channels/123/messages',
        method: 'POST'
      }
    })
  })

  it('registers commands against Discord routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new DiscordRestClient({ ...env, DISCORD_DEV_GUILD_ID: 'guild-1' })
    await client.registerCommands()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/applications/app-id/guilds/guild-1/commands')
  })
})
