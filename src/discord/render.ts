import { BUG_MODAL_FIELDS, CUSTOM_IDS, FEATURE_MODAL_FIELDS } from '../constants'
import type { BugPreflightMatch, BugRecord, BugRelationshipType, FeatureRecord } from '../types'
import type { DiscordMessagePayload } from './api'
import { buildBugModalCustomId, buildDuplicateSelectionCustomId, buildPreflightCustomId } from './helpers'

const COMPONENTS_V2_FLAG = 1 << 15

const EMOJI = {
  bug: '\u{1F41E}',
  feature: '\u2728',
  open: '\u{1F7E2}',
  progress: '\u{1F6E0}\uFE0F',
  fixed: '\u2705',
  closed: '\u26AA',
  duplicate: '\u{1F501}',
  votes: '\u2B06\uFE0F',
  reporter: '\u{1F464}',
  regression: '\u21A9\uFE0F',
  screenshot: '\u{1F4F8}',
  spark: '\u2728'
} as const

function labelComponent(label: string, component: Record<string, unknown>, description?: string) {
  return {
    type: 18,
    label,
    description,
    component
  }
}

function textInput(
  customId: string,
  label: string,
  style: number,
  required = true,
  options?: { description?: string; placeholder?: string; value?: string; max_length?: number }
) {
  const component: Record<string, unknown> = { type: 4, custom_id: customId, style, required }

  if (options?.placeholder) component.placeholder = options.placeholder
  if (options?.value) component.value = options.value
  if (options?.max_length) component.max_length = options.max_length

  return labelComponent(label, component, options?.description)
}

function stringSelect(
  customId: string,
  label: string,
  options: Array<{ label: string; value: string; emoji?: string; default?: boolean }>,
  config?: { description?: string; placeholder?: string }
) {
  return labelComponent(
    label,
    {
      type: 3,
      custom_id: customId,
      min_values: 0,
      max_values: 1,
      placeholder: config?.placeholder,
      options: options.map((option) => ({
        label: option.label,
        value: option.value,
        ...(option.emoji ? { emoji: { name: option.emoji } } : {}),
        ...(option.default ? { default: true } : {})
      }))
    },
    config?.description
  )
}

function fileUpload(customId: string, label: string, description: string) {
  return labelComponent(
    label,
    {
      type: 19,
      custom_id: customId,
      min_values: 0,
      max_values: 1,
      required: false
    },
    description
  )
}

function displayValue(value: string, fallback = 'Not provided.') {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function compactValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function truncate(value: string, maxLength: number) {
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

const bugStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0x2ecc71 },
  IN_PROGRESS: { label: 'In Progress', emoji: EMOJI.progress, color: 0xf39c12 },
  FIXED: { label: 'Fixed', emoji: EMOJI.fixed, color: 0x27ae60 },
  CLOSED: { label: 'Closed', emoji: EMOJI.closed, color: 0x5d6d7e },
  DUPLICATE: { label: 'Duplicate', emoji: EMOJI.duplicate, color: 0x7f8c8d }
} as const

