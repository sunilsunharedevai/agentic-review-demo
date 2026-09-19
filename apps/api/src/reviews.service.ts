import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CodeReviewAgent, PolicyEngine, QualityAgent, RepositoryTools, ReviewAggregator, TraceRecorder } from '@agentic-review/agents';
import type { Decision, Review, UpdateFindingRequest } from '@agentic-review/shared';

@Injectable()
export class ReviewsService {
  private readonly reviews = new Map<string, Review>();

  getReview(id: string): Review | undefined {
    return this.reviews.get(id);
  }

  async startReview(repositoryPath?: string): Promise<Review> {
    const reviewId = randomUUID();
    const startedAt = new Date();
    const trace = new TraceRecorder(reviewId);
    trace.info('Orchestrator', 'Review Started');

    const repositoryRoot = this.resolveRepositoryRoot(repositoryPath);
    const tools = new RepositoryTools(repositoryRoot);
    await tools.assertValidRoot().catch((error) => {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid repository');
    });

    const gitDone = trace.started('Orchestrator', 'Collecting Git Context');
    const snapshot = await tools.getSnapshot(Number(process.env.MAX_REVIEW_FILES ?? 30));
    gitDone();

    const baseReview: Review = {
      id: reviewId,
      repository: snapshot.root,
      branch: snapshot.branch,
      commitSha: snapshot.commitSha,
      changedFiles: snapshot.changedFiles,
      status: 'RUNNING',
      startedAt: startedAt.toISOString(),
      findings: [],
      qualityChecks: [],
      trace: trace.all(),
    };
    this.reviews.set(reviewId, baseReview);

    try {
      const qualityAgent = new QualityAgent(repositoryRoot, trace);
      const qualityResult = await qualityAgent.run();

      const codeReviewAgent = new CodeReviewAgent(tools, trace, {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL,
        enableLlmReview: process.env.ENABLE_LLM_REVIEW === 'true',
        maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 12000),
      });
      const aiResult = await codeReviewAgent.run(qualityResult.checks);

      trace.info('Aggregator', 'Aggregating Findings');
      const findings = new ReviewAggregator().deduplicate([...qualityResult.findings, ...aiResult.findings]);
      trace.info('PolicyEngine', 'Policy Evaluation');
      const policy = new PolicyEngine().evaluate(findings, qualityResult.checks);
      trace.info('Orchestrator', 'Review Completed', policy.reasons.join(' '));

      const completedAt = new Date();
      const review: Review = {
        ...baseReview,
        status: 'COMPLETED',
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        findings,
        qualityChecks: qualityResult.checks,
        decision: policy.decision,
        summary: `${aiResult.summary} Policy decision: ${policy.decision}. ${policy.reasons.join(' ')}`,
        policyReasons: policy.reasons,
        trace: trace.all(),
      };
      this.reviews.set(reviewId, review);
      return review;
    } catch (error) {
      trace.failed('Orchestrator', 'Review Failed', error);
      const failedReview: Review = {
        ...baseReview,
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        summary: error instanceof Error ? error.message : 'Unknown review failure',
        trace: trace.all(),
      };
      this.reviews.set(reviewId, failedReview);
      return failedReview;
    }
  }

  updateFinding(reviewId: string, findingId: string, dto: UpdateFindingRequest): Review {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new BadRequestException('Review not found');
    }
    const findings = review.findings.map((finding) =>
      finding.id === findingId ? { ...finding, status: dto.status, dismissalReason: dto.dismissalReason } : finding,
    );
    if (!findings.some((finding) => finding.id === findingId)) {
      throw new BadRequestException('Finding not found');
    }
    const policy = new PolicyEngine().evaluate(findings, review.qualityChecks);
    const decision: Decision = policy.decision;
    const updated: Review = { ...review, findings, decision, policyReasons: policy.reasons };
    this.reviews.set(reviewId, updated);
    return updated;
  }

  private resolveRepositoryRoot(repositoryPath?: string): string {
    const configured = repositoryPath ?? process.env.REPOSITORY_ROOT ?? './sample-project';
    const workspace = path.resolve(__dirname, '../../..');
    const resolved = path.resolve(workspace, configured);
    const relative = path.relative(workspace, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Repository path must stay inside the platform workspace');
    }
    return resolved;
  }
}
