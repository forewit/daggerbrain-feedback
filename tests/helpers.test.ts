import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComponentType, InteractionResponseType, MessageFlags } from 'discord-api-types/v10'
import nacl from 'tweetnacl'
import { createApp } from '../src/app'
import { buildApplicationCommands } from '../src/discord/commands'
import { createSignedSessionToken } from '../src/discord/auth'
import {
  buildBugModalCustomId,
  buildDuplicateSelectionCustomId,
  buildPreflightCustomId,
  getCommandOptionInteger,
  getCommandOptionString,
  getFeatureSubmissionValues,
  hasDashboardManagePermission,
  hasGuildConfigurationPermission,
  getModalFieldValues,
  getModalUploadedAttachmentUrl,
  hasAnyRole,
  hasManageMessagesPermission,
  parseBugAction,
  parseBugModalCustomId,
  parseDeleteAction,
  parseDuplicateSelectionCustomId,
  parseFeatureUpvote,
  parsePreflightCustomId,
  verifyDiscordRequest
} from '../src/discord/interactions'
import {
  bugModalResponse,
  bugManageResponse,
  ephemeralRichMessage,
  featureManageResponse,
  featureModalResponse,
  myItemsResponse,
  renderBugMessage,
  renderFeatureMessage,
  topBugsResponse
} from '../src/discord/messages'
import * as subscriptionsDb from '../src/db/subscriptions'
import { DiscordApiError, DiscordRestClient } from '../src/discord/rest'
import type { BugRecord, FeatureRecord } from '../src/types'
import { notifyBugFollowers as notifyBugFollowerDms, notifyFeatureFollowers as notifyFeatureFollowerDms } from '../src/discord/notifications'
import { normalizeBugTitle } from '../src/db/bugs'
import { bugSubmissionSchema } from '../src/validation'
import { renderDashboardPage, renderGuildSelectionPage } from '../src/ui/dashboard'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function buildDashboardCookie(
  secret: string,
  options?: {
    userId?: string
    guildId?: string
    guildName?: string
    guildPermissions?: string
  }
): Promise<string> {
  const token = await createSignedSessionToken(secret, {
    userId: options?.userId ?? 'viewer-1',
    guildId: options?.guildId ?? 'guild-1',
    guildName: options?.guildName ?? 'Guild One',
    guildPermissions: options?.guildPermissions ?? '0',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  })

  return `dashboard_session=${token}`
}

async function buildGuildSelectionCookie(secret: string, userId = 'viewer-1'): Promise<string> {
  const token = await createSignedSessionToken(secret, {
    userId,
    guilds: [
      { id: 'guild-1', name: 'Guild One', permissions: '0' },
      { id: 'guild-2', name: 'Guild Two', permissions: String(1n << 5n) }
    ],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  })

  return `dashboard_guild_selection=${token}`
}

