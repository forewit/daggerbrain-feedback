import { BUG_MODAL_FIELDS, CUSTOM_IDS } from '../constants'
import type { DiscordInteraction } from './types'

export function getInteractionUserId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null
}

export function getModalFieldValues(interaction: DiscordInteraction): Record<string, string> {
  const components = interaction.data?.components ?? []
  const values: Record<string, string> = {}

  for (const row of components) {
    for (const component of row.components) {
      values[component.custom_id] = component.value
    }
  }

  return {
    [BUG_MODAL_FIELDS.title]: values[BUG_MODAL_FIELDS.title] ?? '',
    [BUG_MODAL_FIELDS.description]: values[BUG_MODAL_FIELDS.description] ?? '',
    [BUG_MODAL_FIELDS.steps]: values[BUG_MODAL_FIELDS.steps] ?? '',
    [BUG_MODAL_FIELDS.expected]: values[BUG_MODAL_FIELDS.expected] ?? '',
    [BUG_MODAL_FIELDS.actual]: values[BUG_MODAL_FIELDS.actual] ?? ''
  }
}

export function parseBugAction(customId: string | undefined): { action: 'upvote' | 'duplicate' | 'fixed'; bugId: number } | null {
  if (!customId) return null

  const mappings = [
    [CUSTOM_IDS.upvotePrefix, 'upvote'],
    [CUSTOM_IDS.duplicatePrefix, 'duplicate'],
    [CUSTOM_IDS.fixedPrefix, 'fixed']
  ] as const

  for (const [prefix, action] of mappings) {
    if (customId.startsWith(prefix)) {
      const bugId = Number(customId.slice(prefix.length))
      if (!Number.isNaN(bugId)) {
        return { action, bugId }
      }
    }
  }

  return null
}

export function hasManageMessagesPermission(permissions?: string): boolean {
  if (!permissions) return false
  const permissionValue = BigInt(permissions)
  const manageMessages = 1n << 13n
  return (permissionValue & manageMessages) === manageMessages
}

export function hasAnyRole(memberRoles: string[] | undefined, configuredRoles: string | undefined): boolean {
  if (!memberRoles?.length || !configuredRoles) return false
  const allowedRoles = configuredRoles.split(',').map((value) => value.trim()).filter(Boolean)
  return memberRoles.some((role) => allowedRoles.includes(role))
}
