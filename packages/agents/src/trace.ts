import { randomUUID } from 'node:crypto';
import type { TraceEvent } from '@agentic-review/shared';

export class TraceRecorder {
  private readonly events: TraceEvent[] = [];

  constructor(private readonly reviewId: string) {}

  info(agent: string, event: string, details?: string, tool?: string): void {
    this.events.push(this.create(agent, event, 'INFO', undefined, details, tool));
  }

  started(agent: string, event: string, tool?: string): () => void {
    const start = Date.now();
    this.events.push(this.create(agent, event, 'STARTED', undefined, undefined, tool));
    return () => {
      this.events.push(this.create(agent, `${event} completed`, 'SUCCESS', Date.now() - start, undefined, tool));
    };
  }

  failed(agent: string, event: string, error: unknown, tool?: string): void {
    const details = error instanceof Error ? error.message : String(error);
    this.events.push(this.create(agent, event, 'FAILED', undefined, details, tool));
  }

  all(): TraceEvent[] {
    return [...this.events];
  }

  private create(
    agent: string,
    event: string,
    status: TraceEvent['status'],
    durationMs?: number,
    details?: string,
    tool?: string,
  ): TraceEvent {
    return {
      id: randomUUID(),
      reviewId: this.reviewId,
      timestamp: new Date().toISOString(),
      agent,
      tool,
      event,
      durationMs,
      status,
      details,
    };
  }
}
