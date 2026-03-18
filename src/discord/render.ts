import { BUG_MODAL_FIELDS, CUSTOM_IDS } from '../constants'
import type { BugRecord } from '../types'

const textInput = (customId: string, label: string, style: number, required = true) => ({
  type: 1,
  components: [{ type: 4, custom_id: customId, label, style, required }]
})

export function bugModalResponse() {
  return {
    type: 9,
    data: {
      custom_id: CUSTOM_IDS.bugModal,
      title: 'Report a bug',
      components: [
        textInput(BUG_MODAL_FIELDS.title, 'Title', 1),
        textInput(BUG_MODAL_FIELDS.description, 'Description', 2),
        textInput(BUG_MODAL_FIELDS.steps, 'Steps to reproduce', 2),
        textInput(BUG_MODAL_FIELDS.expected, 'Expected behavior', 2),
        textInput(BUG_MODAL_FIELDS.actual, 'Actual behavior', 2)
      ]
    }
  }
}

export function ephemeralMessage(content: string) {
  return { type: 4, data: { content, flags: 64 } }
}

export function renderBugMessage(bug: BugRecord) {
  const isClosed = bug.status === 'CLOSED'
  return {
    embeds: [
      {
        title: `Bug #${bug.id}: ${bug.title}`,
        description: bug.description,
        fields: [
          { name: 'Steps to reproduce', value: bug.steps },
          { name: 'Expected behavior', value: bug.expected },
          { name: 'Actual behavior', value: bug.actual },
          { name: 'Status', value: bug.status, inline: true },
          { name: 'Votes', value: String(bug.votes_count), inline: true },
          { name: 'Duplicate flags', value: String(bug.duplicate_flags_count), inline: true },
          { name: 'Reporter', value: `<@${bug.reporter_id}>`, inline: true },
          { name: 'Bug ID', value: String(bug.id), inline: true }
        ],
        timestamp: bug.updated_at
      }
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Upvote', custom_id: `${CUSTOM_IDS.upvotePrefix}${bug.id}`, disabled: isClosed },
          { type: 2, style: 2, label: 'Duplicate', custom_id: `${CUSTOM_IDS.duplicatePrefix}${bug.id}`, disabled: false },
          { type: 2, style: 3, label: 'Mark Fixed', custom_id: `${CUSTOM_IDS.fixedPrefix}${bug.id}`, disabled: isClosed }
        ]
      }
    ]
  }
}
