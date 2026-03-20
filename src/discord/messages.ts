import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIButtonComponentWithURL,
  type APIContainerComponent,
  type APIFileUploadComponent,
  type APIInteractionResponse,
  type APIInteractionResponseChannelMessageWithSource,
  type APIInteractionResponseDeferredMessageUpdate,
  type APILabelComponent,
  type APIModalInteractionResponse,
  type APIModalInteractionResponseCallbackComponent,
  type APISectionAccessoryComponent,
  type APISectionComponent,
  type APIThumbnailComponent,
  type APITextDisplayComponent,
  type APITextInputComponent,
  type RESTPostAPIChannelMessageJSONBody
} from 'discord-api-types/v10'
import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from '../constants'
import type { BugPreflightMatch, BugRecord, BugRelationshipType, BugSummary, FeatureRecord, FeatureSummary } from '../types'
import {
  buildBugModalCustomId,
  buildDuplicateSelectionCustomId,
  buildFeatureModalCustomId,
  buildPreflightCustomId
} from './interactions'

type MessageButton = APIButtonComponentWithCustomId | APIButtonComponentWithURL
type ButtonRow = APIActionRowComponent<MessageButton>
type DiscordMessagePayload = RESTPostAPIChannelMessageJSONBody

const EMOJI = {
  bug: '\u{1F41E}',
  feedback: '\u2728',
  open: '\u{1F534}',
  acknowledged: '\u{1F7E0}',
  progress: '\u{1F6E0}\uFE0F',
  fixed: '\u2705',
  closed: '\u26AA',
  duplicate: '\u{1F501}',
  review: '\u{1F50D}',
  planned: '\u{1F5FA}\uFE0F',
  shipped: '\u{1F680}',
  declined: '\u{1F6AB}',
  follow: '\u{1F514}',
  upvotes: '\u2B06\uFE0F',
  upvoteCompact: '\u{1F53A}'
} as const

const BUG_KEY_MARKER = '\u{168A5}'
const FEATURE_KEY_MARKER = '\u2726'

const bugStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0xe74c3c },
  ACKNOWLEDGED: { label: 'Acknowledged', emoji: EMOJI.acknowledged, color: 0xf39c12 },
  IN_PROGRESS: { label: 'In Progress', emoji: EMOJI.progress, color: 0xf1c40f },
  FIXED: { label: 'Fixed', emoji: EMOJI.fixed, color: 0x27ae60 },
  CLOSED: { label: 'Closed', emoji: EMOJI.closed, color: 0x5d6d7e },
  DUPLICATE: { label: 'Duplicate', emoji: EMOJI.duplicate, color: 0x7f8c8d }
} as const

const suggestionStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0xf1c40f },
  UNDER_REVIEW: { label: 'Under Review', emoji: EMOJI.review, color: 0x3498db },
  PLANNED: { label: 'Planned', emoji: EMOJI.planned, color: 0x2980b9 },
  IN_PROGRESS: { label: 'In Progress', emoji: EMOJI.progress, color: 0xe67e22 },
  SHIPPED: { label: 'Shipped', emoji: EMOJI.shipped, color: 0x2ecc71 },
  DECLINED: { label: 'Declined', emoji: EMOJI.declined, color: 0x95a5a6 },
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

function textDisplay(content: string): APITextDisplayComponent {
  return { type: ComponentType.TextDisplay, content }
}

function bugStatusActionCustomId(bugId: number, status: string): string {
  return `${CUSTOM_IDS.bugStatusActionPrefix}${bugId}:${status}`
}

function featureStatusActionCustomId(featureId: number, status: string): string {
  return `${CUSTOM_IDS.featureStatusActionPrefix}${featureId}:${status}`
}

function bugManageCustomId(bugId: number, slot?: string): string {
  return slot ? `${CUSTOM_IDS.manageBugPrefix}${bugId}:${slot}` : `${CUSTOM_IDS.manageBugPrefix}${bugId}`
}

function featureManageCustomId(featureId: number, slot?: string): string {
  return slot ? `${CUSTOM_IDS.manageFeaturePrefix}${featureId}:${slot}` : `${CUSTOM_IDS.manageFeaturePrefix}${featureId}`
}

