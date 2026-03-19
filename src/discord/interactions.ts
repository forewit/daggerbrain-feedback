import { verifyKey } from 'discord-interactions'
import {
  ComponentType,
  InteractionType,
  type APIApplicationCommandInteraction,
  type APIAttachment,
  type APIInteraction,
  type APIMessageComponentInteraction,
  type APIModalSubmissionComponent,
  type APIModalSubmitInteraction
} from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from '../constants'
import type { BugRelationshipType } from '../types'

type CommandOption = {
  name?: string
  value?: string | number | boolean
  options?: CommandOption[]
}

type ModalValue = string | string[] | boolean

interface AttachmentResolvedData {
  attachments?: Record<string, APIAttachment>
}

export async function verifyDiscordRequest(
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  body: string,
  publicKey: string
): Promise<boolean> {
  if (!signature || !timestamp || !publicKey) {
    return false
  }

  return verifyKey(body, signature, timestamp, publicKey)
}

export function parseDiscordInteraction(body: string): APIInteraction {
  return JSON.parse(body) as APIInteraction
}

export function isPingInteraction(interaction: APIInteraction): boolean {
  return interaction.type === InteractionType.Ping
}

export function isApplicationCommandInteraction(interaction: APIInteraction): interaction is APIApplicationCommandInteraction {
  return interaction.type === InteractionType.ApplicationCommand
}

export function isModalSubmitInteraction(interaction: APIInteraction): interaction is APIModalSubmitInteraction {
  return interaction.type === InteractionType.ModalSubmit
}

export function isMessageComponentInteraction(interaction: APIInteraction): interaction is APIMessageComponentInteraction {
  return interaction.type === InteractionType.MessageComponent
}

export function getInteractionUserId(interaction: APIInteraction): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null
}

function flattenCommandOptions(options: CommandOption[] | undefined): CommandOption[] {
  if (!options?.length) {
    return []
  }

  return options.flatMap((option) => [option, ...flattenCommandOptions(option.options)])
}

function getCommandOptionValue(interaction: APIApplicationCommandInteraction, name: string): string | number | boolean | null {
  const options = flattenCommandOptions((interaction.data as { options?: CommandOption[] }).options)
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

export function getCommandOptionString(interaction: APIApplicationCommandInteraction, name: string): string | null {
  const value = getCommandOptionValue(interaction, name)
  return typeof value === 'string' ? value : null
}

export function getCommandOptionInteger(interaction: APIApplicationCommandInteraction, name: string): number | null {
  const value = getCommandOptionValue(interaction, name)
  return typeof value === 'number' ? value : null
}

function visitModalComponents(components: APIModalSubmissionComponent[], visitor: (component: APIModalSubmissionComponent | { custom_id: string; value?: string; values?: string[]; valueBoolean?: boolean }) => void) {
  for (const component of components) {
    visitor(component)

    if (component.type === ComponentType.ActionRow) {
      component.components.forEach((child) => visitor(child))
    }

    if (component.type === ComponentType.Label) {
      visitor(component.component as { custom_id: string; value?: string; values?: string[]; valueBoolean?: boolean })
    }
  }
}

export function getModalFieldValues(
  interaction: APIModalSubmitInteraction,
  kind: 'bug' | 'feature' = 'bug'
): Record<string, ModalValue> {
  const values: Record<string, ModalValue> = {}

  visitModalComponents(interaction.data.components, (component) => {
    if (!('custom_id' in component) || !component.custom_id) {
      return
    }

    if ('value' in component && typeof component.value === 'string') {
      values[component.custom_id] = component.value
      return
    }

    if ('values' in component && Array.isArray(component.values)) {
      values[component.custom_id] = component.values
      return
    }

    if ('value' in component && typeof component.value === 'boolean') {
      values[component.custom_id] = component.value
    }
  })

  if (kind === 'feature') {
    return {
      [FEATURE_MODAL_FIELDS.title]: typeof values[FEATURE_MODAL_FIELDS.title] === 'string' ? values[FEATURE_MODAL_FIELDS.title] : '',
      [FEATURE_MODAL_FIELDS.benefit]:
        typeof values[FEATURE_MODAL_FIELDS.benefit] === 'string' ? values[FEATURE_MODAL_FIELDS.benefit] : '',
      [FEATURE_MODAL_FIELDS.description]:
        typeof values[FEATURE_MODAL_FIELDS.description] === 'string' ? values[FEATURE_MODAL_FIELDS.description] : '',
      [FEATURE_MODAL_FIELDS.screenshot]: Array.isArray(values[FEATURE_MODAL_FIELDS.screenshot]) ? values[FEATURE_MODAL_FIELDS.screenshot] : []
    }
  }

  return {
    [BUG_MODAL_FIELDS.title]: typeof values[BUG_MODAL_FIELDS.title] === 'string' ? values[BUG_MODAL_FIELDS.title] : '',
    [BUG_MODAL_FIELDS.platform]: Array.isArray(values[BUG_MODAL_FIELDS.platform])
      ? (values[BUG_MODAL_FIELDS.platform] as string[])[0] ?? ''
      : '',
    [BUG_MODAL_FIELDS.severity]: Array.isArray(values[BUG_MODAL_FIELDS.severity])
      ? (values[BUG_MODAL_FIELDS.severity] as string[])[0] ?? ''
      : '',
    [BUG_MODAL_FIELDS.description]:
      typeof values[BUG_MODAL_FIELDS.description] === 'string' ? values[BUG_MODAL_FIELDS.description] : '',
    [BUG_MODAL_FIELDS.steps]: typeof values[BUG_MODAL_FIELDS.steps] === 'string' ? values[BUG_MODAL_FIELDS.steps] : '',
    [BUG_MODAL_FIELDS.expected]: typeof values[BUG_MODAL_FIELDS.expected] === 'string' ? values[BUG_MODAL_FIELDS.expected] : '',
    [BUG_MODAL_FIELDS.actual]: typeof values[BUG_MODAL_FIELDS.actual] === 'string' ? values[BUG_MODAL_FIELDS.actual] : '',
    [BUG_MODAL_FIELDS.screenshot]: Array.isArray(values[BUG_MODAL_FIELDS.screenshot]) ? values[BUG_MODAL_FIELDS.screenshot] : []
  }
}

export function getModalUploadedAttachmentUrl(interaction: APIModalSubmitInteraction, customId: string): string | null {
  const kind = customId.startsWith('feature_') ? 'feature' : 'bug'
  const values = getModalFieldValues(interaction, kind)
  const attachmentIds = values[customId]

  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return null
  }

  const attachments = (interaction.data.resolved as AttachmentResolvedData | undefined)?.attachments ?? {}
  const attachment = attachments[attachmentIds[0] ?? '']
  return attachment?.url ?? null
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
      if (!Number.isNaN(bugId) && bugId > 0) {
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
