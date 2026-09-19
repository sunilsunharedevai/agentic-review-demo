import { z } from 'zod';

export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const CategorySchema = z.enum([
  'BUG',
  'SECURITY',
  'PERFORMANCE',
  'MAINTAINABILITY',
  'VALIDATION',
  'ERROR_HANDLING',
  'ARCHITECTURE',
  'TESTING',
  'OTHER',
]);
export const FindingSourceSchema = z.enum(['AI', 'ESLINT', 'TYPESCRIPT', 'JEST', 'SECURITY']);
export const FindingStatusSchema = z.enum(['OPEN', 'ACCEPTED', 'DISMISSED', 'RESOLVED']);
export const DecisionSchema = z.enum(['PASS', 'WARNING', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED']);
export const CheckStatusSchema = z.enum(['PASS', 'FAIL', 'WARNING', 'ERROR', 'SKIPPED']);
export const QualityToolSchema = z.enum(['eslint', 'typecheck', 'jest', 'coverage', 'npmAudit']);

export const FindingSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  severity: SeveritySchema,
  category: CategorySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: z.string().min(1),
  suggestedFix: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: FindingSourceSchema,
  status: FindingStatusSchema.default('OPEN'),
  dismissalReason: z.string().optional(),
});

export const AiReviewResponseSchema = z.object({
  findings: z.array(FindingSchema.omit({ status: true, dismissalReason: true }).extend({ source: z.literal('AI') })),
  summary: z.string().min(1),
});

export const QualityCheckSchema = z.object({
  id: z.string(),
  tool: QualityToolSchema,
  name: z.string(),
  status: CheckStatusSchema,
  durationMs: z.number().int().nonnegative(),
  summary: z.string(),
  command: z.string().optional(),
  exitCode: z.number().nullable().optional(),
  metrics: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  details: z.array(z.record(z.unknown())).optional(),
  rawOutput: z.string().optional(),
});

export const TraceEventSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  timestamp: z.string(),
  agent: z.string(),
  tool: z.string().optional(),
  event: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
  status: z.enum(['STARTED', 'SUCCESS', 'FAILED', 'INFO']),
  details: z.string().optional(),
});

export const ReviewSchema = z.object({
  id: z.string(),
  repository: z.string(),
  branch: z.string(),
  commitSha: z.string(),
  changedFiles: z.array(z.string()),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
  decision: DecisionSchema.optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  findings: z.array(FindingSchema),
  qualityChecks: z.array(QualityCheckSchema),
  trace: z.array(TraceEventSchema),
  summary: z.string().optional(),
  policyReasons: z.array(z.string()).optional(),
});

export type Severity = z.infer<typeof SeveritySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type FindingSource = z.infer<typeof FindingSourceSchema>;
export type FindingStatus = z.infer<typeof FindingStatusSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type CheckStatus = z.infer<typeof CheckStatusSchema>;
export type QualityTool = z.infer<typeof QualityToolSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type AiReviewResponse = z.infer<typeof AiReviewResponseSchema>;
export type QualityCheck = z.infer<typeof QualityCheckSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type Review = z.infer<typeof ReviewSchema>;

export type StartReviewRequest = {
  repositoryPath?: string;
};

export type UpdateFindingRequest = {
  status: Extract<FindingStatus, 'ACCEPTED' | 'DISMISSED' | 'RESOLVED' | 'OPEN'>;
  dismissalReason?: string;
};

export const severityRank: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function validateAiReviewResponse(value: unknown): AiReviewResponse {
  return AiReviewResponseSchema.parse(value);
}
