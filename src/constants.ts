export const CUSTOM_IDS = {
  bugModalLegacy: 'bug:create',
  bugModalPrefix: 'bug:create:',
  preflightPrefix: 'bug:preflight:',
  duplicateSelectPrefix: 'bug:duplicate-select:',
  featureModal: 'feature:create',
  featureModalPrefix: 'feature:create:',
  upvotePrefix: 'upvote:',
  duplicatePrefix: 'duplicate:',
  fixedPrefix: 'fixed:',
  featureUpvotePrefix: 'feature:upvote:',
  followPrefix: 'follow:',
  unfollowPrefix: 'unfollow:',
  featureFollowPrefix: 'feature:follow:',
  featureUnfollowPrefix: 'feature:unfollow:',
  manageBugPrefix: 'manage:bug:',
  manageFeaturePrefix: 'manage:feature:',
  bugStatusActionPrefix: 'bug:status-action:',
  featureStatusActionPrefix: 'feature:status-action:',
  bugDeleteActionPrefix: 'bug:delete-action:',
  featureDeleteActionPrefix: 'feature:delete-action:'
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
