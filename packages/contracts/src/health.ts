import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['ok', 'down']);
export type HealthCheckStatus = z.infer<typeof healthCheckStatusSchema>;

export const healthLiveResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
});
export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;

export const healthReadyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: healthCheckStatusSchema,
    redis: healthCheckStatusSchema,
  }),
});
export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>;
