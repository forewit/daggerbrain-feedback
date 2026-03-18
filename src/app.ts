import { Hono } from 'hono'
import { createBug, setBugMessageMetadata, getBugById, listBugs, addVote, addDuplicateFlag, closeBug } from './db/bugs'
import { createChannelMessage, editChannelMessage, registerCommands, DiscordApiError } from './discord/api'
import { getInteractionUserId, getModalFieldValues, hasAnyRole, hasManageMessagesPermission, parseBugAction } from './discord/helpers'
import { bugModalResponse, ephemeralMessage, renderBugMessage } from './discord/render'
import type { DiscordInteraction } from './discord/types'
import { verifyDiscordRequest } from './discord/verify'
import type { Env } from './types'
import { bugSubmissionSchema, bugsQuerySchema } from './validation'
import { renderDashboardPage } from './ui/dashboard'
import { CUSTOM_IDS } from './constants'

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', (c) => c.json({ ok: true, service: 'daggerbrain-feedback' }))

  app.post('/commands/register', async (c) => {
    try {
      await registerCommands(c.env)
      return c.json({ ok: true })
    } catch (error) {
      console.error('discord.command_registration_failed', error)
      return c.json({ ok: false }, 500)
    }
  })

  app.get('/api/bugs', async (c) => {
    const query = bugsQuerySchema.parse({
      status: c.req.query('status') ?? 'open',
      sort: c.req.query('sort') ?? 'top'
    })
    const bugs = await listBugs(c.env.DB, query.status, query.sort)
    return c.json({ bugs })
  })

  app.get('/dashboard', async (c) => {
    const query = bugsQuerySchema.parse({
      status: c.req.query('status') ?? 'open',
      sort: c.req.query('sort') ?? 'top'
    })
    const bugs = await listBugs(c.env.DB, query.status, query.sort)
    return c.html(renderDashboardPage(bugs, query.status, query.sort))
  })

  app.post('/interactions', async (c) => {
    const body = await c.req.text()
    const signature = c.req.header('X-Signature-Ed25519')
    const timestamp = c.req.header('X-Signature-Timestamp')

    if (!verifyDiscordRequest(signature, timestamp, body, c.env.DISCORD_PUBLIC_KEY)) {
      console.error('discord.invalid_signature', { hasSignature: Boolean(signature), hasTimestamp: Boolean(timestamp) })
      return c.text('invalid request signature', 401)
    }

    const interaction = JSON.parse(body) as DiscordInteraction

    if (interaction.type === 1) {
      return c.json({ type: 1 })
    }

    if (interaction.type === 2) {
      return c.json(await handleCommand(c.env, interaction))
    }

    if (interaction.type === 5) {
      return c.json(await handleModalSubmit(c.env, interaction))
    }

    if (interaction.type === 3) {
      return c.json(await handleComponent(c.env, interaction))
    }

    return c.json(ephemeralMessage('Unsupported interaction.'))
  })

  app.onError((error, c) => {
    console.error('app.unhandled_error', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  })

  return app
}

async function handleCommand(env: Env, interaction: DiscordInteraction) {
  const commandName = interaction.data?.name

  if (commandName === 'bug') {
    return bugModalResponse()
  }

  if (commandName === 'topbugs') {
    const bugs = await listBugs(env.DB, 'open', 'top')
    if (bugs.length === 0) {
      return ephemeralMessage('No open bugs yet.')
    }

    const content = bugs.slice(0, 5).map((bug, index) => `${index + 1}. #${bug.id} (${bug.votes_count} votes) ${bug.title}`).join('\n')
    return ephemeralMessage(content)
  }

  return ephemeralMessage('Unknown command.')
}

async function handleModalSubmit(env: Env, interaction: DiscordInteraction) {
  if (interaction.data?.custom_id !== CUSTOM_IDS.bugModal) {
    return ephemeralMessage('Unknown modal submission.')
  }

  const userId = getInteractionUserId(interaction)
  if (!userId) {
    return ephemeralMessage('Unable to determine the reporting user.')
  }

  const parsed = bugSubmissionSchema.safeParse(getModalFieldValues(interaction))
  if (!parsed.success) {
    return ephemeralMessage('Bug submission validation failed. Please ensure every field is filled out clearly.')
  }

  const bugId = await createBug(env.DB, { ...parsed.data, reporter_id: userId })
  const bug = await getBugById(env.DB, bugId)
  if (!bug) {
    return ephemeralMessage('Bug creation failed unexpectedly.')
  }

  try {
    const message = await createChannelMessage(env, env.BUG_REPORT_CHANNEL_ID, renderBugMessage(bug))
    await setBugMessageMetadata(env.DB, bug.id, message.channel_id, message.id)
  } catch (error) {
    console.error('discord.create_bug_message_failed', error)
    return ephemeralMessage('Bug saved, but posting to Discord failed. Check Worker logs before retrying.')
  }

  return ephemeralMessage(`Bug #${bug.id} was created successfully.`)
}

async function handleComponent(env: Env, interaction: DiscordInteraction) {
  const userId = getInteractionUserId(interaction)
  const action = parseBugAction(interaction.data?.custom_id)

  if (!userId || !action) {
    return ephemeralMessage('Unknown action.')
  }

  const bug = await getBugById(env.DB, action.bugId)
  if (!bug) {
    return ephemeralMessage('Bug not found.')
  }

  if (action.action === 'upvote') {
    if (bug.status === 'CLOSED') {
      return ephemeralMessage('Closed bugs cannot receive more upvotes.')
    }

    const outcome = await addVote(env.DB, bug.id, userId)
    if (outcome === 'duplicate') {
      return ephemeralMessage('You already upvoted this bug.')
    }

    await syncBugMessage(env, bug.id)
    return ephemeralMessage(`Upvoted bug #${bug.id}.`)
  }

  if (action.action === 'duplicate') {
    const outcome = await addDuplicateFlag(env.DB, bug.id, userId)
    if (outcome === 'duplicate') {
      return ephemeralMessage('You already flagged this bug as a duplicate.')
    }

    await syncBugMessage(env, bug.id)
    return ephemeralMessage(`Flagged bug #${bug.id} as a duplicate.`)
  }

  const member = interaction.member
  const authorized = bug.reporter_id === userId || hasManageMessagesPermission(member?.permissions) || hasAnyRole(member?.roles, env.DISCORD_MOD_ROLE_IDS)

  if (!authorized) {
    console.error('discord.fixed_unauthorized', { bugId: bug.id, userId })
    return ephemeralMessage('You are not allowed to mark this bug fixed.')
  }

  if (bug.status === 'CLOSED') {
    return ephemeralMessage('This bug is already closed.')
  }

  await closeBug(env.DB, bug.id)
  await syncBugMessage(env, bug.id)
  return ephemeralMessage(`Bug #${bug.id} is now closed.`)
}

async function syncBugMessage(env: Env, bugId: number) {
  const bug = await getBugById(env.DB, bugId)
  if (!bug?.channel_id || !bug.message_id) {
    return
  }

  try {
    await editChannelMessage(env, bug.channel_id, bug.message_id, renderBugMessage(bug))
  } catch (error) {
    if (error instanceof DiscordApiError) {
      console.error('discord.edit_bug_message_failed', { status: error.status, body: error.body, bugId })
    } else {
      console.error('discord.edit_bug_message_failed', error)
    }
  }
}
