import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIButtonComponentWithURL,
  type APIEmbed,
  type APIFileUploadComponent,
  type APIInteractionResponse,
  type APIInteractionResponseChannelMessageWithSource,
  type APIInteractionResponseDeferredMessageUpdate,
  type APILabelComponent,
  type APIModalInteractionResponse,
  type APIModalInteractionResponseCallbackComponent,
  type APISelectMenuOption,
  type APIStringSelectComponent,
  type APITextInputComponent,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageJSONBody
} from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from '../constants'
import type { BugPreflightMatch, BugRecord, BugRelationshipType, BugSummary, FeatureRecord } from '../types'
import { buildBugModalCustomId, buildDuplicateSelectionCustomId, buildPreflightCustomId } from './interactions'

type MessageButton = APIButtonComponentWithCustomId | APIButtonComponentWithURL
type ButtonRow = APIActionRowComponent<MessageButton>
type DiscordMessagePayload = RESTPostAPIChannelMessageJSONBody | RESTPatchAPIChannelMessageJSONBody

const EMOJI = {
  bug: '\u{1F41E}',
  feedback: '\u2728',
  open: '\u{1F534}',
  progress: '\u{1F6E0}\uFE0F',
  fixed: '\u2705',
  closed: '\u26AA',
  duplicate: '\u{1F501}',
  upvotes: '\u2B06\uFE0F',
  reporter: '\u{1F464}',
  regression: '\u21A9\uFE0F'
} as const

const bugStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0xe74c3c },
  IN_PROGRESS: { label: 'In Progress', emoji: EMOJI.progress, color: 0xf39c12 },
  FIXED: { label: 'Fixed', emoji: EMOJI.fixed, color: 0x27ae60 },
  CLOSED: { label: 'Closed', emoji: EMOJI.closed, color: 0x5d6d7e },
  DUPLICATE: { label: 'Duplicate', emoji: EMOJI.duplicate, color: 0x7f8c8d }
} as const

const feedbackStatusMeta = {
  OPEN: { label: 'Open', emoji: '\u{1F7E2}', color: 0xf1c40f },
  PLANNED: { label: 'Planned', emoji: '\u{1F5FA}\uFE0F', color: 0x3498db },
  SHIPPED: { label: 'Shipped', emoji: '\u{1F680}', color: 0x2ecc71 },
  CLOSED: { label: 'Closed', emoji: EMOJI.closed, color: 0x5d6d7e }
} as const

const bugPlatformLabels: Record<string, string> = {
  WEB: 'Web',
  IOS: 'iOS',
  ANDROID: 'Android',
  DESKTOP: 'Desktop',
  OTHER: 'Other'
}

const bugSeverityLabels: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical'
}

function compactValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function displayValue(value: string, fallback = 'Not provided yet.'): string {
  return compactValue(value) ?? fallback
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function modalLabel(label: string, component: APILabelComponent['component'], description?: string): APILabelComponent {
  return {
    type: ComponentType.Label,
    label,
    ...(description ? { description } : {}),
    component
  }
}

function paragraphTextInput(
  customId: string,
  label: string,
  options?: { required?: boolean; placeholder?: string; value?: string; maxLength?: number; description?: string }
): APILabelComponent {
  const component: APITextInputComponent = {
    type: ComponentType.TextInput,
    custom_id: customId,
    style: TextInputStyle.Paragraph,
    required: options?.required ?? false,
    ...(options?.placeholder ? { placeholder: options.placeholder } : {}),
    ...(options?.value ? { value: options.value } : {}),
    ...(options?.maxLength ? { max_length: options.maxLength } : {})
  }

  return modalLabel(label, component, options?.description)
}

function stringSelect(
  customId: string,
  label: string,
  options: APISelectMenuOption[],
  description: string,
  placeholder: string
): APILabelComponent {
  const component: APIStringSelectComponent = {
    type: ComponentType.StringSelect,
    custom_id: customId,
    min_values: 0,
    max_values: 1,
    placeholder,
    options
  }

  return modalLabel(label, component, description)
}

function fileUpload(customId: string, label: string, description: string): APILabelComponent {
  const component: APIFileUploadComponent = {
    type: ComponentType.FileUpload,
    custom_id: customId,
    min_values: 0,
    max_values: 1,
    required: false
  }

  return modalLabel(label, component, description)
}

function button(
  customId: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger,
  disabled = false
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    custom_id: customId,
    label,
    ...(disabled ? { disabled: true } : {})
  }
}

