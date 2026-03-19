import { z } from 'zod'

const optionalBugField = z.string().trim().max(1000)
const bugIdSchema = z.number().int().positive()
const bugPlatformSchema = z.enum(['WEB', 'IOS', 'ANDROID', 'DESKTOP', 'OTHER'])
const bugSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export const bugStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE'])
export const bugLinkRelationSchema = z.enum(['duplicate', 'regression'])

export const bugSubmissionSchema = z.object({
  platform: bugPlatformSchema.nullable(),
  severity: bugSeveritySchema.nullable(),
  description: optionalBugField.min(1),
  screenshot_url: z.string().trim().url().nullable()
})

export const featureSubmissionSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  screenshot_url: z.string().trim().url().nullable()
})

export const bugsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  sort: z.enum(['top', 'newest']).default('top')
})

export const bugStatusCommandSchema = z.object({
  bugId: bugIdSchema,
  status: bugStatusSchema
})

export const bugLinkCommandSchema = z.object({
  bugId: bugIdSchema,
  targetBugId: bugIdSchema,
  relation: bugLinkRelationSchema
})
