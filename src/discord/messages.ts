import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  SeparatorSpacingSize,
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
  type APIMediaGalleryComponent,
  type APIModalInteractionResponse,
  type APIModalInteractionResponseCallbackComponent,
  type APISectionComponent,
  type APIThumbnailComponent,
  type APISelectMenuOption,
  type APISeparatorComponent,
  type APIStringSelectComponent,
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
  upvotes: '\u2B06\uFE0F'
} as const

const bugStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0xe74c3c },
  ACKNOWLEDGED: { label: 'Acknowledged', emoji: EMOJI.acknowledged, color: 0xf39c12 },
  IN_PROGRESS: { label: 'In Progress', emoji: EMOJI.progress, color: 0xf1c40f },
  FIXED: { label: 'Fixed', emoji: EMOJI.fixed, color: 0x27ae60 },
  CLOSED: { label: 'Closed', emoji: EMOJI.closed, color: 0x5d6d7e },
  DUPLICATE: { label: 'Duplicate', emoji: EMOJI.duplicate, color: 0x7f8c8d }
} as const

const feedbackStatusMeta = {
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

function textDisplay(content: string): APITextDisplayComponent {
  return { type: ComponentType.TextDisplay, content }
}

function separator(): APISeparatorComponent {
  return { type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small }
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

function maybeMediaGallery(url: string | null, description: string): APIMediaGalleryComponent | null {
  if (!url) return null
  return {
    type: ComponentType.MediaGallery,
    items: [{ media: { url }, description }]
  }
}

function sourceMessageLabel(url: string | null): string | null {
  return url ? `[Source message](${url})` : null
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

export function featureModalResponse(
  initialDescription = '',
  options?: { sourceGuildId?: string | null; sourceChannelId?: string | null; sourceMessageId?: string | null }
): APIModalInteractionResponse {
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
      custom_id: buildFeatureModalCustomId(
        options?.sourceGuildId ?? null,
        options?.sourceChannelId ?? null,
        options?.sourceMessageId ?? null
      ),
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

export function myItemsResponse(kind: 'bug' | 'feedback', items: Array<BugSummary | FeatureSummary>): APIInteractionResponse {
  if (items.length === 0) {
    return ephemeralMessage(`You have not created any ${kind === 'bug' ? 'bugs' : 'feedback'} yet.`)
  }

  const content = items
    .slice(0, 5)
    .map((item) => `- #${item.id} ${item.title} (${item.status})`)
    .join('\n')

  return ephemeralMessage(content)
}

export function roadmapListResponse(features: FeatureSummary[]): APIInteractionResponse {
  if (features.length === 0) {
    return ephemeralMessage('No roadmap items are currently planned or in progress.')
  }

  return ephemeralMessage(
    features
      .slice(0, 8)
      .map((feature) => `- ${EMOJI.feedback} #${feature.id} ${feature.title} (${feature.status})`)
      .join('\n')
  )
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

  return ephemeralMessage(`Manage feedback #${feature.id}`, buttonRows(buttons))
}

function buildBugSummaryLines(
  bug: BugRecord,
  followerCount: number,
  options?: { relatedBugUrl?: string | null; sourceMessageUrl?: string | null }
): string[] {
  const status = bugStatusMeta[bug.status]
  const lines = [
    `${status.emoji} **${status.label}**`,
    `${EMOJI.upvotes} **${bug.votes_count}** upvotes`,
    `${EMOJI.follow} **${followerCount}** followers`,
    `Reporter: <@${bug.reporter_id}>`
  ]

  if (bug.platform) {
    lines.push(`Platform: ${bugPlatformLabels[bug.platform] ?? bug.platform}`)
  }

  if (bug.severity) {
    lines.push(`Severity: ${bugSeverityLabels[bug.severity] ?? bug.severity}`)
  }

  if (bug.status_note) {
    lines.push(`Note: ${bug.status_note}`)
  }

  if (bug.status === 'DUPLICATE' && options?.relatedBugUrl && bug.related_bug_id) {
    lines.push(`Tracking under [bug #${bug.related_bug_id}](${options.relatedBugUrl})`)
  }

  const source = sourceMessageLabel(options?.sourceMessageUrl ?? null)
  if (source) {
    lines.push(source)
  }

  return lines
}

function buildFeatureSummaryLines(feature: FeatureRecord, followerCount: number, options?: { sourceMessageUrl?: string | null }): string[] {
  const status = feedbackStatusMeta[feature.status]
  const lines = [
    `${status.emoji} **${status.label}**`,
    `${EMOJI.upvotes} **${feature.votes_count}** upvotes`,
    `${EMOJI.follow} **${followerCount}** followers`,
    `Reporter: <@${feature.reporter_id}>`
  ]

  if (feature.status_note) {
    lines.push(`Note: ${feature.status_note}`)
  }

  const source = sourceMessageLabel(options?.sourceMessageUrl ?? null)
  if (source) {
    lines.push(source)
  }

  return lines
}

function buildBugActionRow(bug: BugRecord, bugUrl: string | null): ButtonRow {
  const isClosed = bug.status === 'FIXED' || bug.status === 'CLOSED' || bug.status === 'DUPLICATE'
  const buttons: MessageButton[] = [
    button(`${CUSTOM_IDS.upvotePrefix}${bug.id}`, 'Upvote', ButtonStyle.Primary, isClosed),
    button(`${CUSTOM_IDS.followPrefix}${bug.id}`, 'Follow', ButtonStyle.Secondary),
    ...(bugUrl ? [linkButton('Open Card', bugUrl)] : []),
    button(bugManageCustomId(bug.id), 'Manage', ButtonStyle.Secondary)
  ]

  return itemCardActionRow(buttons)
}

function buildFeatureActionRow(feature: FeatureRecord, featureUrl: string | null): ButtonRow {
  const buttons: MessageButton[] = [
    button(`${CUSTOM_IDS.featureUpvotePrefix}${feature.id}`, 'Upvote', ButtonStyle.Primary, feature.status !== 'OPEN'),
    button(`${CUSTOM_IDS.featureFollowPrefix}${feature.id}`, 'Follow', ButtonStyle.Secondary),
    ...(featureUrl ? [linkButton('Open Card', featureUrl)] : []),
    button(featureManageCustomId(feature.id), 'Manage', ButtonStyle.Secondary)
  ]

  return itemCardActionRow(buttons)
}

function bugCardComponents(
  bug: BugRecord,
  followerCount: number,
  options?: {
    relatedBug?: Pick<BugRecord, 'id' | 'title'> | null
    relatedBugUrl?: string | null
    bugUrl?: string | null
    sourceMessageUrl?: string | null
  }
): APIContainerComponent[] {
  const status = bugStatusMeta[bug.status]
  const title = `#${bug.id} ${truncate(bug.title, 140)}`
  const summary = compactValue(bug.description) ?? 'No additional details provided.'
  const summaryLines = buildBugSummaryLines(bug, followerCount, {
    relatedBugUrl: options?.relatedBugUrl ?? null,
    sourceMessageUrl: options?.sourceMessageUrl ?? null
  }).join('\n')

  const sectionAccessory = bug.screenshot_url
    ? ({ type: ComponentType.Thumbnail, media: { url: bug.screenshot_url }, description: 'Bug screenshot' } satisfies APIThumbnailComponent)
    : (options?.bugUrl
        ? linkButton('Open Card', options.bugUrl)
        : button(bugManageCustomId(bug.id, 'section'), 'Manage', ButtonStyle.Secondary))

  const section: APISectionComponent = {
    type: ComponentType.Section,
    components: [textDisplay(`## ${EMOJI.bug} ${title}`), textDisplay(truncate(summary, 500))],
    accessory: sectionAccessory
  }

  const gallery = maybeMediaGallery(bug.screenshot_url, 'Bug screenshot')
  const components = [
    section,
    separator(),
    textDisplay(summaryLines),
    ...(gallery ? [gallery] : []),
    buildBugActionRow(bug, options?.bugUrl ?? null)
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
  followerCount: number,
  options?: { featureUrl?: string | null; sourceMessageUrl?: string | null }
): APIContainerComponent[] {
  const status = feedbackStatusMeta[feature.status]
  const title = `#${feature.id} ${truncate(feature.title, 140)}`
  const summary = compactValue(feature.description) ?? 'No additional details provided.'
  const summaryLines = buildFeatureSummaryLines(feature, followerCount, { sourceMessageUrl: options?.sourceMessageUrl ?? null }).join('\n')

  const sectionAccessory = feature.screenshot_url
    ? ({ type: ComponentType.Thumbnail, media: { url: feature.screenshot_url }, description: 'Feedback screenshot' } satisfies APIThumbnailComponent)
    : (options?.featureUrl
        ? linkButton('Open Card', options.featureUrl)
        : button(featureManageCustomId(feature.id, 'section'), 'Manage', ButtonStyle.Secondary))

  const section: APISectionComponent = {
    type: ComponentType.Section,
    components: [textDisplay(`## ${EMOJI.feedback} ${title}`), textDisplay(truncate(summary, 500))],
    accessory: sectionAccessory
  }

  const gallery = maybeMediaGallery(feature.screenshot_url, 'Feedback screenshot')
  const components = [
    section,
    separator(),
    textDisplay(summaryLines),
    ...(gallery ? [gallery] : []),
    buildFeatureActionRow(feature, options?.featureUrl ?? null)
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
    components: bugCardComponents(bug, options?.followerCount ?? 0, options)
  }
}

export function renderFeatureMessage(
  feature: FeatureRecord,
  options?: { featureUrl?: string | null; sourceMessageUrl?: string | null; followerCount?: number }
): DiscordMessagePayload {
  return {
    allowed_mentions: { parse: [] },
    flags: MessageFlags.IsComponentsV2,
    components: featureCardComponents(feature, options?.followerCount ?? 0, options)
  }
}

export const renderLegacyBugMessage = renderBugMessage
export const renderLegacyFeatureMessage = renderFeatureMessage
