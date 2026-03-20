import { z } from 'zod'

const optionalBugField = z.string().trim().max(1000)
const bugIdSchema = z.number().int().positive()
const bugPlatformSchema = z.enum(['WEB', 'IOS', 'ANDROID', 'DESKTOP', 'OTHER'])
const bugSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export const bugStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE'])
export const bugLinkRelationSchema = z.enum(['duplicate', 'regression'])
export const featureStatusSchema = z.enum(['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED', 'CLOSED'])

export const bugSubmissionSchema = z.object({
  platform: bugPlatformSchema.nullable(),
  severity: bugSeveritySchema.nullable(),
  description: optionalBugField.min(1),
  screenshot_url: z.string().trim().url().nullable(),
  source_guild_id: z.string().trim().min(1).nullable().optional(),
  source_channel_id: z.string().trim().min(1).nullable().optional(),
  source_message_id: z.string().trim().min(1).nullable().optional()
})

export const featureSubmissionSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  screenshot_url: z.string().trim().url().nullable(),
  source_guild_id: z.string().trim().min(1).nullable().optional(),
  source_channel_id: z.string().trim().min(1).nullable().optional(),
  source_message_id: z.string().trim().min(1).nullable().optional()
})

export const bugsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  sort: z.enum(['top', 'newest']).default('top')
})

export const bugStatusCommandSchema = z.object({
  bugId: bugIdSchema,
  status: bugStatusSchema,
  note: z.string().trim().max(240).nullable().optional()
})

export const bugLinkCommandSchema = z.object({
  bugId: bugIdSchema,
  targetBugId: bugIdSchema,
  relation: bugLinkRelationSchema
})

export const featureStatusCommandSchema = z.object({
  featureId: bugIdSchema,
  status: featureStatusSchema,
  note: z.string().trim().max(240).nullable().optional()
})
