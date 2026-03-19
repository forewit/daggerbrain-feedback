export const CUSTOM_IDS = {
  bugModalLegacy: 'bug:create',
  bugModalPrefix: 'bug:create:',
  preflightPrefix: 'bug:preflight:',
  duplicateSelectPrefix: 'bug:duplicate-select:',
  featureModal: 'feature:create',
  upvotePrefix: 'upvote:',
  duplicatePrefix: 'duplicate:',
  fixedPrefix: 'fixed:',
  featureUpvotePrefix: 'feature:upvote:'
} as const

export const BUG_MODAL_FIELDS = {
  platform: 'platform',
  severity: 'severity',
  screenshot: 'screenshot',
  description: 'description'
} as const

export const FEATURE_MODAL_FIELDS = {
  screenshot: 'feature_screenshot',
  description: 'feature_description'
} as const
