import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from '../constants'
import type { BugRelationshipType } from '../types'
import type { DiscordInteraction, DiscordInteractionDataOption, DiscordModalValue } from './types'

export function getInteractionUserId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null
}

function visitModalComponents(components: DiscordModalValue[], visitor: (component: DiscordModalValue) => void) {
  for (const component of components) {
    visitor(component)

    if (component.component) {
      visitor(component.component)
    }

    if (component.components?.length) {
      visitModalComponents(component.components, visitor)
    }
  }
}

export function getModalFieldValues(
  interaction: DiscordInteraction,
  kind: 'bug' | 'feature' = 'bug'
): Record<string, string | string[]> {
  const components = interaction.data?.components ?? []
  const values: Record<string, string | string[]> = {}

  visitModalComponents(components, (component) => {
    if (!component.custom_id) return

    if (typeof component.value === 'string') {
      values[component.custom_id] = component.value
      return
    }

    if (Array.isArray(component.values)) {
      values[component.custom_id] = component.values
    }
  })

  if (kind === 'feature') {
    return {
      [FEATURE_MODAL_FIELDS.title]: typeof values[FEATURE_MODAL_FIELDS.title] === 'string' ? values[FEATURE_MODAL_FIELDS.title] : '',
      [FEATURE_MODAL_FIELDS.benefit]: typeof values[FEATURE_MODAL_FIELDS.benefit] === 'string' ? values[FEATURE_MODAL_FIELDS.benefit] : '',
      [FEATURE_MODAL_FIELDS.description]: typeof values[FEATURE_MODAL_FIELDS.description] === 'string' ? values[FEATURE_MODAL_FIELDS.description] : '',
      [FEATURE_MODAL_FIELDS.screenshot]: Array.isArray(values[FEATURE_MODAL_FIELDS.screenshot]) ? values[FEATURE_MODAL_FIELDS.screenshot] : []
    }
  }

  return {
    [BUG_MODAL_FIELDS.title]: typeof values[BUG_MODAL_FIELDS.title] === 'string' ? values[BUG_MODAL_FIELDS.title] : '',
    [BUG_MODAL_FIELDS.platform]: Array.isArray(values[BUG_MODAL_FIELDS.platform]) ? values[BUG_MODAL_FIELDS.platform][0] ?? '' : '',
    [BUG_MODAL_FIELDS.severity]: Array.isArray(values[BUG_MODAL_FIELDS.severity]) ? values[BUG_MODAL_FIELDS.severity][0] ?? '' : '',
    [BUG_MODAL_FIELDS.description]: typeof values[BUG_MODAL_FIELDS.description] === 'string' ? values[BUG_MODAL_FIELDS.description] : '',
    [BUG_MODAL_FIELDS.steps]: typeof values[BUG_MODAL_FIELDS.steps] === 'string' ? values[BUG_MODAL_FIELDS.steps] : '',
    [BUG_MODAL_FIELDS.expected]: typeof values[BUG_MODAL_FIELDS.expected] === 'string' ? values[BUG_MODAL_FIELDS.expected] : '',
    [BUG_MODAL_FIELDS.actual]: typeof values[BUG_MODAL_FIELDS.actual] === 'string' ? values[BUG_MODAL_FIELDS.actual] : '',
    [BUG_MODAL_FIELDS.screenshot]: Array.isArray(values[BUG_MODAL_FIELDS.screenshot]) ? values[BUG_MODAL_FIELDS.screenshot] : []
  }
}

export function getModalUploadedAttachmentUrl(interaction: DiscordInteraction, customId: string): string | null {
  const values = getModalFieldValues(interaction, customId.startsWith('feature_') ? 'feature' : 'bug')
  const attachmentIds = values[customId]

  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return null
  }

  const attachments = interaction.data?.resolved?.attachments ?? {}
  const attachment = attachments[attachmentIds[0] ?? '']
  return attachment?.url ?? null
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

export function parseFeatureUpvote(customId: string | undefined): { featureId: number } | null {
  if (!customId?.startsWith(CUSTOM_IDS.featureUpvotePrefix)) {
    return null
  }

  const featureId = Number(customId.slice(CUSTOM_IDS.featureUpvotePrefix.length))
  if (Number.isNaN(featureId) || featureId <= 0) {
    return null
  }

  return { featureId }
}

function flattenCommandOptions(options: DiscordInteractionDataOption[] | undefined): DiscordInteractionDataOption[] {
  if (!options?.length) {
    return []
  }

  return options.flatMap((option) => [option, ...flattenCommandOptions(option.options)])
}

