import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Finding, QualityCheck } from '@agentic-review/shared';
import { TraceRecorder } from './trace';

const execFileAsync = promisify(execFile);

type AllowedTool = 'eslint' | 'typecheck' | 'jest' | 'npmAudit';

type CommandSpec = {
  command: string;
  args: string[];
  checkName: string;
};

type CommandOutput = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  output: string;
  infrastructureError?: boolean;
};

const COMMANDS: Record<AllowedTool, CommandSpec> = {
  eslint: { command: npmExecutable(), args: ['run', 'lint', '--', '--format', 'json'], checkName: 'ESLint' },
  typecheck: { command: npmExecutable(), args: ['run', 'typecheck'], checkName: 'TypeScript Build' },
  jest: { command: npmExecutable(), args: ['run', 'test:coverage', '--', '--json'], checkName: 'Unit Tests' },
  npmAudit: { command: npmExecutable(), args: ['audit', '--json', '--audit-level=moderate'], checkName: 'Dependency/Security Audit' },
};

export type QualityAgentResult = {
  checks: QualityCheck[];
  findings: Finding[];
};

export class QualityAgent {
  constructor(private readonly repositoryRoot: string, private readonly trace: TraceRecorder) {}

  async run(): Promise<QualityAgentResult> {
    this.trace.info('QualityAgent', 'Quality Agent Started');
    const checks: QualityCheck[] = [];
    const findings: Finding[] = [];

    for (const tool of Object.keys(COMMANDS) as AllowedTool[]) {
      const result = await this.runAllowedTool(tool);
      checks.push(...result.checks);
      findings.push(...result.findings);
    }

    this.trace.info('QualityAgent', 'Quality Agent Completed', `${checks.length} deterministic checks completed`);
    return { checks, findings };
  }

  private async runAllowedTool(tool: AllowedTool): Promise<{ checks: QualityCheck[]; findings: Finding[] }> {
    const spec = COMMANDS[tool];
    const started = Date.now();
    const finishTrace = this.trace.started('QualityAgent', `Tool: ${tool}`, tool);
    try {
      const output = await runCommand(spec, this.repositoryRoot);
      const durationMs = Date.now() - started;
      const normalized = this.normalize(tool, output, durationMs);
      finishTrace();
      return normalized;
    } catch (error) {
      this.trace.failed('QualityAgent', `Tool failed: ${tool}`, error, tool);
      return {
        checks: [
          {
            id: tool,
            tool,
            name: spec.checkName,
            status: 'ERROR',
            durationMs: Date.now() - started,
            summary: error instanceof Error ? error.message : 'Tool execution failed',
            command: commandText(spec),
            exitCode: null,
            metrics: {},
            details: [],
          },
        ],
        findings: [],
      };
    }
  }

  private normalize(tool: AllowedTool, output: CommandOutput, durationMs: number): { checks: QualityCheck[]; findings: Finding[] } {
    if (tool === 'eslint') return normalizeEslint(output, undefined, durationMs);
    if (tool === 'typecheck') return normalizeTypeScript(output, undefined, durationMs);
    if (tool === 'jest') return normalizeJestAndCoverage(output, durationMs);
    return normalizeAudit(output, undefined, durationMs);
  }
}

async function runCommand(spec: CommandSpec, cwd: string): Promise<CommandOutput> {
  return execFileAsync(spec.command, spec.args, {
    cwd,
    timeout: 90000,
    maxBuffer: 1024 * 1024 * 12,
    shell: process.platform === 'win32',
  })
    .then(({ stdout, stderr }) => ({ exitCode: 0, stdout, stderr, output: `${stdout}\n${stderr}` }))
    .catch((error: unknown) => {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string; killed?: boolean };
      return {
        exitCode: typeof err.code === 'number' ? err.code : null,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        output: `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`,
        infrastructureError: err.killed === true || typeof err.code !== 'number',
      };
    });
}

