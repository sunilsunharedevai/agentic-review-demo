import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { Finding, QualityCheck } from '@agentic-review/shared';
import { validateAiReviewResponse } from '@agentic-review/shared';
import { RepositoryTools, redactSecrets } from './repository-tools';
import { TraceRecorder } from './trace';

export type CodeReviewAgentOptions = {
  apiKey?: string;
  model?: string;
  enableLlmReview?: boolean;
  maxFileBytes?: number;
};

export class CodeReviewAgent {
  constructor(
    private readonly tools: RepositoryTools,
    private readonly trace: TraceRecorder,
    private readonly options: CodeReviewAgentOptions = {},
  ) {}

  async run(qualityChecks: QualityCheck[] = []): Promise<{ findings: Finding[]; summary: string }> {
    this.trace.info('CodeReviewAgent', 'Code Review Agent Started');
    const diffDone = this.trace.started('CodeReviewAgent', 'Tool: getGitDiff', 'getGitDiff');
    const snapshot = await this.tools.getSnapshot();
    diffDone();

    const contextFiles = await this.selectContextFiles(snapshot.changedFiles);
    const fileContexts: Array<{ path: string; content: string; relatedTests: string[] }> = [];
    for (const file of contextFiles) {
      const readDone = this.trace.started('CodeReviewAgent', `Tool: readFile ${file}`, 'readFile');
      const content = await this.tools.readFile(file, this.options.maxFileBytes ?? 12000).catch((error) => `Unable to read: ${String(error)}`);
      readDone();
      const testsDone = this.trace.started('CodeReviewAgent', `Tool: getRelatedTests ${file}`, 'getRelatedTests');
      const relatedTests = await this.tools.getRelatedTests(file).catch(() => []);
      testsDone();
      fileContexts.push({ path: file, content: redactSecrets(content), relatedTests });
    }

    const standardsDone = this.trace.started('CodeReviewAgent', 'Tool: getCodingStandards', 'getCodingStandards');
    const standards = await this.tools.getCodingStandards();
    standardsDone();

    if (this.options.enableLlmReview && this.options.apiKey) {
      try {
        const llmResult = await this.runLlm(snapshot.diff, fileContexts, standards, qualityChecks);
        this.trace.info('CodeReviewAgent', 'Code Review Agent Completed', `${llmResult.findings.length} AI findings`);
        return llmResult;
      } catch (error) {
        this.trace.failed('CodeReviewAgent', 'LLM review failed; using local heuristic fallback', error);
      }
    } else {
      this.trace.info('CodeReviewAgent', 'LLM review disabled or GEMINI_API_KEY missing; using local heuristic review');
    }

    const fallback = this.runHeuristicReview(fileContexts);
    this.trace.info('CodeReviewAgent', 'Code Review Agent Completed', `${fallback.findings.length} AI-compatible findings`);
    return fallback;
  }

  private async selectContextFiles(changedFiles: string[]): Promise<string[]> {
    return changedFiles
      .filter((file) => /\.(ts|tsx|js)$/.test(file))
      .filter((file) => !file.includes('node_modules'))
      .slice(0, 12);
  }

