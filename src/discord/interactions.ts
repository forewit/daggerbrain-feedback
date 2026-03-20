import { verifyKey } from 'discord-interactions'
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionType,
  type APIApplicationCommandInteraction,
  type APIApplicationCommandAutocompleteInteraction,
  type APIAttachment,
  type APIInteraction,
  type APIMessage,
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
  messages?: Record<string, APIMessage>
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

export function isAutocompleteInteraction(
  interaction: APIInteraction
): interaction is APIApplicationCommandAutocompleteInteraction {
  return interaction.type === InteractionType.ApplicationCommandAutocomplete
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

export function getInteractionGuildId(interaction: APIInteraction): string | null {
  return interaction.guild_id ?? null
}

export function getInteractionChannelId(interaction: APIInteraction): string | null {
  return interaction.channel_id ?? null
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

export function getCommandOptionAttachment(interaction: APIApplicationCommandInteraction, name: string): APIAttachment | null {
  const value = getCommandOptionValue(interaction, name)
  if (typeof value !== 'string') {
    return null
  }

  const attachments = ((interaction.data as { resolved?: AttachmentResolvedData }).resolved)?.attachments ?? {}
  return attachments[value] ?? null
}

export function getCommandName(interaction: APIApplicationCommandInteraction): string {
  return interaction.data.name
}

export function getCommandPath(interaction: APIApplicationCommandInteraction): string[] {
  const path = [interaction.data.name]
  const options = (interaction.data as { options?: Array<{ name?: string; type?: number; options?: unknown[] }> }).options ?? []
  const first = options[0]

  if (
    first?.name &&
    (first.type === ApplicationCommandOptionType.Subcommand || first.type === ApplicationCommandOptionType.SubcommandGroup)
  ) {
    path.push(first.name)
  }

  if (first?.type === ApplicationCommandOptionType.SubcommandGroup) {
    const nested = (first.options as Array<{ name?: string; type?: number }> | undefined)?.[0]
    if (nested?.name && nested.type === ApplicationCommandOptionType.Subcommand) {
      path.push(nested.name)
    }
  }

  return path
}

export function isMessageCommandInteraction(interaction: APIApplicationCommandInteraction): boolean {
  return interaction.data.type === ApplicationCommandType.Message
}

export function getMessageCommandTarget(interaction: APIApplicationCommandInteraction): {
  messageId: string
  content: string
  attachmentUrl: string | null
} | null {
  if (!isMessageCommandInteraction(interaction)) {
    return null
  }

  const targetId = (interaction.data as { target_id?: string }).target_id
  const messages = ((interaction.data as { resolved?: AttachmentResolvedData }).resolved)?.messages ?? {}
  const message = targetId ? messages[targetId] : null
  if (!message) {
    return null
  }

  const attachment = Object.values(message.attachments ?? {})[0]
  return {
    messageId: message.id,
    content: message.content ?? '',
    attachmentUrl: attachment?.url ?? null
  }
}

export function getFocusedAutocompleteOption(interaction: APIApplicationCommandAutocompleteInteraction): {
  name: string
  value: string | number
} | null {
  const options = flattenCommandOptions((interaction.data as { options?: Array<CommandOption & { focused?: boolean }> }).options)
  const focused = options.find((option) => 'focused' in option && (option as { focused?: boolean }).focused)
  if (!focused?.name || focused.value === undefined || typeof focused.value === 'boolean') {
    return null
  }

  return {
    name: focused.name,
    value: focused.value
  }
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
      [FEATURE_MODAL_FIELDS.description]:
        typeof values[FEATURE_MODAL_FIELDS.description] === 'string' ? values[FEATURE_MODAL_FIELDS.description] : '',
      [FEATURE_MODAL_FIELDS.screenshot]: Array.isArray(values[FEATURE_MODAL_FIELDS.screenshot]) ? values[FEATURE_MODAL_FIELDS.screenshot] : []
    }
  }

  return {
    [BUG_MODAL_FIELDS.platform]: Array.isArray(values[BUG_MODAL_FIELDS.platform])
      ? (values[BUG_MODAL_FIELDS.platform] as string[])[0] ?? ''
      : '',
    [BUG_MODAL_FIELDS.severity]: Array.isArray(values[BUG_MODAL_FIELDS.severity])
      ? (values[BUG_MODAL_FIELDS.severity] as string[])[0] ?? ''
      : '',
    [BUG_MODAL_FIELDS.description]:
      typeof values[BUG_MODAL_FIELDS.description] === 'string' ? values[BUG_MODAL_FIELDS.description] : '',
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

export function getFeatureSubmissionValues(interaction: APIModalSubmitInteraction): {
  description: string
  screenshot_url: string | null
} {
  const values = getModalFieldValues(interaction, 'feature')
  const description = values[FEATURE_MODAL_FIELDS.description]
  return {
    description: typeof description === 'string' ? description : '',
    screenshot_url: getModalUploadedAttachmentUrl(interaction, FEATURE_MODAL_FIELDS.screenshot)
  }
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

export function buildFeatureModalCustomId(
  sourceGuildId: string | null,
  sourceChannelId: string | null,
  sourceMessageId: string | null
): string {
  if (!sourceGuildId || !sourceChannelId || !sourceMessageId) {
    return CUSTOM_IDS.featureModal
  }

  return `${CUSTOM_IDS.featureModalPrefix}${sourceGuildId}:${sourceChannelId}:${sourceMessageId}`
}

export function parseFeatureModalCustomId(
  customId: string | undefined
): { sourceGuildId: string | null; sourceChannelId: string | null; sourceMessageId: string | null } | null {
  if (!customId) return null

  if (customId === CUSTOM_IDS.featureModal) {
    return { sourceGuildId: null, sourceChannelId: null, sourceMessageId: null }
  }

  if (!customId.startsWith(CUSTOM_IDS.featureModalPrefix)) {
    return null
  }

  const payload = customId.slice(CUSTOM_IDS.featureModalPrefix.length)
  const [sourceGuildId, sourceChannelId, sourceMessageId] = payload.split(':')
  if (!sourceGuildId || !sourceChannelId || !sourceMessageId) {
    return null
  }

  return { sourceGuildId, sourceChannelId, sourceMessageId }
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

export function parseSubscriptionAction(
  customId: string | undefined
): { itemKind: 'bug' | 'feature'; itemId: number; action: 'follow' | 'unfollow' } | null {
  if (!customId) return null

  const mappings = [
    [CUSTOM_IDS.followPrefix, 'bug', 'follow'],
    [CUSTOM_IDS.unfollowPrefix, 'bug', 'unfollow'],
    [CUSTOM_IDS.featureFollowPrefix, 'feature', 'follow'],
    [CUSTOM_IDS.featureUnfollowPrefix, 'feature', 'unfollow']
  ] as const

  for (const [prefix, itemKind, action] of mappings) {
    if (customId.startsWith(prefix)) {
      const itemId = Number(customId.slice(prefix.length))
      if (!Number.isNaN(itemId) && itemId > 0) {
        return { itemKind, itemId, action }
      }
    }
  }

  return null
}

export function parseManageAction(
  customId: string | undefined
): { itemKind: 'bug' | 'feature'; itemId: number } | null {
  if (!customId) return null

  if (customId.startsWith(CUSTOM_IDS.manageBugPrefix)) {
    const itemId = Number(customId.slice(CUSTOM_IDS.manageBugPrefix.length).split(':')[0])
    return !Number.isNaN(itemId) && itemId > 0 ? { itemKind: 'bug', itemId } : null
  }

  if (customId.startsWith(CUSTOM_IDS.manageFeaturePrefix)) {
    const itemId = Number(customId.slice(CUSTOM_IDS.manageFeaturePrefix.length).split(':')[0])
    return !Number.isNaN(itemId) && itemId > 0 ? { itemKind: 'feature', itemId } : null
  }

  return null
}

export function parseStatusAction(
  customId: string | undefined
): { itemKind: 'bug' | 'feature'; itemId: number; status: string } | null {
  if (!customId) return null

  const mappings = [
    [CUSTOM_IDS.bugStatusActionPrefix, 'bug'],
    [CUSTOM_IDS.featureStatusActionPrefix, 'feature']
  ] as const

  for (const [prefix, itemKind] of mappings) {
    if (customId.startsWith(prefix)) {
      const payload = customId.slice(prefix.length)
      const [itemIdValue, status] = payload.split(':')
      const itemId = Number(itemIdValue)
      if (!Number.isNaN(itemId) && itemId > 0 && status) {
        return { itemKind, itemId, status }
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