export function normalizeEslint(outputOrExitCode: CommandOutput | number, rawOutput?: string, maybeDurationMs?: number): { checks: QualityCheck[]; findings: Finding[] } {
  const output = legacyOutput(outputOrExitCode, rawOutput);
  const durationMs = legacyDuration(outputOrExitCode, maybeDurationMs);
  const findings: Finding[] = [];
  let errors = 0;
  let warnings = 0;

  let parsed: Array<{
    filePath: string;
    messages: Array<{ line?: number; column?: number; endLine?: number; severity: number; message: string; ruleId?: string }>;
    errorCount: number;
    warningCount: number;
  }>;

  try {
    parsed = JSON.parse(extractJson(output.output, '[', ']'));
  } catch {
    return {
      checks: [
        {
          id: 'eslint',
          tool: 'eslint',
          name: 'ESLint',
          status: output.exitCode === 0 ? 'PASS' : 'ERROR',
          durationMs,
          summary: output.exitCode === 0 ? 'ESLint completed without reported issues' : 'ESLint could not produce machine-readable results',
          command: commandText(COMMANDS.eslint),
          exitCode: output.exitCode,
          metrics: { errors: 0, warnings: 0 },
          details: [],
          rawOutput: firstLines(output.output, 80),
        },
      ],
      findings: output.exitCode === 0 ? [] : [toolFinding('eslint-error', 'ESLINT', 'MAINTAINABILITY', 'ESLint tool error', firstLines(output.output))],
    };
  }

  for (const file of parsed) {
    errors += file.errorCount;
    warnings += file.warningCount;
    for (const message of file.messages) {
      findings.push({
        id: `eslint-${findings.length + 1}`,
        file: relativeDemoPath(file.filePath),
        startLine: message.line,
        endLine: message.endLine,
        severity: message.severity === 2 ? 'MEDIUM' : 'LOW',
        category: 'MAINTAINABILITY',
        title: message.ruleId ?? 'ESLint issue',
        description: message.message,
        evidence: `${relativeDemoPath(file.filePath)}:${message.line ?? '?'}:${message.column ?? '?'} ${message.message}`,
        suggestedFix: 'Follow the ESLint rule and rerun quality checks.',
        confidence: 1,
        source: 'ESLINT',
        status: 'OPEN',
      });
    }
  }

  return {
    checks: [
      {
        id: 'eslint',
        tool: 'eslint',
        name: 'ESLint',
        status: errors > 0 ? 'FAIL' : warnings > 0 ? 'WARNING' : 'PASS',
        durationMs,
        summary: errors === 0 && warnings === 0 ? 'No lint issues found' : `${errors} errors | ${warnings} warnings`,
        command: commandText(COMMANDS.eslint),
        exitCode: output.exitCode,
        metrics: { errors, warnings },
        details: findings.map((finding) => ({
          file: finding.file,
          line: finding.startLine,
          rule: finding.title,
          severity: finding.severity,
          message: finding.description,
        })),
        rawOutput: firstLines(output.output, 80),
      },
    ],
    findings,
  };
}

export function normalizeTypeScript(outputOrExitCode: CommandOutput | number, rawOutput?: string, maybeDurationMs?: number): { checks: QualityCheck[]; findings: Finding[] } {
  const output = legacyOutput(outputOrExitCode, rawOutput);
  const durationMs = legacyDuration(outputOrExitCode, maybeDurationMs);
  const matches = [...output.output.matchAll(/(.+?\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)/g)];
  const findings = matches.map<Finding>((match, index) => ({
    id: `ts-${index + 1}`,
    file: relativeDemoPath(match[1]),
    startLine: Number(match[2]),
    severity: 'HIGH',
    category: 'BUG',
    title: match[4],
    description: match[5],
    evidence: match[0],
    suggestedFix: 'Fix the TypeScript compiler error and rerun typecheck.',
    confidence: 1,
    source: 'TYPESCRIPT',
    status: 'OPEN',
  }));
  const hasCompilerErrors = /error TS\d+/.test(output.output);
  const status: QualityCheck['status'] = output.exitCode === 0 ? 'PASS' : hasCompilerErrors || findings.length > 0 ? 'FAIL' : 'ERROR';

  return {
    checks: [
      {
        id: 'typecheck',
        tool: 'typecheck',
        name: 'TypeScript Build',
        status,
        durationMs,
        summary:
          status === 'PASS'
            ? '0 compilation errors'
            : status === 'FAIL'
              ? `${findings.length || 1} TypeScript compilation errors`
              : 'TypeScript compiler could not execute successfully',
        command: commandText(COMMANDS.typecheck),
        exitCode: output.exitCode,
        metrics: { errors: findings.length, warnings: 0 },
        details: findings.map((finding) => ({ file: finding.file, line: finding.startLine, code: finding.title, message: finding.description })),
        rawOutput: firstLines(output.output, 80),
      },
    ],
    findings:
      findings.length > 0
        ? findings
        : status === 'PASS'
          ? []
          : [toolFinding(status === 'ERROR' ? 'ts-tool-error' : 'ts-error', 'TYPESCRIPT', 'BUG', status === 'ERROR' ? 'TypeScript tool error' : 'TypeScript check failed', firstLines(output.output))],
  };
}