  private async runLlm(
    diff: string,
    fileContexts: Array<{ path: string; content: string; relatedTests: string[] }>,
    standards: string,
    qualityChecks: QualityCheck[],
  ): Promise<{ findings: Finding[]; summary: string }> {
    const client = new GoogleGenAI({ apiKey: this.options.apiKey });
    const interaction = await client.interactions.create({
      model: this.options.model ?? 'gemini-3.5-flash-lite',
      input: JSON.stringify({
        role:
          'You are a senior code review agent. Return only structured JSON. Use only provided evidence. Do not invent file paths or line numbers. AI findings require human validation and should focus on contextual bugs, security, validation, architecture, error handling, maintainability, performance, and tests.',
        codingStandards: standards,
        deterministicQualityChecks: qualityChecks.map(({ id, status, summary, metrics }) => ({ id, status, summary, metrics })),
        diff: diff.slice(0, 60000),
        files: fileContexts.map((file) => ({
          path: file.path,
          content: file.content.slice(0, this.options.maxFileBytes ?? 12000),
          relatedTests: file.relatedTests,
        })),
      }),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: aiReviewJsonSchema,
      },
    });
    const content = interaction.outputs
      ?.filter((output): output is { type: 'text'; text: string } => output.type === 'text')
      .map((output) => output.text)
      .join('');
    if (!content) {
      throw new Error('Gemini returned empty response');
    }
    const parsed = validateAiReviewResponse(JSON.parse(content));
    return {
      summary: parsed.summary,
      findings: parsed.findings.map((finding) => ({ ...finding, status: 'OPEN' })),
    };
  }

  private runHeuristicReview(fileContexts: Array<{ path: string; content: string; relatedTests: string[] }>): { findings: Finding[]; summary: string } {
    const findings: Finding[] = [];
    const add = (partial: Omit<Finding, 'id' | 'source' | 'status' | 'confidence'> & { confidence?: number }) => {
      findings.push({
        id: `ai-${randomUUID()}`,
        source: 'AI',
        status: 'OPEN',
        confidence: partial.confidence ?? 0.72,
        ...partial,
      });
    };

    for (const file of fileContexts) {
      const lines = file.content.split(/\r?\n/);
      lines.forEach((line, index) => {
        const lineNo = index + 1;
        if (/console\.log\(.*password|console\.log\(.*token|console\.log\(.*secret/i.test(line)) {
          add({
            file: file.path,
            startLine: lineNo,
            severity: 'HIGH',
            category: 'SECURITY',
            title: 'Sensitive information may be logged',
            description: 'The code logs a value that appears to contain credentials or security-sensitive data.',
            evidence: line.trim(),
            suggestedFix: 'Remove the sensitive value from logs or log only a safe correlation identifier.',
            confidence: 0.86,
          });
        }
        if (/userId.*body|body.*userId/i.test(line) && file.path.includes('controller')) {
          add({
            file: file.path,
            startLine: lineNo,
            severity: 'HIGH',
            category: 'SECURITY',
            title: 'Caller-controlled user identity',
            description: 'The controller appears to accept user identity from the request body, which can bypass authorization boundaries.',
            evidence: line.trim(),
            suggestedFix: 'Derive user identity from the authenticated request principal and enforce ownership checks in the service.',
            confidence: 0.8,
          });
        }
        if (/catch\s*\([^)]*\)\s*\{\s*return/i.test(line) || /catch\s*\([^)]*\)\s*\{/.test(line)) {
          const next = lines.slice(index, index + 4).join(' ');
          if (/return\s+(undefined|null|\[\]|false)/.test(next)) {
            add({
              file: file.path,
              startLine: lineNo,
              severity: 'MEDIUM',
              category: 'ERROR_HANDLING',
              title: 'Exception is swallowed',
              description: 'The catch block converts an infrastructure or domain failure into a successful-looking return value.',
              evidence: next.trim(),
              suggestedFix: 'Log safe context and rethrow a domain-appropriate NestJS exception.',
              confidence: 0.76,
            });
          }
        }
        if (/for\s*\(.+\)\s*\{/.test(line) && /await /.test(lines.slice(index, index + 6).join(' '))) {
          add({
            file: file.path,
            startLine: lineNo,
            severity: 'MEDIUM',
            category: 'PERFORMANCE',
            title: 'Sequential async work in loop',
            description: 'Awaiting inside a loop can create avoidable latency for independent operations.',
            evidence: lines.slice(index, index + 6).join('\n').trim(),
            suggestedFix: 'Batch independent work with Promise.all or move aggregation into the repository/data layer.',
            confidence: 0.68,
          });
        }
        if (/total\s*<\s*0/.test(line) || /quantity\s*<\s*0/.test(line)) {
          add({
            file: file.path,
            startLine: lineNo,
            severity: 'MEDIUM',
            category: 'BUG',
            title: 'Boundary condition likely allows zero',
            description: 'The condition rejects negative values but appears to allow zero, which is usually invalid for quantities or totals.',
            evidence: line.trim(),
            suggestedFix: 'Use <= 0 when zero is invalid and add an edge-case unit test.',
            confidence: 0.7,
          });
        }
      });
      if (file.path.endsWith('.service.ts') && file.relatedTests.length === 0) {
        add({
          file: file.path,
          severity: 'MEDIUM',
          category: 'TESTING',
          title: 'Service lacks related tests',
          description: 'No colocated or name-related Jest test was found for changed service code.',
          evidence: `Related tests found: ${file.relatedTests.length}`,
          suggestedFix: 'Add service tests for authorization, validation, and edge-case behavior.',
          confidence: 0.65,
        });
      }
      if (/from ['"]@nestjs\/common['"];[\s\S]*Controller/.test(file.content) && /private readonly .*Service/.test(file.content) && /new /.test(file.content)) {
        add({
          file: file.path,
          severity: 'LOW',
          category: 'ARCHITECTURE',
          title: 'Controller may be constructing collaborators directly',
          description: 'NestJS controllers should rely on dependency injection instead of directly constructing infrastructure collaborators.',
          evidence: 'Controller file contains both injected service usage and direct new construction.',
          suggestedFix: 'Move object creation into providers and inject dependencies through the constructor.',
          confidence: 0.6,
        });
      }
    }

    return {
      findings,
      summary: `Local structured review completed across ${fileContexts.length} files. ${findings.length} contextual findings identified.`,
    };
  }
}

const aiReviewJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Short summary of the code review result.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          category: {
            type: 'string',
            enum: [
              'BUG',
              'SECURITY',
              'PERFORMANCE',
              'MAINTAINABILITY',
              'VALIDATION',
              'ERROR_HANDLING',
              'ARCHITECTURE',
              'TESTING',
              'OTHER',
            ],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string' },
          suggestedFix: { type: 'string' },
          confidence: { type: 'number' },
          source: { type: 'string', enum: ['AI'] },
        },
        required: [
          'id',
          'file',
          'severity',
          'category',
          'title',
          'description',
          'evidence',
          'suggestedFix',
          'confidence',
          'source',
        ],
      },
    },
  },
  required: ['summary', 'findings'],
} as const;