function getCommandOptionValue(interaction: DiscordInteraction, name: string): string | number | boolean | null {
  const options = flattenCommandOptions(interaction.data?.options)
  const namedOption = options.find((entry) => entry.name === name && entry.value !== undefined)
  if (namedOption?.value !== undefined) {
    return namedOption.value
  }

  const valueOptions = options.filter((entry) => entry.value !== undefined)
  if (valueOptions.length === 1) {
    return valueOptions[0]?.value ?? null
  }

  return null
}

export function getCommandOptionString(interaction: DiscordInteraction, name: string): string | null {
  const value = getCommandOptionValue(interaction, name)
  return typeof value === 'string' ? value : null
}

export function getCommandOptionInteger(interaction: DiscordInteraction, name: string): number | null {
  const value = getCommandOptionValue(interaction, name)
  return typeof value === 'number' ? value : null
}

function parseRelationshipToken(token: string): BugRelationshipType | null | undefined {
  if (token === 'dup') return 'DUPLICATE_OF'
  if (token === 'reg') return 'REGRESSION_OF'
  if (token === 'new') return null
  return undefined
}

function toRelationshipToken(relationshipType: BugRelationshipType | null): string {
  if (relationshipType === 'DUPLICATE_OF') return 'dup'
  if (relationshipType === 'REGRESSION_OF') return 'reg'
  return 'new'
}

export function buildBugModalCustomId(sessionId: string, relationshipType: BugRelationshipType | null, targetBugId: number | null): string {
  return `${CUSTOM_IDS.bugModalPrefix}${sessionId}:${toRelationshipToken(relationshipType)}:${targetBugId ?? 0}`
}

export function parseBugModalCustomId(
  customId: string | undefined
): { sessionId: string | null; relationshipType: BugRelationshipType | null; targetBugId: number | null } | null {
  if (!customId) return null

  if (customId === CUSTOM_IDS.bugModalLegacy) {
    return { sessionId: null, relationshipType: null, targetBugId: null }
  }

  if (!customId.startsWith(CUSTOM_IDS.bugModalPrefix)) {
    return null
  }

  const payload = customId.slice(CUSTOM_IDS.bugModalPrefix.length)
  const [sessionId, relationshipToken, targetBugIdValue] = payload.split(':')
  const relationshipType = parseRelationshipToken(relationshipToken)
  const targetBugId = Number(targetBugIdValue)

  if (!sessionId || relationshipType === undefined || targetBugIdValue === undefined || Number.isNaN(targetBugId)) {
    return null
  }

  return {
    sessionId,
    relationshipType,
    targetBugId: targetBugId > 0 ? targetBugId : null
  }
}

export function buildPreflightCustomId(sessionId: string, relationshipType: BugRelationshipType | null, targetBugId: number | null): string {
  return `${CUSTOM_IDS.preflightPrefix}${sessionId}:${toRelationshipToken(relationshipType)}:${targetBugId ?? 0}`
}

export function parsePreflightCustomId(
  customId: string | undefined
): { sessionId: string; relationshipType: BugRelationshipType | null; targetBugId: number | null } | null {
  if (!customId?.startsWith(CUSTOM_IDS.preflightPrefix)) {
    return null
  }

  const payload = customId.slice(CUSTOM_IDS.preflightPrefix.length)
  const [sessionId, relationshipToken, targetBugIdValue] = payload.split(':')
  const relationshipType = parseRelationshipToken(relationshipToken)
  const targetBugId = Number(targetBugIdValue)

  if (!sessionId || relationshipType === undefined || targetBugIdValue === undefined || Number.isNaN(targetBugId)) {
    return null
  }

  return {
    sessionId,
    relationshipType,
    targetBugId: targetBugId > 0 ? targetBugId : null
  }
}

export function buildDuplicateSelectionCustomId(sourceBugId: number, targetBugId: number): string {
  return `${CUSTOM_IDS.duplicateSelectPrefix}${sourceBugId}:${targetBugId}`
}

export function parseDuplicateSelectionCustomId(customId: string | undefined): { sourceBugId: number; targetBugId: number } | null {
  if (!customId?.startsWith(CUSTOM_IDS.duplicateSelectPrefix)) {
    return null
  }

  const payload = customId.slice(CUSTOM_IDS.duplicateSelectPrefix.length)
  const [sourceBugIdValue, targetBugIdValue] = payload.split(':')
  const sourceBugId = Number(sourceBugIdValue)
  const targetBugId = Number(targetBugIdValue)

  if (Number.isNaN(sourceBugId) || Number.isNaN(targetBugId) || sourceBugId <= 0 || targetBugId <= 0) {
    return null
  }

  return { sourceBugId, targetBugId }
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