export function normalizeJest(outputOrExitCode: CommandOutput | number, rawOutput?: string, maybeDurationMs?: number): { check: QualityCheck; findings: Finding[] } {
  const result = normalizeJestAndCoverage(legacyOutput(outputOrExitCode, rawOutput), legacyDuration(outputOrExitCode, maybeDurationMs));
  return { check: result.checks[0], findings: result.findings };
}

export function normalizeJestAndCoverage(output: CommandOutput, durationMs: number): { checks: QualityCheck[]; findings: Finding[] } {
  let parsed: JestJson;
  try {
    parsed = JSON.parse(extractJsonNear(output.output, '"numFailedTestSuites"')) as JestJson;
  } catch {
    return {
      checks: [
        {
          id: 'jest',
          tool: 'jest',
          name: 'Unit Tests',
          status: output.exitCode === 0 ? 'PASS' : 'ERROR',
          durationMs,
          summary: output.exitCode === 0 ? 'Jest completed without parsed test data' : 'Jest could not produce machine-readable test results',
          command: commandText(COMMANDS.jest),
          exitCode: output.exitCode,
          metrics: {},
          details: [],
          rawOutput: firstLines(output.output, 100),
        },
        coverageUnavailable(durationMs, output),
      ],
      findings: output.exitCode === 0 ? [] : [toolFinding('jest-tool-error', 'JEST', 'TESTING', 'Jest tool error', firstLines(output.output))],
    };
  }

  const failedTests = (parsed.testResults ?? []).flatMap((suite) =>
    suite.assertionResults
      .filter((assertion) => assertion.status === 'failed')
      .map((assertion) => ({
        suite: relativeDemoPath(suite.name),
        test: assertion.fullName,
        message: firstLines(assertion.failureMessages.join('\n'), 8),
      })),
  );
  const failedCount = parsed.numFailedTests ?? 0;
  const passedCount = parsed.numPassedTests ?? 0;
  const pendingCount = parsed.numPendingTests ?? 0;
  const totalCount = parsed.numTotalTests ?? passedCount + failedCount + pendingCount;
  const runtimeErrorSuites = parsed.numRuntimeErrorTestSuites ?? 0;
  const failedSuites = parsed.numFailedTestSuites ?? 0;
  const testsStatus: QualityCheck['status'] = failedCount > 0 || runtimeErrorSuites > 0 ? 'FAIL' : 'PASS';
  const coverage = calculateCoverage(parsed.coverageMap ?? {});

  return {
    checks: [
      {
        id: 'jest',
        tool: 'jest',
        name: 'Unit Tests',
        status: testsStatus,
        durationMs,
        summary:
          testsStatus === 'PASS'
            ? `${passedCount}/${totalCount} tests passed`
            : `${passedCount} passed | ${failedCount} failed | ${pendingCount} skipped`,
        command: commandText(COMMANDS.jest),
        exitCode: output.exitCode,
        metrics: {
          totalTests: totalCount,
          passedTests: passedCount,
          failedTests: failedCount,
          skippedTests: pendingCount,
          failedSuites,
          runtimeErrorSuites,
        },
        details: failedTests,
        rawOutput: firstLines(output.output, 100),
      },
      {
        id: 'coverage',
        tool: 'coverage',
        name: 'Test Coverage',
        status: coverage.coverageFiles > 0 ? 'PASS' : 'WARNING',
        durationMs,
        summary:
          coverage.coverageFiles > 0
            ? `${coverage.statements}% statements | ${coverage.branches}% branches | ${coverage.functions}% functions | ${coverage.lines}% lines`
            : 'Coverage data was not produced',
        command: commandText(COMMANDS.jest),
        exitCode: output.exitCode,
        metrics: coverage,
        details: [],
        rawOutput: firstLines(output.output, 40),
      },
    ],
    findings:
      testsStatus === 'PASS'
        ? []
        : [
            toolFinding(
              'jest-failure',
              'JEST',
              'TESTING',
              'Unit tests failed',
              failedTests.map((test) => `${test.test}: ${test.message}`).join('\n') || `${failedCount} failed tests`,
              'Fix failing tests or production behavior.',
            ),
          ],
  };
}