const featureStatusMeta = {
  OPEN: { label: 'Open', emoji: EMOJI.open, color: 0xf1c40f },
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

function textDisplay(content: string) {
  return { type: 10, content }
}

function separator() {
  return { type: 14 }
}

function quoteBlock(value: string) {
  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

function markdownLink(label: string, url: string | null) {
  return url ? `[${label}](${url})` : label
}

export function bugModalResponse(options: {
  sessionId: string
  initialTitle: string
  relationshipType: BugRelationshipType | null
  targetBugId: number | null
}) {
  return {
    type: 9,
    data: {
      custom_id: buildBugModalCustomId(options.sessionId, options.relationshipType, options.targetBugId),
      title: 'Report a bug',
      components: [
        textInput(BUG_MODAL_FIELDS.title, 'What broke?', 1, true, {
          description: 'Keep it short and searchable.',
          value: options.initialTitle,
          placeholder: 'Settings crashes when I open notifications',
          max_length: 100
        }),
        stringSelect(
          BUG_MODAL_FIELDS.platform,
          'Where did you hit it?',
          [
            { label: 'Web', value: 'WEB', emoji: '\u{1F310}' },
            { label: 'iOS', value: 'IOS', emoji: '\u{1F4F1}' },
            { label: 'Android', value: 'ANDROID', emoji: '\u{1F916}' },
            { label: 'Desktop', value: 'DESKTOP', emoji: '\u{1F4BB}' },
            { label: 'Other', value: 'OTHER', emoji: '\u{1F9E9}' }
          ],
          {
            description: 'Optional, but it helps us triage faster.',
            placeholder: 'Pick a platform'
          }
        ),
        stringSelect(
          BUG_MODAL_FIELDS.severity,
          'How rough is it?',
          [
            { label: 'Low', value: 'LOW', emoji: '\u{1F7E2}' },
            { label: 'Medium', value: 'MEDIUM', emoji: '\u{1F7E1}' },
            { label: 'High', value: 'HIGH', emoji: '\u{1F7E0}' },
            { label: 'Critical', value: 'CRITICAL', emoji: '\u{1F534}' }
          ],
          {
            description: 'Optional. Think user impact, not engineering pain.',
            placeholder: 'Pick a severity'
          }
        ),
        fileUpload(BUG_MODAL_FIELDS.screenshot, 'Screenshot', 'Optional. A quick visual makes these cards much more useful.'),
        textInput(BUG_MODAL_FIELDS.description, 'What happened?', 2, false, {
          placeholder: 'A concise summary of the problem.',
          max_length: 1000
        }),
        textInput(BUG_MODAL_FIELDS.steps, 'How can we repro it?', 2, false, {
          placeholder: '1. Open Settings\n2. Click Notifications\n3. The app freezes',
          max_length: 1000
        }),
        textInput(BUG_MODAL_FIELDS.expected, 'What should have happened?', 2, false, {
          placeholder: 'Notifications should open normally.',
          max_length: 1000
        }),
        textInput(BUG_MODAL_FIELDS.actual, 'What happened instead?', 2, false, {
          placeholder: 'The screen locks up and never recovers.',
          max_length: 1000
        })
      ]
    }
  }
}

export function featureModalResponse(initialTitle = '') {
  return {
    type: 9,
    data: {
      custom_id: CUSTOM_IDS.featureModal,
      title: 'Feature request',
      components: [
        textInput(FEATURE_MODAL_FIELDS.title, 'What should we build?', 1, true, {
          description: 'Short, punchy, and easy to scan.',
          value: initialTitle,
          placeholder: 'Add a search bar to the dashboard',
          max_length: 100
        }),
        textInput(FEATURE_MODAL_FIELDS.benefit, 'Why would this help?', 2, false, {
          description: 'A sentence or two is perfect.',
          placeholder: 'It would help people find old bugs and requests much faster.',
          max_length: 300
        }),
        fileUpload(FEATURE_MODAL_FIELDS.screenshot, 'Mockup or screenshot', 'Optional. Great for rough sketches, screenshots, or references.'),
        textInput(FEATURE_MODAL_FIELDS.description, 'Describe the idea', 2, false, {
          placeholder: 'Share the details, edge cases, or rough behavior you have in mind.',
          max_length: 1000
        })
      ]
    }
  }
}

export function bugPreflightResponse(
  sessionId: string,
  title: string,
  duplicates: BugPreflightMatch[],
  regressions: BugPreflightMatch[]
) {
  const lines = [`${EMOJI.spark} Found a few close matches for "${title}"`]

  if (duplicates.length > 0) {
    lines.push('', 'Open bugs:')
    duplicates.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))
  }

  if (regressions.length > 0) {
    lines.push('', 'Closed bugs:')
    regressions.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))
  }

  const buttons = [
    ...duplicates.map((bug) => ({
      type: 2,
      style: 2,
      label: `Duplicate #${bug.id}`,
      custom_id: buildPreflightCustomId(sessionId, 'DUPLICATE_OF', bug.id)
    })),
    ...regressions.map((bug) => ({
      type: 2,
      style: 2,
      label: `Regression #${bug.id}`,
      custom_id: buildPreflightCustomId(sessionId, 'REGRESSION_OF', bug.id)
    })),
    {
      type: 2,
      style: 1,
      label: 'Create New',
      custom_id: buildPreflightCustomId(sessionId, null, null)
    }
  ]

  return ephemeralMessage(
    lines.join('\n'),
    chunk(buttons, 5).map((group) => ({
      type: 1,
      components: group
    }))
  )
}

