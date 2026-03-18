import { z } from 'zod'

export const bugSubmissionSchema = z.object({
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(10).max(1000),
  steps: z.string().trim().min(10).max(1000),
  expected: z.string().trim().min(5).max(1000),
  actual: z.string().trim().min(5).max(1000)
})

export const bugsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  sort: z.enum(['top', 'newest']).default('top')
})