function linkButton(label: string, url: string): APIButtonComponentWithURL {
  return {
    type: ComponentType.Button,
    style: ButtonStyle.Link,
    label,
    url
  }
}

function buttonRows(buttons: MessageButton[]): ButtonRow[] {
  return chunk(buttons, 5).map((group) => ({
    type: ComponentType.ActionRow,
    components: group
  }))
}

export function ephemeralMessage(content: string, components: ButtonRow[] = []): APIInteractionResponseChannelMessageWithSource {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content,
      flags: 64,
      ...(components.length > 0 ? { components } : {})
    }
  }
}

export function silentComponentAck(): APIInteractionResponseDeferredMessageUpdate {
  return { type: InteractionResponseType.DeferredMessageUpdate }
}

export function bugModalResponse(options: {
  sessionId: string
  initialDescription: string
  relationshipType: BugRelationshipType | null
  targetBugId: number | null
}): APIModalInteractionResponse {
  const components: APIModalInteractionResponseCallbackComponent[] = [
    stringSelect(
      BUG_MODAL_FIELDS.platform,
      'Where did you hit it?',
      [
        { label: 'Web', value: 'WEB' },
        { label: 'iOS', value: 'IOS' },
        { label: 'Android', value: 'ANDROID' },
        { label: 'Desktop', value: 'DESKTOP' },
        { label: 'Other', value: 'OTHER' }
      ],
      'Optional, but it helps triage fast.',
      'Pick a platform'
    ),
    stringSelect(
      BUG_MODAL_FIELDS.severity,
      'How rough is it?',
      [
        { label: 'Low', value: 'LOW' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'High', value: 'HIGH' },
        { label: 'Critical', value: 'CRITICAL' }
      ],
      'Optional. Think user impact.',
      'Pick a severity'
    ),
    fileUpload(BUG_MODAL_FIELDS.screenshot, 'Screenshot', 'Optional. A quick visual goes a long way.'),
    paragraphTextInput(BUG_MODAL_FIELDS.description, 'Description', {
      value: options.initialDescription,
      placeholder: 'Describe the bug and any context that would help us understand it.',
      required: true,
      maxLength: 1000
    })
  ]

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: buildBugModalCustomId(options.sessionId, options.relationshipType, options.targetBugId),
      title: 'Report a bug',
      components
    }
  }
}

export function featureModalResponse(initialDescription = ''): APIModalInteractionResponse {
  const components: APIModalInteractionResponseCallbackComponent[] = [
    fileUpload(FEATURE_MODAL_FIELDS.screenshot, 'Mockup or screenshot', 'Optional. Sketches and references are great.'),
    paragraphTextInput(FEATURE_MODAL_FIELDS.description, 'Description', {
      value: initialDescription,
      placeholder: 'Describe the feedback or idea you want to share.',
      required: true,
      maxLength: 1000
    })
  ]

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: CUSTOM_IDS.featureModal,
      title: 'Share feedback',
      components
    }
  }
}