const env = {
  DB: {} as D1Database,
  DISCORD_PUBLIC_KEY: 'pk',
  DISCORD_APPLICATION_ID: 'app-id',
  DISCORD_TOKEN: 'token',
  BUG_REPORT_CHANNEL_ID: 'bug-channel',
  FEATURE_CHANNEL_ID: 'feature-channel',
  DISCORD_GUILD_ID: 'guild'
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('custom id helpers', () => {
  it('parses known action custom ids', () => {
    expect(parseBugAction('upvote:12')).toEqual({ action: 'upvote', bugId: 12 })
    expect(parseBugAction('duplicate:7')).toEqual({ action: 'duplicate', bugId: 7 })
    expect(parseFeatureUpvote('feature:upvote:12')).toEqual({ featureId: 12 })
    expect(parseDeleteAction('bug:delete-action:9')).toEqual({ itemKind: 'bug', itemId: 9 })
    expect(parseDeleteAction('feature:delete-action:11')).toEqual({ itemKind: 'feature', itemId: 11 })
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

  it('detects guild configuration permissions', () => {
    expect(hasGuildConfigurationPermission(String(1n << 5n))).toBe(true)
    expect(hasGuildConfigurationPermission(String(1n << 4n))).toBe(true)
    expect(hasGuildConfigurationPermission(String(1n << 3n))).toBe(true)
    expect(hasGuildConfigurationPermission('0')).toBe(false)
  })

  it('detects dashboard management permissions', () => {
    expect(hasDashboardManagePermission(String(1n << 5n))).toBe(true)
    expect(hasDashboardManagePermission(String(1n << 3n))).toBe(true)
    expect(hasDashboardManagePermission(String(1n << 4n))).toBe(false)
    expect(hasDashboardManagePermission('0')).toBe(false)
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
      'config',
      'Report Message as Bug',
      'Turn Message into Suggestion'
    ])
    expect(commands.find((command) => command.name === 'bug')?.options).toBeUndefined()
    expect(commands.find((command) => command.name === 'bugs')?.options?.length).toBeGreaterThan(0)
    expect(commands.find((command) => command.name === 'suggestion')?.options).toBeUndefined()
    expect(commands.find((command) => command.name === 'suggestions')?.options?.length).toBeGreaterThan(0)
    expect(commands.find((command) => command.name === 'config')?.options?.length).toBe(2)
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
    expect(getFeatureSubmissionValues(interaction)).toEqual({
      description: 'A quick filter for the dashboard.',
      screenshot_url: 'https://example.com/mock.png'
    })
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
    const container = rendered.components?.[0] as {
      accent_color?: number
      components: Array<{ type: number; content?: string; components?: Array<{ label?: string; disabled?: boolean; url?: string }> }>
    }
    expect(container.accent_color).toBe(0x27ae60)
    const section = container.components.find((component) => component.type === ComponentType.Section) as
      | { components?: Array<{ content?: string }> }
      | undefined
    expect(section?.components).toHaveLength(2)
    expect(section?.components?.[0]?.content).toBe(`### \u{1F41E} #1 - Fixed Bug`)
    expect(section?.components?.[1]?.content).toBe('<@123> desc')
    const buttons = container.components.find((component) => component.type === ComponentType.ActionRow)?.components ?? []
    expect(buttons[0]?.label).toBe('\u{1F53A} 2')
    expect(buttons[0]?.disabled).toBe(true)
    expect(buttons[1]?.label).toBe('Follow')
    expect(buttons[2]?.label).toBe('Manage')
    expect(buttons).toHaveLength(3)
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
    const container = rendered.components?.[0] as {
      accent_color?: number
      components: Array<{ type: number; content?: string; components?: Array<{ disabled?: boolean; url?: string; label?: string }> }>
    }
    expect(container.accent_color).toBe(0xf1c40f)
    const section = container.components.find((component) => component.type === ComponentType.Section) as
      | { components?: Array<{ content?: string }> }
      | undefined
    expect(section?.components).toHaveLength(2)
    expect(section?.components?.[0]?.content).toBe(`### \u2728 #3 - Open Suggestion`)
    expect(section?.components?.[1]?.content).toBe('<@123> Add search to the dashboard')
    const buttons = container.components.find((component) => component.type === ComponentType.ActionRow)?.components ?? []
    expect(buttons[0]?.label).toBe('\u{1F53A} 5')
    expect(buttons[0]?.disabled).not.toBe(true)
    expect(buttons[1]?.label).toBe('Follow')
    expect(buttons[2]?.label).toBe('Manage')
    expect(buttons).toHaveLength(3)
  })

  it('omits a header accessory when there is no screenshot or card link', () => {
    const rendered = renderFeatureMessage({
      id: 4,
      title: 'Keyboard shortcuts',
      description: 'Add shortcuts for triage.',
      benefit: '',
      screenshot_url: null,
      status: 'OPEN',
      reporter_id: '456',
      votes_count: 1,
      channel_id: null,
      message_id: null,
      source_guild_id: null,
      source_channel_id: null,
      source_message_id: null,
      status_note: null,
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z'
    })

    const container = rendered.components?.[0] as {
      components: Array<{ type: number; accessory?: unknown }>
    }
    const section = container.components.find((component) => component.type === ComponentType.Section)
    expect(section?.accessory).toBeUndefined()
  })

  it('includes delete buttons in manage responses', () => {
    const bugResponse = bugManageResponse({
      id: 4,
      title: 'Crash on refresh',
      title_normalized: 'crash on refresh',
      description: 'desc',
      steps: '',
      expected: '',
      actual: '',
      platform: 'WEB',
      severity: 'MEDIUM',
      screenshot_url: null,
      status: 'OPEN',
      reporter_id: '123',
      votes_count: 2,
      duplicate_flags_count: 0,
      linked_duplicates_count: 0,
      regressions_count: 0,
      channel_id: '1',
      message_id: '2',
      source_guild_id: 'guild-1',
      source_channel_id: 'source-channel',
      source_message_id: 'source-message',
      related_bug_id: null,
      relationship_type: null,
      closed_reason: null,
      status_note: null,
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z'
    })
    const featureResponse = featureManageResponse({
      id: 5,
      title: 'Search bar',
      description: 'Add search',
      benefit: '',
      screenshot_url: null,
      status: 'OPEN',
      reporter_id: '456',
      votes_count: 3,
      channel_id: '3',
      message_id: '4',
      source_guild_id: 'guild-1',
      source_channel_id: 'source-channel',
      source_message_id: 'source-message',
      status_note: null,
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z'
    })

    expect(JSON.stringify(bugResponse)).toContain('"label":"Delete"')
    expect(JSON.stringify(featureResponse)).toContain('"label":"Delete"')
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

  it('renders component-based ephemeral rich text responses', () => {
    const response = ephemeralRichMessage('Review Bug #7.')

    expect(response.type).toBe(InteractionResponseType.ChannelMessageWithSource)
    expect(response.data.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2)
    const firstComponent = response.data.components?.[0] as { type: number; content?: string }
    expect(firstComponent.type).toBe(ComponentType.TextDisplay)
    expect(firstComponent.content).toContain('Review Bug #7.')
  })

  it('renders linked list responses for top and owned items', () => {
    const top = topBugsResponse([
      {
        id: 7,
        title: 'Reconnect freeze',
        description: 'desc',
        status: 'OPEN',
        reporter_id: 'user-1',
        votes_count: 9,
        duplicate_flags_count: 0,
        linked_duplicates_count: 0,
        regressions_count: 0,
        channel_id: 'channel',
        message_id: 'message',
        message_url: 'https://discord.com/channels/guild/channel/message',
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
    ])
    const mine = myItemsResponse('suggestion', [
      {
        id: 11,
        title: 'Saved filters',
        description: 'desc',
        status: 'PLANNED',
        reporter_id: 'user-2',
        votes_count: 5,
        screenshot_url: null,
        channel_id: 'feature-channel',
        message_id: 'feature-message',
        message_url: 'https://discord.com/channels/guild/feature-channel/feature-message',
        source_guild_id: null,
        source_channel_id: null,
        source_message_id: null,
        status_note: null,
        follower_count: 0,
        created_at: '2026-03-16 09:00:00'
      }
    ])

    const topContent = (top as { data: { components?: Array<{ content?: string }> } }).data.components?.[0]?.content
    const mineContent = (mine as { data: { components?: Array<{ content?: string }> } }).data.components?.[0]?.content
    expect(topContent).toContain('#7')
    expect(mineContent).toContain('#11')
    const topButtons = (top as { data: { components?: Array<{ components?: Array<{ url?: string; label?: string }> }> } }).data.components?.[1]?.components
    const mineButtons = (mine as { data: { components?: Array<{ components?: Array<{ url?: string; label?: string }> }> } }).data.components?.[1]?.components
    expect(topButtons?.[0]?.url).toBe('https://discord.com/channels/guild/channel/message')
    expect(mineButtons?.[0]?.url).toBe('https://discord.com/channels/guild/feature-channel/feature-message')
  })
})

describe('dashboard renderer', () => {
  it('renders an Actions column with moderator controls', () => {
    const html = renderDashboardPage({
      currentBugFilter: 'all',
      currentSuggestionFilter: 'all',
      isAuthenticated: true,
      canManage: true,
      guildName: 'Guild One',
      changeGuildUrl: '/auth/discord/start',
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
          status: 'CLOSED',
          reporter_id: 'user-456',
          votes_count: 5,
          screenshot_url: null,
          message_url: 'https://discord.com/channels/guild/feature-channel/feature-message',
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
    expect(html).toContain('Actions')
    expect(html).toContain('Acknowledge')
    expect(html).toContain('In Progress')
    expect(html).toContain('Fixed')
    expect(html).toContain('Duplicate')
    expect(html).toContain('Review')
    expect(html).toContain('Planned')
    expect(html).toContain('Shipped')
    expect(html).toContain('Declined')
    expect(html).toContain('Delete')
    expect(html).toContain('Guild One')
    expect(html).toContain('Switch Server')
    expect(html).toContain('data-sort-head')
    expect(html).toContain('https://discord.com/channels/guild/channel/message')
    expect(html).toContain('https://discord.com/channels/guild/feature-channel/feature-message')
    expect(html).toContain('>#7</a>')
    expect(html).toContain('>#11</a>')
  })

  it('omits moderator action buttons for non-managers', () => {
    const html = renderDashboardPage({
      currentBugFilter: 'all',
      currentSuggestionFilter: 'all',
      canManage: false,
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
          message_url: 'https://discord.com/channels/guild/feature-channel/feature-message',
          source_guild_id: null,
          source_channel_id: null,
          source_message_id: null,
          status_note: null,
          follower_count: 0,
          created_at: '2026-03-16 09:00:00'
        }
      ]
    })

    expect(html).toContain('Actions')
    expect(html).not.toContain('Acknowledge')
    expect(html).not.toContain('Fixed')
    expect(html).not.toContain('Delete')
  })

  it('uses the expanded column count for empty states', () => {
    const html = renderDashboardPage({
      currentBugFilter: 'all',
      currentSuggestionFilter: 'all',
      canManage: false,
      bugs: [],
      features: []
    })

    expect(html).toContain('colSpan="6"')
    expect(html).toContain('No bugs yet.')
    expect(html).toContain('No suggestions yet.')
  })

  it('renders the guild selection page', () => {
    const html = renderGuildSelectionPage({
      guilds: [
        { id: 'guild-1', name: 'Guild One', permissions: '0' },
        { id: 'guild-2', name: 'Guild Two', permissions: String(1n << 5n) }
      ],
      logoutUrl: '/auth/logout'
    })

    expect(html).toContain('Choose a server')
    expect(html).toContain('Guild One')
    expect(html).toContain('Guild Two')
    expect(html).toContain('Open Dashboard')
  })
})

describe('dashboard routes', () => {
  it('redirects unauthenticated dashboard requests to Discord OAuth when configured', async () => {
    const app = createApp()
    const response = await app.fetch(
      new Request('https://example.com/dashboard'),
      {
        DB: {} as D1Database,
        DISCORD_PUBLIC_KEY: 'pk',
        DISCORD_APPLICATION_ID: 'app-id',
        DISCORD_TOKEN: 'token',
        DISCORD_CLIENT_SECRET: 'client-secret',
        COOKIE_SECRET: 'cookie-secret',
        PUBLIC_APP_URL: 'https://example.com'
      }
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/discord/start')
  })

  it('returns 501 for the dashboard when auth is not configured', async () => {
    const app = createApp()
    const response = await app.fetch(
      new Request('https://example.com/dashboard'),
      {
        DB: {} as D1Database,
        DISCORD_PUBLIC_KEY: 'pk',
        DISCORD_APPLICATION_ID: 'app-id',
        DISCORD_TOKEN: 'token'
      }
    )

    expect(response.status).toBe(501)
    await expect(response.text()).resolves.toContain('Dashboard authentication is not configured.')
  })

  it('returns 401 for dashboard JSON endpoints without a valid session', async () => {
    const app = createApp()
    const bindings = {
      DB: {} as D1Database,
      DISCORD_PUBLIC_KEY: 'pk',
      DISCORD_APPLICATION_ID: 'app-id',
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_SECRET: 'client-secret',
      COOKIE_SECRET: 'cookie-secret',
      PUBLIC_APP_URL: 'https://example.com'
    }

    for (const path of ['/api/bugs', '/api/features', '/api/suggestions']) {
      const response = await app.fetch(new Request(`https://example.com${path}`), bindings)
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    }
  })

  it('renders the guild selection page from the temporary selection cookie', async () => {
    const app = createApp()
    const cookie = await buildGuildSelectionCookie('cookie-secret')
    const response = await app.fetch(
      new Request('https://example.com/auth/discord/select-guild', {
        headers: {
          Cookie: cookie
        }
      }),
      {
        DB: {} as D1Database,
        DISCORD_PUBLIC_KEY: 'pk',
        DISCORD_APPLICATION_ID: 'app-id',
        DISCORD_TOKEN: 'token',
        DISCORD_CLIENT_SECRET: 'client-secret',
        COOKIE_SECRET: 'cookie-secret',
        PUBLIC_APP_URL: 'https://example.com'
      }
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('Choose a server')
  })

  it('blocks dashboard management actions without Administrator or Manage Server', async () => {
    const app = createApp()
    const cookie = await buildDashboardCookie('cookie-secret', { guildPermissions: '0' })
    const body = new URLSearchParams({
      kind: 'bug',
      id: '7',
      action: 'resolve',
      bugStatus: 'all',
      suggestionStatus: 'all'
    })

    const response = await app.fetch(
      new Request('https://example.com/dashboard/actions', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      }),
      {
        DB: {} as D1Database,
        DISCORD_PUBLIC_KEY: 'pk',
        DISCORD_APPLICATION_ID: 'app-id',
        DISCORD_TOKEN: 'token',
        DISCORD_CLIENT_SECRET: 'client-secret',
        COOKIE_SECRET: 'cookie-secret',
        PUBLIC_APP_URL: 'https://example.com'
      }
    )

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('Unauthorized')
  })
})

describe('notification delivery', () => {
  it('does not notify the bug reporter unless they explicitly follow', async () => {
    vi.spyOn(subscriptionsDb, 'listSubscriptionsForItem').mockResolvedValue([])
    const createDmChannel = vi.fn().mockResolvedValue({ id: 'dm-reporter-bug' })
    const createMessage = vi.fn().mockResolvedValue({ id: 'message-reporter-bug', channel_id: 'dm-reporter-bug' })
    const client = { createDmChannel, createMessage } as unknown as DiscordRestClient

    const bug: BugRecord = {
      id: 9,
      title: 'Crash on refresh',
      title_normalized: 'crash on refresh',
      description: 'desc',
      steps: '',
      expected: '',
      actual: '',
      platform: 'WEB',
      severity: 'MEDIUM',
      screenshot_url: null,
      status: 'ACKNOWLEDGED',
      reporter_id: 'reporter-only',
      votes_count: 0,
      duplicate_flags_count: 0,
      linked_duplicates_count: 0,
      regressions_count: 0,
      channel_id: 'bug-channel',
      message_id: 'bug-message',
      source_guild_id: null,
      source_channel_id: null,
      source_message_id: null,
      related_bug_id: null,
      relationship_type: null,
      closed_reason: null,
      status_note: null,
      created_at: '2026-03-20T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z'
    }

    await notifyBugFollowerDms(env, client, bug)

    expect(createDmChannel).not.toHaveBeenCalled()
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('sends linked bug follower DMs', async () => {
    vi.spyOn(subscriptionsDb, 'listSubscriptionsForItem').mockResolvedValue([
      { item_kind: 'bug', item_id: 1, user_id: 'follower-1', created_at: '2026-03-20T00:00:00Z' }
    ])
    const createDmChannel = vi.fn().mockResolvedValue({ id: 'dm-1' })
    const createMessage = vi.fn().mockResolvedValue({ id: 'message-1', channel_id: 'dm-1' })
    const client = { createDmChannel, createMessage } as unknown as DiscordRestClient

    const bug: BugRecord = {
      id: 1,
      title: 'Reconnect freeze',
      title_normalized: 'reconnect freeze',
      description: 'desc',
      steps: '',
      expected: '',
      actual: '',
      platform: 'WEB',
      severity: 'HIGH',
      screenshot_url: null,
      status: 'IN_PROGRESS',
      reporter_id: 'reporter-1',
      votes_count: 0,
      duplicate_flags_count: 0,
      linked_duplicates_count: 0,
      regressions_count: 0,
      channel_id: 'bug-channel',
      message_id: 'bug-message',
      source_guild_id: null,
      source_channel_id: null,
      source_message_id: null,
      related_bug_id: null,
      relationship_type: null,
      closed_reason: null,
      status_note: 'Investigating now',
      created_at: '2026-03-20T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z'
    }

    await notifyBugFollowerDms(env, client, bug)

    expect(createMessage).toHaveBeenCalledTimes(1)
    const payload = createMessage.mock.calls[0]?.[1] as { flags?: number; components?: Array<{ content?: string; components?: Array<{ url?: string; label?: string }> }> }
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(payload.components?.[0]?.content).toContain('\u{1F41E} #1 is now In Progress')
    expect(payload.components?.[0]?.content).toContain('Note: Investigating now')
    expect(payload.components?.[1]?.components?.[0]?.url).toBe('https://discord.com/channels/guild/bug-channel/bug-message')
    expect(payload.components?.[1]?.components?.[0]?.label).toBe('Bug #1')
  })

  it('sends linked suggestion follower DMs', async () => {
    vi.spyOn(subscriptionsDb, 'listSubscriptionsForItem').mockResolvedValue([
      { item_kind: 'feature', item_id: 3, user_id: 'follower-2', created_at: '2026-03-20T00:00:00Z' }
    ])
    const createDmChannel = vi.fn().mockResolvedValue({ id: 'dm-2' })
    const createMessage = vi.fn().mockResolvedValue({ id: 'message-2', channel_id: 'dm-2' })
    const client = { createDmChannel, createMessage } as unknown as DiscordRestClient

    const feature: FeatureRecord = {
      id: 3,
      title: 'Saved filters',
      description: 'desc',
      benefit: '',
      screenshot_url: null,
      status: 'PLANNED',
      reporter_id: 'reporter-2',
      votes_count: 0,
      channel_id: 'feature-channel',
      message_id: 'feature-message',
      source_guild_id: null,
      source_channel_id: null,
      source_message_id: null,
      status_note: null,
      created_at: '2026-03-20T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z'
    }

    await notifyFeatureFollowerDms(env, client, feature)

    expect(createMessage).toHaveBeenCalledTimes(1)
    const payload = createMessage.mock.calls[0]?.[1] as { components?: Array<{ content?: string; components?: Array<{ url?: string; label?: string }> }> }
    expect(payload.components?.[0]?.content).toContain('\u2728 #3 is now Planned')
    expect(payload.components?.[1]?.components?.[0]?.url).toBe('https://discord.com/channels/guild/feature-channel/feature-message')
    expect(payload.components?.[1]?.components?.[0]?.label).toBe('Suggestion #3')
  })

  it('does not notify the suggestion reporter unless they explicitly follow', async () => {
    vi.spyOn(subscriptionsDb, 'listSubscriptionsForItem').mockResolvedValue([])
    const createDmChannel = vi.fn().mockResolvedValue({ id: 'dm-reporter-feature' })
    const createMessage = vi.fn().mockResolvedValue({ id: 'message-reporter-feature', channel_id: 'dm-reporter-feature' })
    const client = { createDmChannel, createMessage } as unknown as DiscordRestClient

    const feature: FeatureRecord = {
      id: 12,
      title: 'Compact mode',
      description: 'desc',
      benefit: '',
      screenshot_url: null,
      status: 'UNDER_REVIEW',
      reporter_id: 'feature-reporter-only',
      votes_count: 0,
      channel_id: 'feature-channel',
      message_id: 'feature-message',
      source_guild_id: null,
      source_channel_id: null,
      source_message_id: null,
      status_note: null,
      created_at: '2026-03-20T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z'
    }

    await notifyFeatureFollowerDms(env, client, feature)

    expect(createDmChannel).not.toHaveBeenCalled()
    expect(createMessage).not.toHaveBeenCalled()
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
