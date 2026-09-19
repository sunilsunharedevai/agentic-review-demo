import { normalizeAudit, normalizeEslint, normalizeJest, normalizeJestAndCoverage, normalizeTypeScript } from './quality-agent';

describe('quality result normalization', () => {
  it('normalizes TypeScript errors into findings', () => {
    const result = normalizeTypeScript(2, 'src/orders.ts(10,5): error TS2322: Type string is not assignable.', 12);
    expect(result.checks[0].status).toBe('FAIL');
    expect(result.findings[0].source).toBe('TYPESCRIPT');
  });

  it('reports exact jest failed count when JSON is available', () => {
    const result = normalizeJest(1, '{"numTotalTests":20,"numPassedTests":18,"numFailedTests":2}', 20);
    expect(result.check.metrics.failedTests).toBe(2);
    expect(result.check.status).toBe('FAIL');
  });

  it('creates a separate coverage check from jest output', () => {
    const result = normalizeJestAndCoverage(
      {
        exitCode: 1,
        stdout: '',
        stderr: '',
        output: JSON.stringify({
          numFailedTestSuites: 1,
          numFailedTests: 1,
          numPassedTests: 1,
          numPendingTests: 0,
          numRuntimeErrorTestSuites: 0,
          numTotalTests: 2,
          testResults: [{ name: 'src/example.spec.ts', assertionResults: [{ fullName: 'fails', status: 'failed', failureMessages: ['bad'] }] }],
          coverageMap: {
            'src/example.ts': {
              s: { 0: 1, 1: 0 },
              f: { 0: 1 },
              b: { 0: [1, 0] },
            },
          },
        }),
      },
      30,
    );
    expect(result.checks.map((check) => check.id)).toEqual(['jest', 'coverage']);
    expect(result.checks[1].metrics.statements).toBe(50);
  });

  it('separates eslint parser/tool errors from lint failures', () => {
    const result = normalizeEslint(2, 'Oops! config failed', 10);
    expect(result.checks[0].status).toBe('ERROR');
  });

  it('uses npm audit metadata counts as source of truth', () => {
    const result = normalizeAudit(
      1,
      JSON.stringify({
        vulnerabilities: {
          multer: { name: 'multer', severity: 'high', isDirect: false, via: ['x'], range: '<2', fixAvailable: true },
        },
        metadata: { vulnerabilities: { info: 0, low: 1, moderate: 5, high: 3, critical: 0, total: 9 } },
      }),
      10,
    );
    expect(result.checks[0].metrics.vulnerabilities).toBe(9);
    expect(result.checks[0].summary).toContain('3 high');
  });
});
