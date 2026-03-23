import type { Env } from '../types'

interface ExpiringSessionPayload {
  issuedAt: number
  expiresAt: number
}

export interface DashboardSessionPayload extends ExpiringSessionPayload {
  userId: string
  guildId: string
  guildName: string
  guildPermissions: string
}

export interface DashboardGuildSelectionPayload extends ExpiringSessionPayload {
  userId: string
  guilds: DiscordOauthGuild[]
}

export interface DiscordOauthGuild {
  id: string
  name: string
  permissions: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function signValue(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(signature))
}

export async function createSignedSessionToken<T extends ExpiringSessionPayload>(secret: string, payload: T): Promise<string> {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await signValue(secret, encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifySignedSessionToken<T extends ExpiringSessionPayload>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = await signValue(secret, encodedPayload)
  if (signature !== expectedSignature) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as T
    if (payload.expiresAt <= Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

function buildCookie(name: string, token: string, maxAge: number): string {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`
}

export function buildDashboardSessionCookie(token: string): string {
  return buildCookie('dashboard_session', token, 604800)
}

export function clearDashboardSessionCookie(): string {
  return 'dashboard_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'
}

export function buildDashboardGuildSelectionCookie(token: string): string {
  return buildCookie('dashboard_guild_selection', token, 600)
}

export function clearDashboardGuildSelectionCookie(): string {
  return 'dashboard_guild_selection=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'
}

export function getCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return match ? match.slice(name.length + 1) : undefined
}

export function buildDiscordOauthUrl(env: Env, state: string): string {
  const baseUrl = env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('PUBLIC_APP_URL is required for Discord OAuth.')
  }

  const redirectUri = `${baseUrl}/auth/discord/callback`
  const params = new URLSearchParams({
    client_id: env.DISCORD_APPLICATION_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    state
  })

  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

export async function exchangeOauthCode(env: Env, code: string): Promise<{ access_token: string }> {
  const baseUrl = env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl || !env.DISCORD_CLIENT_SECRET) {
    throw new Error('Discord OAuth is not configured.')
  }

  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: env.DISCORD_APPLICATION_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${baseUrl}/auth/discord/callback`
    })
  })

  if (!response.ok) {
    throw new Error(`Discord OAuth token exchange failed with ${response.status}`)
  }

  return (await response.json()) as { access_token: string }
}

export async function fetchOauthUser(accessToken: string): Promise<{ id: string }> {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Discord OAuth user fetch failed with ${response.status}`)
  }

  return (await response.json()) as { id: string }
}

export async function fetchOauthGuilds(accessToken: string): Promise<DiscordOauthGuild[]> {
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Discord OAuth guild fetch failed with ${response.status}`)
  }

  const guilds = await response.json() as Array<{ id: string; name: string; permissions?: string | null }>
  return guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    permissions: guild.permissions ?? '0'
  }))
}
