import { describe, expect, it } from 'vitest'
import { parseBugAction, hasAnyRole, hasManageMessagesPermission } from '../src/discord/helpers'
import { renderBugMessage } from '../src/discord/render'
import { verifyDiscordRequest } from '../src/discord/verify'
import nacl from 'tweetnacl'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('parseBugAction', () => {
  it('parses known action custom ids', () => {
    expect(parseBugAction('upvote:12')).toEqual({ action: 'upvote', bugId: 12 })
    expect(parseBugAction('duplicate:7')).toEqual({ action: 'duplicate', bugId: 7 })
    expect(parseBugAction('fixed:3')).toEqual({ action: 'fixed', bugId: 3 })
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

describe('renderBugMessage', () => {
  it('disables upvote and fix buttons for closed bugs', () => {
    const rendered = renderBugMessage({
      id: 1,
      title: 'Bug title',
      description: 'desc',
      steps: 'steps',
      expected: 'expected',
      actual: 'actual',
      status: 'CLOSED',
      reporter_id: '123',
      votes_count: 2,
      duplicate_flags_count: 1,
      channel_id: '1',
      message_id: '2',
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z'
    })

    const buttons = (rendered.components[0] as { components: Array<{ disabled: boolean }> }).components
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[2].disabled).toBe(true)
  })
})

describe('verifyDiscordRequest', () => {
  it('verifies a valid signed payload', () => {
    const pair = nacl.sign.keyPair()
    const timestamp = '12345'
    const body = JSON.stringify({ hello: 'world' })
    const payload = new TextEncoder().encode(timestamp + body)
    const signature = nacl.sign.detached(payload, pair.secretKey)

    expect(
      verifyDiscordRequest(
        toHex(signature),
        timestamp,
        body,
        toHex(pair.publicKey)
      )
    ).toBe(true)
  })
})
