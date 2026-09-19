import type { Decision, Finding, QualityCheck } from '@agentic-review/shared';

export type PolicyResult = {
  decision: Decision;
  reasons: string[];
};

export class PolicyEngine {
  evaluate(findings: Finding[], qualityChecks: QualityCheck[]): PolicyResult {
    const reasons: string[] = [];
    const erroredTools = qualityChecks.filter((check) => check.status === 'ERROR');
    const failedTypeScript = qualityChecks.find((check) => check.id === 'typecheck' && check.status === 'FAIL');
    const failedTests = qualityChecks.find((check) => check.id === 'jest' && check.status === 'FAIL');
    const failedSecurity = qualityChecks.find((check) => check.id === 'npmAudit' && check.status === 'FAIL');
    const failedQualityGate = qualityChecks.find((check) => ['eslint', 'coverage'].includes(check.id) && check.status === 'FAIL');

    if (erroredTools.length > 0) reasons.push(`Quality verification incomplete: ${erroredTools.map((check) => check.name).join(', ')} returned tool errors.`);
    if (failedTypeScript) reasons.push('TypeScript/build failure is a blocking deterministic gate.');
    if (failedTests) reasons.push('Unit-test failure is a blocking deterministic gate.');
    if (failedSecurity) reasons.push('Critical/high dependency security finding is a blocking deterministic gate.');
    if (failedQualityGate) reasons.push('Configured deterministic quality gate failed.');

    if (reasons.length > 0) {
      return { decision: 'BLOCKED', reasons };
    }

    const criticalOrHighAi = findings.find(
      (finding) => finding.source === 'AI' && ['CRITICAL', 'HIGH'].includes(finding.severity) && finding.status === 'OPEN',
    );
    if (criticalOrHighAi) {
      return {
        decision: 'HUMAN_REVIEW_REQUIRED',
        reasons: ['AI high/critical findings require human validation before release decisions.'],
      };
    }

    const mediumAi = findings.find((finding) => finding.source === 'AI' && finding.severity === 'MEDIUM' && finding.status === 'OPEN');
    const warningCheck = qualityChecks.find((check) => check.status === 'WARNING');
    if (mediumAi || warningCheck) {
      return { decision: 'WARNING', reasons: ['Medium AI findings or warning checks should be reviewed.'] };
    }

    return { decision: 'PASS', reasons: ['All deterministic gates passed and no open high-risk AI findings remain.'] };
  }
}
