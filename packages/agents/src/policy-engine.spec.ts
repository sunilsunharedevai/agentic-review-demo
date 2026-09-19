import { PolicyEngine } from './policy-engine';
import type { Finding, QualityCheck } from '@agentic-review/shared';

const baseCheck: QualityCheck = {
  id: 'typecheck',
  tool: 'typecheck',
  name: 'TypeScript Build',
  status: 'PASS',
  durationMs: 1,
  summary: 'ok',
  metrics: {},
};

const aiFinding: Finding = {
  id: 'ai-1',
  file: 'src/app.ts',
  severity: 'HIGH',
  category: 'SECURITY',
  title: 'Missing authorization',
  description: 'x',
  evidence: 'x',
  suggestedFix: 'x',
  confidence: 0.8,
  source: 'AI',
  status: 'OPEN',
};

describe('PolicyEngine', () => {
  it('blocks deterministic type failures', () => {
    const result = new PolicyEngine().evaluate([], [{ ...baseCheck, status: 'FAIL' }]);
    expect(result.decision).toBe('BLOCKED');
  });

  it('blocks when a quality tool has an infrastructure error', () => {
    const result = new PolicyEngine().evaluate([], [{ ...baseCheck, id: 'eslint', tool: 'eslint', status: 'ERROR', name: 'ESLint' }]);
    expect(result.decision).toBe('BLOCKED');
    expect(result.reasons[0]).toContain('Quality verification incomplete');
  });

  it('blocks deterministic unit test failures', () => {
    const result = new PolicyEngine().evaluate([], [{ ...baseCheck, id: 'jest', tool: 'jest', name: 'Unit Tests', status: 'FAIL' }]);
    expect(result.decision).toBe('BLOCKED');
  });

  it('blocks high deterministic security findings', () => {
    const result = new PolicyEngine().evaluate([], [{ ...baseCheck, id: 'npmAudit', tool: 'npmAudit', name: 'Dependency/Security Audit', status: 'FAIL' }]);
    expect(result.decision).toBe('BLOCKED');
  });

  it('requires human review for high AI findings without blocking', () => {
    const result = new PolicyEngine().evaluate([aiFinding], [baseCheck]);
    expect(result.decision).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('passes when deterministic checks pass and AI findings are dismissed', () => {
    const result = new PolicyEngine().evaluate([{ ...aiFinding, status: 'DISMISSED' }], [baseCheck]);
    expect(result.decision).toBe('PASS');
  });

  it('warns on medium AI findings', () => {
    const result = new PolicyEngine().evaluate([{ ...aiFinding, severity: 'MEDIUM' }], [baseCheck]);
    expect(result.decision).toBe('WARNING');
  });
});
