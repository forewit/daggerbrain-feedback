export const CUSTOM_IDS = {
  bugModal: 'bug:create',
  upvotePrefix: 'upvote:',
  duplicatePrefix: 'duplicate:',
  fixedPrefix: 'fixed:'
} as const

export const BUG_MODAL_FIELDS = {
  title: 'title',
  description: 'description',
  steps: 'steps',
  expected: 'expected',
  actual: 'actual'
} as const
