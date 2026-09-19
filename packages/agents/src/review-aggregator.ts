import type { Finding } from '@agentic-review/shared';
import { severityRank } from '@agentic-review/shared';

export class ReviewAggregator {
  deduplicate(findings: Finding[]): Finding[] {
    const byKey = new Map<string, Finding>();
    for (const finding of findings) {
      const key = [
        finding.source,
        finding.file,
        finding.startLine ?? 'file',
        finding.category,
        normalizeTitle(finding.title),
      ].join('|');
      const existing = byKey.get(key);
      if (!existing || severityRank[finding.severity] > severityRank[existing.severity]) {
        byKey.set(key, finding);
      }
    }
    return [...byKey.values()].sort((a, b) => {
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return a.file.localeCompare(b.file);
    });
  }
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