export function bugPreflightResponse(
  sessionId: string,
  title: string,
  duplicates: BugPreflightMatch[],
  regressions: BugPreflightMatch[]
): APIInteractionResponseChannelMessageWithSource {
  const lines = [`${EMOJI.feedback} Close matches for "${title}"`]

  if (duplicates.length > 0) {
    lines.push('', 'Open bugs:')
    duplicates.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))
  }

  if (regressions.length > 0) {
    lines.push('', 'Recently closed bugs:')
    regressions.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))
  }

  const buttons: MessageButton[] = [
    ...duplicates.map((bug) =>
      button(buildPreflightCustomId(sessionId, 'DUPLICATE_OF', bug.id), `Duplicate #${bug.id}`, ButtonStyle.Secondary)
    ),
    ...regressions.map((bug) =>
      button(buildPreflightCustomId(sessionId, 'REGRESSION_OF', bug.id), `Regression #${bug.id}`, ButtonStyle.Secondary)
    ),
    button(buildPreflightCustomId(sessionId, null, null), 'Create New', ButtonStyle.Primary)
  ]

  return ephemeralMessage(lines.join('\n'), buttonRows(buttons))
}

export function duplicateSelectionResponse(sourceBug: Pick<BugRecord, 'id' | 'title'>, duplicates: BugPreflightMatch[]) {
  const lines = [`${EMOJI.duplicate} Pick the original report for "${sourceBug.title}"`]
  duplicates.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))

  return ephemeralMessage(
    lines.join('\n'),
    buttonRows(
      duplicates.map((bug) =>
        button(buildDuplicateSelectionCustomId(sourceBug.id, bug.id), `Bug #${bug.id}`, ButtonStyle.Secondary)
      )
    )
  )
}

export function topBugsResponse(bugs: BugSummary[]): APIInteractionResponse {
  if (bugs.length === 0) {
    return ephemeralMessage('No open bugs yet.')
  }

  const content = bugs
    .slice(0, 5)
    .map((bug, index) => `${index + 1}. ${EMOJI.bug} #${bug.id} - ${bug.votes_count} upvotes - ${bug.title}`)
    .join('\n')

  return ephemeralMessage(content)
}

function buildBugActionRow(bug: BugRecord, bugUrl: string | null, relatedBugUrl: string | null): ButtonRow {
  const isClosed = bug.status === 'FIXED' || bug.status === 'CLOSED' || bug.status === 'DUPLICATE'
  const buttons: MessageButton[] = [button(`${CUSTOM_IDS.upvotePrefix}${bug.id}`, 'Upvote', ButtonStyle.Primary, isClosed)]

  const openUrl = bug.status === 'DUPLICATE' ? relatedBugUrl : bugUrl
  if (openUrl) {
    buttons.push(linkButton(bug.status === 'DUPLICATE' ? 'Open Original' : 'Open Card', openUrl))
  }

  buttons.push(
    button(`${CUSTOM_IDS.duplicatePrefix}${bug.id}`, 'Mark as Duplicate', ButtonStyle.Secondary, isClosed)
  )

  return {
    type: ComponentType.ActionRow,
    components: buttons
  }
}

function buildFeatureActionRow(feature: FeatureRecord, featureUrl: string | null): ButtonRow {
  const buttons: MessageButton[] = [
    button(`${CUSTOM_IDS.featureUpvotePrefix}${feature.id}`, 'Upvote', ButtonStyle.Primary, feature.status !== 'OPEN')
  ]

  if (featureUrl) {
    buttons.push(linkButton('Open Card', featureUrl))
  }

  return {
    type: ComponentType.ActionRow,
    components: buttons
  }
}

function bugDescription(bug: BugRecord, relatedBugUrl: string | null, relatedBugTitle: string | null): string {
  if (bug.status === 'DUPLICATE' && relatedBugUrl && relatedBugTitle) {
    return `Tracking under [bug #${bug.related_bug_id} ${relatedBugTitle}](${relatedBugUrl}).`
  }

  const lines: string[] = []
  const description = compactValue(bug.description)

  if (description) lines.push(truncate(description, 900))
  if (bug.relationship_type === 'REGRESSION_OF' && relatedBugUrl && relatedBugTitle) {
    lines.push(`**Regression of**\n[bug #${bug.related_bug_id} ${relatedBugTitle}](${relatedBugUrl})`)
  }

  return lines.join('\n\n')
}

