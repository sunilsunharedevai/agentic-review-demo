import type { Finding } from '@agentic-review/shared';
import { ReviewAggregator } from './review-aggregator';

const finding: Finding = {
  id: 'a',
  file: 'src/a.ts',
  startLine: 1,
  severity: 'LOW',
  category: 'BUG',
  title: 'Same bug',
  description: 'd',
  evidence: 'e',
  suggestedFix: 'f',
  confidence: 1,
  source: 'AI',
  status: 'OPEN',
};

describe('ReviewAggregator', () => {
  it('deduplicates and keeps higher severity', () => {
    const result = new ReviewAggregator().deduplicate([finding, { ...finding, id: 'b', severity: 'HIGH' }]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HIGH');
  });
});