export function normalizeAudit(outputOrExitCode: CommandOutput | number, rawOutput?: string, maybeDurationMs?: number): { checks: QualityCheck[]; findings: Finding[] } {
  const output = legacyOutput(outputOrExitCode, rawOutput);
  const durationMs = legacyDuration(outputOrExitCode, maybeDurationMs);
  let parsed: AuditJson;
  try {
    parsed = JSON.parse(extractJson(output.output, '{', '}')) as AuditJson;
  } catch {
    return {
      checks: [
        {
          id: 'npmAudit',
          tool: 'npmAudit',
          name: 'Dependency/Security Audit',
          status: output.exitCode === 0 ? 'PASS' : 'ERROR',
          durationMs,
          summary: output.exitCode === 0 ? 'Audit completed without vulnerabilities' : 'npm audit could not produce machine-readable results',
          command: commandText(COMMANDS.npmAudit),
          exitCode: output.exitCode,
          metrics: {},
          details: [],
          rawOutput: firstLines(output.output, 100),
        },
      ],
      findings: output.exitCode === 0 ? [] : [toolFinding('npm-audit-error', 'SECURITY', 'SECURITY', 'Dependency audit tool error', firstLines(output.output), 'Retry the audit or inspect registry/network configuration.')],
    };
  }

  const counts = parsed.metadata?.vulnerabilities ?? {};
  const info = counts.info ?? 0;
  const low = counts.low ?? 0;
  const moderate = counts.moderate ?? 0;
  const high = counts.high ?? 0;
  const critical = counts.critical ?? 0;
  const total = counts.total ?? info + low + moderate + high + critical;
  const details = Object.values(parsed.vulnerabilities ?? {}).map((item) => ({
    package: item.name,
    severity: item.severity,
    direct: item.isDirect,
    via: item.via.map((via) => (typeof via === 'string' ? via : via.title)).join('; '),
    range: item.range,
    fixAvailable: typeof item.fixAvailable === 'boolean' ? item.fixAvailable : Boolean(item.fixAvailable),
  }));
  const status: QualityCheck['status'] = critical > 0 || high > 0 ? 'FAIL' : moderate > 0 || low > 0 ? 'WARNING' : 'PASS';
  const summary = total === 0 ? 'No dependency vulnerabilities found' : `${critical} critical | ${high} high | ${moderate} moderate | ${low} low`;

  return {
    checks: [
      {
        id: 'npmAudit',
        tool: 'npmAudit',
        name: 'Dependency/Security Audit',
        status,
        durationMs,
        summary,
        command: commandText(COMMANDS.npmAudit),
        exitCode: output.exitCode,
        metrics: { vulnerabilities: total, critical, high, moderate, low, info },
        details,
        rawOutput: firstLines(output.output, 100),
      },
    ],
    findings:
      status === 'PASS'
        ? []
        : [
            toolFinding(
              'npm-audit',
              'SECURITY',
              'SECURITY',
              'Dependency security findings',
              summary,
              'Upgrade or replace vulnerable dependencies. Review details for semver-major updates.',
              critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : 'MEDIUM',
            ),
          ],
  };
}

function coverageUnavailable(durationMs: number, output: CommandOutput): QualityCheck {
  return {
    id: 'coverage',
    tool: 'coverage',
    name: 'Test Coverage',
    status: 'ERROR',
    durationMs,
    summary: 'Coverage could not be calculated because Jest output was not parseable',
    command: commandText(COMMANDS.jest),
    exitCode: output.exitCode,
    metrics: {},
    details: [],
    rawOutput: firstLines(output.output, 40),
  };
}