function itemCardActionRow(buttons: MessageButton[]): ButtonRow {
  return {
    type: ComponentType.ActionRow,
    components: buttons.slice(0, 5)
  }
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
    fileUpload(BUG_MODAL_FIELDS.screenshot, 'Screenshot', 'Optional. A quick visual goes a long way.'),
    paragraphTextInput(BUG_MODAL_FIELDS.description, 'Description', {
      value: options.initialDescription,
      placeholder: 'Describe the bug, and include platform or severity if it matters.',
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

export function featureModalResponse(
  initialDescription = '',
  options?: { sourceGuildId?: string | null; sourceChannelId?: string | null; sourceMessageId?: string | null }
): APIModalInteractionResponse {
  const components: APIModalInteractionResponseCallbackComponent[] = [
    fileUpload(FEATURE_MODAL_FIELDS.screenshot, 'Mockup or screenshot', 'Optional. Sketches and references are great.'),
    paragraphTextInput(FEATURE_MODAL_FIELDS.description, 'Description', {
      value: initialDescription,
      placeholder: 'Describe the suggestion or idea you want to share.',
      required: true,
      maxLength: 1000
    })
  ]

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: buildFeatureModalCustomId(
        options?.sourceGuildId ?? null,
        options?.sourceChannelId ?? null,
        options?.sourceMessageId ?? null
      ),
      title: 'Share a suggestion',
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

export function myItemsResponse(kind: 'bug' | 'suggestion', items: Array<BugSummary | FeatureSummary>): APIInteractionResponse {
  if (items.length === 0) {
    return ephemeralMessage(`You have not created any ${kind === 'bug' ? 'bugs' : 'suggestions'} yet.`)
  }

  const content = items
    .slice(0, 5)
    .map((item) => `- #${item.id} ${item.title} (${item.status})`)
    .join('\n')

  return ephemeralMessage(content)
}

export function bugManageResponse(bug: BugRecord): APIInteractionResponse {
  const buttons: MessageButton[] = [
    button(bugStatusActionCustomId(bug.id, 'OPEN'), 'Open', ButtonStyle.Secondary, bug.status === 'OPEN'),
    button(
      bugStatusActionCustomId(bug.id, 'ACKNOWLEDGED'),
      'Acknowledge',
      ButtonStyle.Secondary,
      bug.status === 'ACKNOWLEDGED'
    ),
    button(
      bugStatusActionCustomId(bug.id, 'IN_PROGRESS'),
      'In Progress',
      ButtonStyle.Secondary,
      bug.status === 'IN_PROGRESS'
    ),
    button(bugStatusActionCustomId(bug.id, 'FIXED'), 'Fixed', ButtonStyle.Success, bug.status === 'FIXED'),
    button(bugStatusActionCustomId(bug.id, 'CLOSED'), 'Closed', ButtonStyle.Secondary, bug.status === 'CLOSED')
  ]

  return ephemeralMessage(`Manage bug #${bug.id}`, buttonRows(buttons))
}

export function featureManageResponse(feature: FeatureRecord): APIInteractionResponse {
  const buttons: MessageButton[] = [
    button(featureStatusActionCustomId(feature.id, 'OPEN'), 'Open', ButtonStyle.Secondary, feature.status === 'OPEN'),
    button(
      featureStatusActionCustomId(feature.id, 'UNDER_REVIEW'),
      'Review',
      ButtonStyle.Secondary,
      feature.status === 'UNDER_REVIEW'
    ),
    button(
      featureStatusActionCustomId(feature.id, 'PLANNED'),
      'Planned',
      ButtonStyle.Secondary,
      feature.status === 'PLANNED'
    ),
    button(
      featureStatusActionCustomId(feature.id, 'IN_PROGRESS'),
      'In Progress',
      ButtonStyle.Secondary,
      feature.status === 'IN_PROGRESS'
    ),
    button(
      featureStatusActionCustomId(feature.id, 'SHIPPED'),
      'Shipped',
      ButtonStyle.Success,
      feature.status === 'SHIPPED'
    ),
    button(
      featureStatusActionCustomId(feature.id, 'DECLINED'),
      'Declined',
      ButtonStyle.Danger,
      feature.status === 'DECLINED'
    ),
    button(
      featureStatusActionCustomId(feature.id, 'CLOSED'),
      'Closed',
      ButtonStyle.Secondary,
      feature.status === 'CLOSED'
    )
  ]

  return ephemeralMessage(`Manage suggestion #${feature.id}`, buttonRows(buttons))
}

function buildItemKey(kind: 'bug' | 'feature', id: number): string {
  return `${kind === 'bug' ? BUG_KEY_MARKER : FEATURE_KEY_MARKER} #${id}`
}

function buildReporterSummary(reporterId: string, description: string): string {
  const summary = compactValue(description) ?? 'No additional details provided.'
  return truncate(`<@${reporterId}> ${summary}`, 500)
}

function buildBugHeaderText(bug: BugRecord): string {
  const status = bugStatusMeta[bug.status]
  return `${buildItemKey('bug', bug.id)} - ${status.label} Bug`
}

function buildFeatureHeaderText(feature: FeatureRecord): string {
  const status = suggestionStatusMeta[feature.status]
  return `${buildItemKey('feature', feature.id)} - ${status.label} Suggestion`
}

function buildBugActionRow(bug: BugRecord): ButtonRow {
  const isClosed = bug.status === 'FIXED' || bug.status === 'CLOSED' || bug.status === 'DUPLICATE'
  const buttons: MessageButton[] = [
    button(`${CUSTOM_IDS.upvotePrefix}${bug.id}`, `${EMOJI.upvoteCompact} ${bug.votes_count}`, ButtonStyle.Primary, isClosed),
    button(`${CUSTOM_IDS.followPrefix}${bug.id}`, 'Follow', ButtonStyle.Secondary),
    button(bugManageCustomId(bug.id), 'Manage', ButtonStyle.Secondary)
  ]

  return itemCardActionRow(buttons)
}

function buildFeatureActionRow(feature: FeatureRecord): ButtonRow {
  const buttons: MessageButton[] = [
    button(
      `${CUSTOM_IDS.featureUpvotePrefix}${feature.id}`,
      `${EMOJI.upvoteCompact} ${feature.votes_count}`,
      ButtonStyle.Primary,
      feature.status !== 'OPEN'
    ),
    button(`${CUSTOM_IDS.featureFollowPrefix}${feature.id}`, 'Follow', ButtonStyle.Secondary),
    button(featureManageCustomId(feature.id), 'Manage', ButtonStyle.Secondary)
  ]

  return itemCardActionRow(buttons)
}

function bugCardComponents(
  bug: BugRecord,
  options?: {
    relatedBug?: Pick<BugRecord, 'id' | 'title'> | null
    relatedBugUrl?: string | null
    bugUrl?: string | null
    sourceMessageUrl?: string | null
  }
): APIContainerComponent[] {
  const status = bugStatusMeta[bug.status]
  const title = buildBugHeaderText(bug)
  const summary = buildReporterSummary(bug.reporter_id, bug.description)

  const sectionAccessory: APISectionAccessoryComponent | null = bug.screenshot_url
    ? ({ type: ComponentType.Thumbnail, media: { url: bug.screenshot_url }, description: 'Bug screenshot' } satisfies APIThumbnailComponent)
    : (options?.bugUrl
        ? linkButton('Open Card', options.bugUrl)
        : null)

  const components = sectionAccessory
    ? [
        {
          type: ComponentType.Section,
          components: [textDisplay(`### ${title}`), textDisplay(truncate(summary, 500))],
          accessory: sectionAccessory
        } satisfies APISectionComponent,
        buildBugActionRow(bug)
      ]
    : [
        textDisplay(`### ${title}`),
        textDisplay(summary),
        buildBugActionRow(bug)
      ]

  return [
    {
      type: ComponentType.Container,
      accent_color: status.color,
      components
    }
  ]
}

function featureCardComponents(
  feature: FeatureRecord,
  options?: { featureUrl?: string | null; sourceMessageUrl?: string | null }
): APIContainerComponent[] {
  const status = suggestionStatusMeta[feature.status]
  const title = buildFeatureHeaderText(feature)
  const summary = buildReporterSummary(feature.reporter_id, feature.description)

  const sectionAccessory: APISectionAccessoryComponent | null = feature.screenshot_url
    ? ({ type: ComponentType.Thumbnail, media: { url: feature.screenshot_url }, description: 'Suggestion screenshot' } satisfies APIThumbnailComponent)
    : (options?.featureUrl
        ? linkButton('Open Card', options.featureUrl)
        : null)

  const components = sectionAccessory
    ? [
        {
          type: ComponentType.Section,
          components: [textDisplay(`### ${title}`), textDisplay(truncate(summary, 500))],
          accessory: sectionAccessory
        } satisfies APISectionComponent,
        buildFeatureActionRow(feature)
      ]
    : [
        textDisplay(`### ${title}`),
        textDisplay(summary),
        buildFeatureActionRow(feature)
      ]

  return [
    {
      type: ComponentType.Container,
      accent_color: status.color,
      components
    }
  ]
}

export function renderBugMessage(
  bug: BugRecord,
  options?: {
    relatedBug?: Pick<BugRecord, 'id' | 'title'> | null
    relatedBugUrl?: string | null
    bugUrl?: string | null
    sourceMessageUrl?: string | null
    followerCount?: number
  }
): DiscordMessagePayload {
  return {
    allowed_mentions: { parse: [] },
    flags: MessageFlags.IsComponentsV2,
    components: bugCardComponents(bug, options)
  }
}

export function renderFeatureMessage(
  feature: FeatureRecord,
  options?: { featureUrl?: string | null; sourceMessageUrl?: string | null; followerCount?: number }
): DiscordMessagePayload {
  return {
    allowed_mentions: { parse: [] },
    flags: MessageFlags.IsComponentsV2,
    components: featureCardComponents(feature, options)
  }
}

export const renderLegacyBugMessage = renderBugMessage
export const renderLegacyFeatureMessage = renderFeatureMessage