export function ephemeralMessage(content: string, components: unknown[] = []) {
  return { type: 4, data: { content, components, flags: 64 } }
}

export function duplicateSelectionResponse(sourceBug: BugRecord, duplicates: BugPreflightMatch[]) {
  const lines = [`${EMOJI.duplicate} Pick the original report for "${sourceBug.title}"`]
  duplicates.forEach((bug) => lines.push(`- ${EMOJI.bug} #${bug.id} ${bug.title}`))

  return ephemeralMessage(
    lines.join('\n'),
    chunk(
      duplicates.map((bug) => ({
        type: 2,
        style: 2,
        label: `Bug #${bug.id}`,
        custom_id: buildDuplicateSelectionCustomId(sourceBug.id, bug.id)
      })),
      5
    ).map((group) => ({
      type: 1,
      components: group
    }))
  )
}

function bugLinkText(bug: Pick<BugRecord, 'id' | 'title'>, url: string | null) {
  return markdownLink(`${EMOJI.bug} #${bug.id} ${bug.title}`, url)
}

function buildBugSummaryLines(bug: BugRecord) {
  const status = bugStatusMeta[bug.status]
  const lines = [`**${status.emoji} ${status.label}** \u2022 **${bug.votes_count} votes** \u2022 ${EMOJI.reporter} <@${bug.reporter_id}>`]

  const metaBits: string[] = []
  if (bug.platform) metaBits.push(`Platform: ${bugPlatformLabels[bug.platform] ?? bug.platform}`)
  if (bug.severity) metaBits.push(`Severity: ${bugSeverityLabels[bug.severity] ?? bug.severity}`)
  if (bug.linked_duplicates_count > 0) metaBits.push(`${bug.linked_duplicates_count} linked dupes`)
  if (bug.regressions_count > 0) metaBits.push(`${bug.regressions_count} regressions`)

  if (metaBits.length > 0) {
    lines.push(`-# ${metaBits.join(' \u2022 ')}`)
  }

  return lines
}

function buildBugDetailText(bug: BugRecord, relatedBugLink: string | null) {
  if (bug.status === 'DUPLICATE' && relatedBugLink) {
    return `This one is tracking under ${relatedBugLink}.`
  }

  const sections: string[] = []
  const description = compactValue(bug.description)
  const steps = compactValue(bug.steps)
  const expected = compactValue(bug.expected)
  const actual = compactValue(bug.actual)

  if (description) {
    sections.push(`**What happened**\n${quoteBlock(truncate(description, 700))}`)
  }

  if (steps) {
    sections.push(`**How to repro**\n${truncate(steps, 800)}`)
  }

  if (expected) {
    sections.push(`**Expected**\n${truncate(expected, 500)}`)
  }

  if (actual) {
    sections.push(`**Actual**\n${truncate(actual, 500)}`)
  }

  if (relatedBugLink && bug.relationship_type === 'REGRESSION_OF') {
    sections.push(`**${EMOJI.regression} Regression of**\n${relatedBugLink}`)
  }

  return sections.join('\n\n')
}

function buildFeatureDetailText(feature: FeatureRecord) {
  const sections: string[] = []
  const benefit = compactValue(feature.benefit)
  const description = compactValue(feature.description)

  if (benefit) {
    sections.push(`**Why this would help**\n${quoteBlock(truncate(benefit, 280))}`)
  }

  if (description) {
    sections.push(`**Idea**\n${truncate(description, 900)}`)
  }

  return sections.join('\n\n')
}

function baseMessagePayload(components: unknown[]): DiscordMessagePayload {
  return {
    flags: COMPONENTS_V2_FLAG,
    allowed_mentions: { parse: [] },
    components
  }
}

