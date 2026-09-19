import { FindingSchema, validateAiReviewResponse } from './index';

describe('shared schemas', () => {
  it('validates structured AI review output', () => {
    const result = validateAiReviewResponse({
      summary: 'Contextual review completed',
      findings: [
        {
          id: 'ai-1',
          file: 'src/orders/orders.service.ts',
          startLine: 12,
          severity: 'HIGH',
          category: 'SECURITY',
          title: 'Missing authorization',
          description: 'The service trusts caller input for user scope.',
          evidence: 'createOrder accepts userId directly from request body.',
          suggestedFix: 'Derive user id from authenticated principal.',
          confidence: 0.87,
          source: 'AI',
        },
      ],
    });

    expect(result.findings).toHaveLength(1);
  });

  it('rejects invalid confidence', () => {
    expect(() =>
      FindingSchema.parse({
        id: 'bad',
        file: 'x.ts',
        severity: 'LOW',
        category: 'OTHER',
        title: 'Bad',
        description: 'Bad',
        evidence: 'Bad',
        suggestedFix: 'Bad',
        confidence: 2,
        source: 'AI',
      }),
    ).toThrow();
  });
});