function feedbackDescription(feature: FeatureRecord): string {
  const description = compactValue(feature.description)
  return description ? truncate(description, 900) : ''
}

export function renderBugMessage(
  bug: BugRecord,
  options?: { relatedBug?: Pick<BugRecord, 'id' | 'title'> | null; relatedBugUrl?: string | null; bugUrl?: string | null }
): DiscordMessagePayload {
  return renderLegacyBugMessage(bug, options)
}

export function renderFeatureMessage(feature: FeatureRecord, options?: { featureUrl?: string | null }): DiscordMessagePayload {
  return renderLegacyFeatureMessage(feature, options)
}

export function renderLegacyBugMessage(
  bug: BugRecord,
  options?: { relatedBug?: Pick<BugRecord, 'id' | 'title'> | null; relatedBugUrl?: string | null; bugUrl?: string | null }
): RESTPostAPIChannelMessageJSONBody {
  const status = bugStatusMeta[bug.status]
  const fields: NonNullable<APIEmbed['fields']> = [
    { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
    { name: 'Upvotes', value: `${EMOJI.upvotes} ${bug.votes_count}`, inline: true },
    { name: 'Reporter', value: `${EMOJI.reporter} <@${bug.reporter_id}>`, inline: true }
  ]

  if (bug.platform) fields.push({ name: 'Platform', value: bugPlatformLabels[bug.platform] ?? bug.platform, inline: true })
  if (bug.severity) fields.push({ name: 'Severity', value: bugSeverityLabels[bug.severity] ?? bug.severity, inline: true })
  if (bug.linked_duplicates_count > 0) fields.push({ name: 'Linked dupes', value: String(bug.linked_duplicates_count), inline: true })
  if (bug.regressions_count > 0) fields.push({ name: 'Regressions', value: String(bug.regressions_count), inline: true })

  const description = bugDescription(bug, options?.relatedBugUrl ?? null, options?.relatedBug?.title ?? null)
  const embed: APIEmbed = {
    title: `${EMOJI.bug} Bug #${bug.id} - ${truncate(bug.title, 240)}`,
    description: description || displayValue(bug.description, 'Concise bug card, details coming soon.'),
    color: status.color,
    fields,
    footer: {
      text: bug.status === 'DUPLICATE' ? 'Concise duplicate card' : 'Bug report'
    },
    timestamp: bug.updated_at
  }

  if (bug.screenshot_url) {
    embed.image = { url: bug.screenshot_url }
  }

  return {
    allowed_mentions: { parse: [] },
    embeds: [embed],
    components: [buildBugActionRow(bug, options?.bugUrl ?? null, options?.relatedBugUrl ?? null)]
  }
}

export function renderLegacyFeatureMessage(
  feature: FeatureRecord,
  options?: { featureUrl?: string | null }
): RESTPostAPIChannelMessageJSONBody {
  const status = feedbackStatusMeta[feature.status]
  const description = feedbackDescription(feature)
  const fields: NonNullable<APIEmbed['fields']> = [
    { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
    { name: 'Upvotes', value: `${EMOJI.upvotes} ${feature.votes_count}`, inline: true },
    { name: 'Reporter', value: `${EMOJI.reporter} <@${feature.reporter_id}>`, inline: true }
  ]

  const embed: APIEmbed = {
    title: `${EMOJI.feedback} Feedback #${feature.id} - ${truncate(feature.title, 240)}`,
    description: description || displayValue(feature.description, 'A short feedback card.'),
    color: status.color,
    fields,
    footer: {
      text: 'Feedback'
    },
    timestamp: feature.updated_at
  }

  if (feature.screenshot_url) {
    embed.image = { url: feature.screenshot_url }
  }

  return {
    allowed_mentions: { parse: [] },
    embeds: [embed],
    components: [buildFeatureActionRow(feature, options?.featureUrl ?? null)]
  }
}