export function renderBugMessage(
  bug: BugRecord,
  options?: { relatedBug?: Pick<BugRecord, 'id' | 'title'> | null; relatedBugUrl?: string | null; bugUrl?: string | null }
): DiscordMessagePayload {
  const status = bugStatusMeta[bug.status]
  const isClosed = bug.status === 'FIXED' || bug.status === 'CLOSED' || bug.status === 'DUPLICATE'
  const relatedBugLink =
    options?.relatedBug && bug.related_bug_id ? bugLinkText(options.relatedBug, options.relatedBugUrl ?? null) : null
  const detailText = buildBugDetailText(bug, relatedBugLink)
  const actionButtons: Array<Record<string, unknown>> = [
    {
      type: 2,
      style: 1,
      label: `${EMOJI.votes} Upvote`,
      custom_id: `${CUSTOM_IDS.upvotePrefix}${bug.id}`,
      disabled: isClosed
    }
  ]

  const linkTarget = bug.status === 'DUPLICATE' && options?.relatedBugUrl ? options.relatedBugUrl : (options?.bugUrl ?? null)
  if (linkTarget) {
    actionButtons.push({
      type: 2,
      style: 5,
      label: bug.status === 'DUPLICATE' ? 'Open Original' : 'Open Card',
      url: linkTarget
    })
  }

  actionButtons.push(
    {
      type: 2,
      style: 2,
      label: `${EMOJI.duplicate} Duplicate`,
      custom_id: `${CUSTOM_IDS.duplicatePrefix}${bug.id}`,
      disabled: bug.status === 'DUPLICATE'
    },
    {
      type: 2,
      style: 3,
      label: `${EMOJI.fixed} Fixed`,
      custom_id: `${CUSTOM_IDS.fixedPrefix}${bug.id}`,
      disabled: isClosed
    }
  )

  return baseMessagePayload([
    {
      type: 17,
      accent_color: status.color,
      components: [
        textDisplay(`## ${EMOJI.bug} Bug #${bug.id}`),
        {
          type: 9,
          components: [textDisplay(`### ${truncate(bug.title, 180)}`), ...buildBugSummaryLines(bug).map(textDisplay)],
          ...(bug.screenshot_url
            ? {
                accessory: {
                  type: 11,
                  media: { url: bug.screenshot_url },
                  description: `${EMOJI.screenshot} Screenshot for bug #${bug.id}`
                }
              }
            : {})
        },
        ...(detailText ? [separator(), textDisplay(detailText)] : []),
        ...(bug.screenshot_url
          ? [
              separator(),
              textDisplay(`-# ${EMOJI.screenshot} Attached screenshot`),
              {
                type: 12,
                items: [{ media: { url: bug.screenshot_url }, description: `Screenshot for bug #${bug.id}` }]
              }
            ]
          : []),
        separator(),
        {
          type: 1,
          components: actionButtons
        }
      ]
    }
  ])
}

export function renderFeatureMessage(
  feature: FeatureRecord,
  options?: { featureUrl?: string | null }
): DiscordMessagePayload {
  const status = featureStatusMeta[feature.status]
  const actionButtons: Array<Record<string, unknown>> = [
    {
      type: 2,
      style: 1,
      label: `${EMOJI.votes} Upvote`,
      custom_id: `${CUSTOM_IDS.featureUpvotePrefix}${feature.id}`,
      disabled: feature.status !== 'OPEN'
    }
  ]

  if (options?.featureUrl) {
    actionButtons.push({
      type: 2,
      style: 5,
      label: 'Open Card',
      url: options.featureUrl
    })
  }

  const detailText = buildFeatureDetailText(feature)

  return baseMessagePayload([
    {
      type: 17,
      accent_color: status.color,
      components: [
        textDisplay(`## ${EMOJI.feature} Feature #${feature.id}`),
        {
          type: 9,
          components: [
            textDisplay(`### ${truncate(feature.title, 180)}`),
            textDisplay(`**${status.emoji} ${status.label}** \u2022 **${feature.votes_count} votes** \u2022 ${EMOJI.reporter} <@${feature.reporter_id}>`)
          ],
          ...(feature.screenshot_url
            ? {
                accessory: {
                  type: 11,
                  media: { url: feature.screenshot_url },
                  description: `${EMOJI.screenshot} Mockup for feature #${feature.id}`
                }
              }
            : {})
        },
        ...(detailText ? [separator(), textDisplay(detailText)] : []),
        ...(feature.screenshot_url
          ? [
              separator(),
              textDisplay(`-# ${EMOJI.screenshot} Attached visual`),
              {
                type: 12,
                items: [{ media: { url: feature.screenshot_url }, description: `Visual for feature #${feature.id}` }]
              }
            ]
          : []),
        separator(),
        {
          type: 1,
          components: actionButtons
        }
      ]
    }
  ])
}