function calculateCoverage(coverageMap: Record<string, CoverageFile>): Record<string, number> {
  let statementCovered = 0;
  let statementTotal = 0;
  let functionCovered = 0;
  let functionTotal = 0;
  let branchCovered = 0;
  let branchTotal = 0;

  for (const file of Object.values(coverageMap)) {
    const statementCounts = Object.values(file.s ?? {});
    statementTotal += statementCounts.length;
    statementCovered += statementCounts.filter((count) => count > 0).length;

    const functionCounts = Object.values(file.f ?? {});
    functionTotal += functionCounts.length;
    functionCovered += functionCounts.filter((count) => count > 0).length;

    const branchCounts = Object.values(file.b ?? {}).flat();
    branchTotal += branchCounts.length;
    branchCovered += branchCounts.filter((count) => count > 0).length;
  }

  return {
    statements: percent(statementCovered, statementTotal),
    branches: percent(branchCovered, branchTotal),
    functions: percent(functionCovered, functionTotal),
    lines: percent(statementCovered, statementTotal),
    coverageFiles: Object.keys(coverageMap).length,
  };
}

function toolFinding(
  id: string,
  source: Finding['source'],
  category: Finding['category'],
  title: string,
  evidence: string,
  suggestedFix = 'Review the deterministic tool output and correct the issue.',
  severity: Finding['severity'] = source === 'SECURITY' ? 'HIGH' : 'MEDIUM',
): Finding {
  return {
    id,
    file: 'package.json',
    severity,
    category,
    title,
    description: evidence,
    evidence,
    suggestedFix,
    confidence: 1,
    source,
    status: 'OPEN',
  };
}

function firstLines(output: string, maxLines = 40): string {
  return output.split(/\r?\n/).filter(Boolean).slice(0, maxLines).join('\n');
}

function extractJson(output: string, open: '{' | '[', close: '}' | ']'): string {
  const start = output.indexOf(open);
  const end = output.lastIndexOf(close);
  if (start < 0 || end < start) {
    throw new Error('No JSON payload found');
  }
  return output.slice(start, end + 1);
}

function extractJsonNear(output: string, marker: string): string {
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0) return extractJson(output, '{', '}');
  const start = output.lastIndexOf('{', markerIndex);
  if (start < 0) throw new Error('No JSON object start found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return output.slice(start, index + 1);
  }
  throw new Error('No complete JSON object found');
}

function commandText(spec: CommandSpec): string {
  const command = spec.command.endsWith('.cmd') ? 'npm' : spec.command;
  return `${command} ${spec.args.join(' ')}`;
}

function npmExecutable(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function relativeDemoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/sample-project/').pop() ?? filePath.replace(/\\/g, '/');
}

function percent(covered: number, total: number): number {
  if (total === 0) return 0;
  return Number(((covered / total) * 100).toFixed(1));
}

function legacyOutput(outputOrExitCode: CommandOutput | number, rawOutput = ''): CommandOutput {
  if (typeof outputOrExitCode === 'number') {
    return { exitCode: outputOrExitCode, stdout: rawOutput, stderr: '', output: rawOutput };
  }
  return outputOrExitCode;
}

function legacyDuration(_outputOrExitCode: CommandOutput | number, maybeDurationMs = 0): number {
  return maybeDurationMs;
}

type JestJson = {
  numFailedTestSuites: number;
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numRuntimeErrorTestSuites: number;
  numTotalTests: number;
  testResults?: Array<{
    name: string;
    assertionResults: Array<{
      fullName: string;
      status: string;
      failureMessages: string[];
    }>;
  }>;
  coverageMap?: Record<string, CoverageFile>;
};

type CoverageFile = {
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
};

type AuditJson = {
  vulnerabilities?: Record<
    string,
    {
      name: string;
      severity: string;
      isDirect: boolean;
      via: Array<string | { title?: string }>;
      range: string;
      fixAvailable: boolean | object;
    }
  >;
  metadata?: {
    vulnerabilities?: {
      info?: number;
      low?: number;
      moderate?: number;
      high?: number;
      critical?: number;
      total?: number;
    };
  };
};