function buildLegacyBugSummaryFields(bug: BugRecord, relatedBugLink: string | null) {
  const status = bugStatusMeta[bug.status]
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
    { name: 'Votes', value: `${EMOJI.votes} ${bug.votes_count}`, inline: true },
    { name: 'Reporter', value: `${EMOJI.reporter} <@${bug.reporter_id}>`, inline: true }
  ]

  if (bug.platform) fields.push({ name: 'Platform', value: bugPlatformLabels[bug.platform] ?? bug.platform, inline: true })
  if (bug.severity) fields.push({ name: 'Severity', value: bugSeverityLabels[bug.severity] ?? bug.severity, inline: true })
  if (relatedBugLink && bug.relationship_type === 'REGRESSION_OF') {
    fields.push({ name: `${EMOJI.regression} Regression`, value: relatedBugLink })
  }

  const steps = compactValue(bug.steps)
  const expected = compactValue(bug.expected)
  const actual = compactValue(bug.actual)

  if (steps) fields.push({ name: 'Repro', value: steps })
  if (expected) fields.push({ name: 'Expected', value: expected })
  if (actual) fields.push({ name: 'Actual', value: actual })

  return fields
}

export function renderLegacyBugMessage(
  bug: BugRecord,
  options?: { relatedBug?: Pick<BugRecord, 'id' | 'title'> | null; relatedBugUrl?: string | null }
): DiscordMessagePayload {
  const status = bugStatusMeta[bug.status]
  const isClosed = bug.status === 'FIXED' || bug.status === 'CLOSED' || bug.status === 'DUPLICATE'
  const relatedBugLink =
    options?.relatedBug && bug.related_bug_id ? bugLinkText(options.relatedBug, options.relatedBugUrl ?? null) : null

  const embed =
    bug.status === 'DUPLICATE' && relatedBugLink
      ? {
          title: `${EMOJI.bug} #${bug.id} \u00B7 ${bug.title}`,
          description: relatedBugLink,
          color: status.color,
          fields: [
            { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
            { name: 'Reporter', value: `${EMOJI.reporter} <@${bug.reporter_id}>`, inline: true },
            { name: 'Votes', value: `${EMOJI.votes} ${bug.votes_count}`, inline: true }
          ],
          ...(bug.screenshot_url ? { image: { url: bug.screenshot_url } } : {}),
          timestamp: bug.updated_at
        }
      : {
          title: `${EMOJI.bug} #${bug.id} \u00B7 ${bug.title}`,
          description: displayValue(bug.description, 'No description provided.'),
          color: status.color,
          fields: buildLegacyBugSummaryFields(bug, relatedBugLink),
          ...(bug.screenshot_url ? { image: { url: bug.screenshot_url } } : {}),
          timestamp: bug.updated_at
        }

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Upvote', custom_id: `${CUSTOM_IDS.upvotePrefix}${bug.id}`, disabled: isClosed },
          { type: 2, style: 2, label: 'Duplicate', custom_id: `${CUSTOM_IDS.duplicatePrefix}${bug.id}`, disabled: bug.status === 'DUPLICATE' },
          { type: 2, style: 3, label: 'Fixed', custom_id: `${CUSTOM_IDS.fixedPrefix}${bug.id}`, disabled: isClosed }
        ]
      }
    ]
  }
}

export function renderLegacyFeatureMessage(feature: FeatureRecord): DiscordMessagePayload {
  const status = featureStatusMeta[feature.status]

  return {
    embeds: [
      {
        title: `${EMOJI.feature} #${feature.id} \u00B7 ${feature.title}`,
        description: displayValue(feature.description, 'No description provided.'),
        color: status.color,
        fields: [
          { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
          { name: 'Votes', value: `${EMOJI.votes} ${feature.votes_count}`, inline: true },
          { name: 'Reporter', value: `${EMOJI.reporter} <@${feature.reporter_id}>`, inline: true },
          ...(compactValue(feature.benefit) ? [{ name: 'Why this helps', value: feature.benefit }] : [])
        ],
        ...(feature.screenshot_url ? { image: { url: feature.screenshot_url } } : {}),
        timestamp: feature.updated_at
      }
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Upvote', custom_id: `${CUSTOM_IDS.featureUpvotePrefix}${feature.id}`, disabled: feature.status !== 'OPEN' }
        ]
      }
    ]
  }
}
