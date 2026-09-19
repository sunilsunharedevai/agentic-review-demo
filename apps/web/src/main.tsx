import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Category,
  CheckStatus,
  Finding,
  FindingSource,
  FindingStatus,
  QualityCheck,
  Review,
  Severity,
  TraceEvent,
} from '@agentic-review/shared';
import './styles.css';

const apiBase = '/api';

type Filters = {
  severity: 'ALL' | Severity;
  category: 'ALL' | Category;
  source: 'ALL' | FindingSource;
  status: 'ALL' | FindingStatus;
  file: string;
  search: string;
};

const initialFilters: Filters = {
  severity: 'ALL',
  category: 'ALL',
  source: 'ALL',
  status: 'ALL',
  file: '',
  search: '',
};

const workflowSteps = [
  'Initializing Review',
  'Reading Git Context',
  'Calculating Changed Files',
  'Starting Code Review Agent',
  'Gathering Repository Context',
  'Running Quality Agent',
  'Running TypeScript Check',
  'Running ESLint',
  'Running Unit Tests',
  'Calculating Coverage',
  'Running Dependency/Security Check',
  'Aggregating Findings',
  'Applying Quality Policy',
  'Review Complete',
];

function App(): JSX.Element {
  const [review, setReview] = useState<Review | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'reviews' | 'activity' | 'quality'>('dashboard');

  const filteredFindings = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return (review?.findings ?? []).filter((finding) => {
      if (filters.severity !== 'ALL' && finding.severity !== filters.severity) return false;
      if (filters.category !== 'ALL' && finding.category !== filters.category) return false;
      if (filters.source !== 'ALL' && finding.source !== filters.source) return false;
      if (filters.status !== 'ALL' && finding.status !== filters.status) return false;
      if (filters.file && !finding.file.toLowerCase().includes(filters.file.toLowerCase())) return false;
      if (query) {
        const haystack = `${finding.title} ${finding.description} ${finding.evidence} ${finding.suggestedFix}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [filters, review]);

  const counts = countFindings(review?.findings ?? []);
  const quality = summarizeQuality(review?.qualityChecks ?? []);
  const orderedQualityChecks = orderQualityChecks(review?.qualityChecks ?? []);

  async function runReview(): Promise<void> {
    setIsRunning(true);
    setError(null);
    setSelectedFinding(null);
    setActiveSection('dashboard');
    try {
      const response = await fetch(`${apiBase}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await readableError(response));
      const nextReview = (await response.json()) as Review;
      setReview(nextReview);
      setSelectedFinding(nextReview.findings[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setIsRunning(false);
    }
  }

  async function updateFinding(finding: Finding, status: FindingStatus): Promise<void> {
    if (!review) return;
    const dismissalReason = status === 'DISMISSED' ? window.prompt('Dismissal reason?') ?? undefined : undefined;
    const response = await fetch(`${apiBase}/reviews/${review.id}/findings/${finding.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, dismissalReason }),
    });
    if (!response.ok) {
      setError(await readableError(response));
      return;
    }
    const updated = (await response.json()) as Review;
    setReview(updated);
    setSelectedFinding(updated.findings.find((item) => item.id === finding.id) ?? null);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">AI</div>
          <div>
            <h1>Agentic AI Code Review</h1>
            <p>AI-powered engineering quality</p>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Dashboard sections">
          {[
            ['dashboard', 'Dashboard'],
            ['reviews', 'Reviews'],
            ['activity', 'Agent Activity'],
            ['quality', 'Quality Checks'],
          ].map(([key, label]) => (
            <button
              className={activeSection === key ? 'active' : ''}
              key={key}
              onClick={() => setActiveSection(key as typeof activeSection)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="service-status">
          <span className="status-dot good" />
          <span>Review service ready</span>
          <button aria-label="Settings" className="icon-button" type="button">
            Settings
          </button>
        </div>
      </header>

      {error && (
        <section className="error-state">
          <strong>Review could not complete</strong>
          <span>{error}</span>
        </section>
      )}

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Enterprise Agentic AI Developer Quality Platform</span>
          <h2>{review ? decisionTitle(review.decision) : 'Review the current developer change'}</h2>
          <p>
            Combine contextual AI review with deterministic engineering gates. AI findings require human validation;
            TypeScript, tests, lint, coverage, and dependency audit remain authoritative.
          </p>
        </div>
        <div className="run-panel">
          <RepositoryGrid review={review} />
          <button className="primary-run" disabled={isRunning} onClick={runReview} type="button">
            {isRunning ? 'Running Agentic Review' : 'Run Agentic Review'}
          </button>
          <span className="run-hint">
            {review ? `Last review ${formatDuration(review.durationMs)} ago in execution time` : 'Targets the configured sample repository'}
          </span>
        </div>
      </section>

      <WorkflowProgress review={review} isRunning={isRunning} />

      {review ? (
        <>
          <DecisionBanner review={review} />

          <section className="summary-grid" aria-label="Review summary">
            <SummaryCard title="Overall Decision" value={displayDecision(review.decision)} tone={decisionTone(review.decision)} />
            <SummaryCard title="Critical Findings" value={String(counts.CRITICAL)} tone={counts.CRITICAL ? 'bad' : 'neutral'} />
            <SummaryCard title="High Findings" value={String(counts.HIGH)} tone={counts.HIGH ? 'bad' : 'neutral'} />
            <SummaryCard title="Medium Findings" value={String(counts.MEDIUM)} tone={counts.MEDIUM ? 'warn' : 'neutral'} />
            <SummaryCard title="Low Findings" value={String(counts.LOW)} />
            <SummaryCard title="Changed Files" value={String(review.changedFiles.length)} />
            <SummaryCard title="Review Duration" value={formatDuration(review.durationMs)} />
            <SummaryCard title="Quality Gates" value={`${quality.failed} fail | ${quality.errors} error`} tone={quality.failed || quality.errors ? 'bad' : 'good'} />
          </section>

          {(activeSection === 'dashboard' || activeSection === 'quality') && (
            <section className="section-panel" id="quality">
              <SectionHeader
                title="Quality Checks"
                subtitle="Deterministic tool output is parsed from actual command execution and cannot be overwritten by the AI agent."
              />
              <div className="quality-grid">
                {orderedQualityChecks.map((check) => (
                  <QualityCheckCard check={check} key={check.id} />
                ))}
              </div>
            </section>
          )}

          {(activeSection === 'dashboard' || activeSection === 'reviews') && (
            <section className="main-grid">
              <div className="section-panel findings-panel">
                <SectionHeader
                  title="Findings"
                  subtitle={`${filteredFindings.length} of ${review.findings.length} findings shown. AI and deterministic sources are separated for review control.`}
                />
                <FiltersView filters={filters} setFilters={setFilters} />
                {filteredFindings.length ? (
                  <div className="findings-table" role="table">
                    <div className="findings-head" role="row">
                      <span>Severity</span>
                      <span>Category</span>
                      <span>Title</span>
                      <span>File</span>
                      <span>Source</span>
                      <span>Status</span>
                    </div>
                    {filteredFindings.map((finding) => (
                      <button
                        className={`finding-line ${selectedFinding?.id === finding.id ? 'selected' : ''}`}
                        key={finding.id}
                        onClick={() => setSelectedFinding(finding)}
                        type="button"
                      >
                        <Badge label={finding.severity} tone={severityTone(finding.severity)} />
                        <span>{labelize(finding.category)}</span>
                        <strong>{finding.title}</strong>
                        <span title={finding.file}>
                          {finding.file}
                          {finding.startLine ? `:${finding.startLine}` : ''}
                        </span>
                        <SourcePill source={finding.source} />
                        <Badge label={finding.status} tone={finding.status === 'OPEN' ? 'warn' : 'neutral'} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No findings match the filters" text="Adjust severity, source, status, file, or search filters." />
                )}
              </div>

              <FindingDetails finding={selectedFinding} onUpdate={updateFinding} />
            </section>
          )}

          {(activeSection === 'dashboard' || activeSection === 'activity') && (
            <section className="section-panel">
              <SectionHeader
                title="Agent Activity"
                subtitle="Operational trace of agents and tools. Hidden model reasoning is not exposed."
              />
              <TraceTimeline trace={review.trace} />
            </section>
          )}
        </>
      ) : (
        <EmptyState
          title={isRunning ? 'Review is running' : 'No review has been executed yet'}
          text={isRunning ? 'The orchestrator is collecting context and running deterministic tools.' : 'Start a review to populate findings, quality gates, policy output, and trace events.'}
        />
      )}
    </main>
  );
}

function RepositoryGrid({ review }: { review: Review | null }): JSX.Element {
  return (
    <div className="repo-grid">
      <Info label="Repository" value={review?.repository ?? './sample-project'} />
      <Info label="Branch" value={review?.branch ?? 'unknown'} />
      <Info label="Commit SHA" value={shortSha(review?.commitSha)} />
      <Info label="Changed Files" value={String(review?.changedFiles.length ?? 0)} />
    </div>
  );
}

function WorkflowProgress({ review, isRunning }: { review: Review | null; isRunning: boolean }): JSX.Element {
  return (
    <section className="workflow-panel" aria-label="Review workflow">
      <div className="workflow-title">
        <strong>Review Execution</strong>
        <span>{isRunning ? 'Running' : review ? 'Completed' : 'Ready'}</span>
      </div>
      <div className="workflow-steps">
        {workflowSteps.map((step, index) => {
          const status = workflowStatusFor(step, index, review, isRunning);
          return (
            <div className={`workflow-step ${status.toLowerCase()}`} key={step}>
              <span className="step-index">{index + 1}</span>
              <span>{step}</span>
              <strong>{status}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DecisionBanner({ review }: { review: Review }): JSX.Element {
  const reasons = review.policyReasons ?? [];
  return (
    <section className={`decision-banner ${decisionTone(review.decision)}`}>
      <div>
        <span>Policy Decision</span>
        <strong>{displayDecision(review.decision)}</strong>
      </div>
      <p>{reasons[0] ?? decisionExplanation(review)}</p>
    </section>
  );
}

function QualityCheckCard({ check }: { check: QualityCheck }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const metrics = Object.entries(check.metrics ?? {}).filter(([, value]) => value !== undefined && value !== null);
  return (
    <article className={`quality-card ${qualityTone(check.status)}`}>
      <button className="quality-card-main" onClick={() => setExpanded((value) => !value)} type="button">
        <div>
          <span className="quality-name">{qualityDisplayName(check.tool)}</span>
          <strong>{check.summary}</strong>
          <small>{formatDuration(check.durationMs)}</small>
        </div>
        <Badge label={check.status} tone={qualityTone(check.status)} />
      </button>
      {metrics.length > 0 && (
        <div className="metric-strip">
          {metrics.slice(0, 6).map(([key, value]) => (
            <span key={key}>
              <strong>{String(value)}</strong>
              {labelize(key)}
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <div className="quality-details">
          {check.details?.length ? (
            <div className="detail-list">
              {check.details.slice(0, 12).map((detail, index) => (
                <pre key={`${check.id}-${index}`}>{JSON.stringify(detail, null, 2)}</pre>
              ))}
            </div>
          ) : check.rawOutput ? (
            <pre>{trimOutput(check.rawOutput)}</pre>
          ) : (
            <p>No additional tool output was reported.</p>
          )}
        </div>
      )}
    </article>
  );
}

function FindingDetails({
  finding,
  onUpdate,
}: {
  finding: Finding | null;
  onUpdate: (finding: Finding, status: FindingStatus) => Promise<void>;
}): JSX.Element {
  return (
    <aside className="section-panel details-panel">
      <SectionHeader title="Finding Details" subtitle="Evidence, rationale, and human review controls." />
      {finding ? (
        <div className="finding-details">
          <div className="detail-badges">
            <Badge label={finding.severity} tone={severityTone(finding.severity)} />
            <Badge label={labelize(finding.category)} tone="neutral" />
            <SourcePill source={finding.source} />
            <Badge label={finding.status} tone={finding.status === 'OPEN' ? 'warn' : 'neutral'} />
          </div>
          <h3>{finding.title}</h3>
          <p>{finding.description}</p>
          <dl>
            <dt>File</dt>
            <dd>
              {finding.file}
              {finding.startLine ? `:${finding.startLine}` : ''}
              {finding.endLine && finding.endLine !== finding.startLine ? `-${finding.endLine}` : ''}
            </dd>
            <dt>Confidence</dt>
            <dd>{finding.source === 'AI' ? `${Math.round(finding.confidence * 100)}%` : 'Deterministic source'}</dd>
            <dt>Evidence</dt>
            <dd>
              <pre>{finding.evidence}</pre>
            </dd>
            <dt>Suggested Fix</dt>
            <dd>{finding.suggestedFix}</dd>
          </dl>
          <div className="actions">
            <button onClick={() => onUpdate(finding, 'ACCEPTED')} type="button">
              Accept
            </button>
            <button onClick={() => onUpdate(finding, 'DISMISSED')} type="button">
              Dismiss
            </button>
            <button onClick={() => onUpdate(finding, 'RESOLVED')} type="button">
              Mark Resolved
            </button>
          </div>
        </div>
      ) : (
        <EmptyState title="Select a finding" text="Choose an AI or deterministic finding to inspect its evidence and suggested remediation." />
      )}
    </aside>
  );
}

function TraceTimeline({ trace }: { trace: TraceEvent[] }): JSX.Element {
  if (!trace.length) {
    return <EmptyState title="No trace events yet" text="Agent and tool activity will appear after a review starts." />;
  }
  return (
    <div className="timeline">
      {trace.map((event) => (
        <div className={`timeline-row ${event.status.toLowerCase()}`} key={event.id}>
          <span className="timeline-pin" />
          <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
          <strong>{event.agent}</strong>
          <span>{event.tool ?? event.event}</span>
          <small>{event.durationMs ? formatDuration(event.durationMs) : '-'}</small>
          <Badge label={event.status} tone={event.status === 'FAILED' ? 'bad' : event.status === 'SUCCESS' ? 'good' : 'neutral'} />
        </div>
      ))}
    </div>
  );
}

function FiltersView({ filters, setFilters }: { filters: Filters; setFilters: (filters: Filters) => void }): JSX.Element {
  return (
    <div className="filters">
      <select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value as Filters['severity'] })}>
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value as Filters['category'] })}>
        {['ALL', 'BUG', 'SECURITY', 'PERFORMANCE', 'MAINTAINABILITY', 'VALIDATION', 'ERROR_HANDLING', 'ARCHITECTURE', 'TESTING', 'OTHER'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value as Filters['source'] })}>
        {['ALL', 'AI', 'ESLINT', 'TYPESCRIPT', 'JEST', 'SECURITY'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as Filters['status'] })}>
        {['ALL', 'OPEN', 'ACCEPTED', 'DISMISSED', 'RESOLVED'].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <input placeholder="Filter file" value={filters.file} onChange={(event) => setFilters({ ...filters, file: event.target.value })} />
      <input placeholder="Search findings" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="info-cell">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function SummaryCard({ title, value, tone = 'neutral' }: { title: string; value: string; tone?: string }): JSX.Element {
  return (
    <section className={`summary-card ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }): JSX.Element {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }): JSX.Element {
  return (
    <section className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </section>
  );
}

function Badge({ label, tone }: { label: string; tone: string }): JSX.Element {
  return <span className={`badge ${tone}`}>{labelize(label)}</span>;
}

function SourcePill({ source }: { source: FindingSource }): JSX.Element {
  return <span className={`source-pill ${source.toLowerCase()}`}>{source}</span>;
}

function countFindings(findings: Finding[]): Record<Severity, number> {
  return {
    CRITICAL: findings.filter((finding) => finding.severity === 'CRITICAL').length,
    HIGH: findings.filter((finding) => finding.severity === 'HIGH').length,
    MEDIUM: findings.filter((finding) => finding.severity === 'MEDIUM').length,
    LOW: findings.filter((finding) => finding.severity === 'LOW').length,
  };
}

function summarizeQuality(checks: QualityCheck[]): { failed: number; errors: number } {
  return {
    failed: checks.filter((check) => check.status === 'FAIL').length,
    errors: checks.filter((check) => check.status === 'ERROR').length,
  };
}

function orderQualityChecks(checks: QualityCheck[]): QualityCheck[] {
  const order = ['typecheck', 'eslint', 'jest', 'coverage', 'npmAudit'];
  return [...checks].sort((left, right) => order.indexOf(left.tool) - order.indexOf(right.tool));
}

function workflowStatusFor(step: string, index: number, review: Review | null, isRunning: boolean): 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'COMPLETED' {
  if (review) {
    const qualityByStep = new Map<string, QualityCheck | undefined>([
      ['Running TypeScript Check', review.qualityChecks.find((check) => check.tool === 'typecheck')],
      ['Running ESLint', review.qualityChecks.find((check) => check.tool === 'eslint')],
      ['Running Unit Tests', review.qualityChecks.find((check) => check.tool === 'jest')],
      ['Calculating Coverage', review.qualityChecks.find((check) => check.tool === 'coverage')],
      ['Running Dependency/Security Check', review.qualityChecks.find((check) => check.tool === 'npmAudit')],
    ]);
    const check = qualityByStep.get(step);
    if (check) return check.status === 'PASS' ? 'PASSED' : 'FAILED';
    return 'COMPLETED';
  }
  if (!isRunning) return 'PENDING';
  if (index < 2) return 'PASSED';
  if (index === 2 || index === 5) return 'RUNNING';
  return 'PENDING';
}

function displayDecision(decision: Review['decision']): string {
  return decision ? decision.replace(/_/g, ' ') : 'NOT RUN';
}

function decisionTitle(decision: Review['decision']): string {
  if (decision === 'BLOCKED') return 'Review blocked by deterministic quality gates';
  if (decision === 'HUMAN_REVIEW_REQUIRED') return 'Human validation is required for AI findings';
  if (decision === 'WARNING') return 'Review completed with warnings';
  return 'Review passed policy gates';
}

function decisionExplanation(review: Review): string {
  if (review.decision === 'BLOCKED') return 'Blocked because one or more deterministic quality gates failed.';
  if (review.decision === 'HUMAN_REVIEW_REQUIRED') return 'Human review required because high-severity AI findings need validation.';
  if (review.decision === 'WARNING') return 'Warnings were detected, but deterministic blocking gates did not fail.';
  return 'No blocking deterministic failures or high-severity AI findings were detected.';
}

function decisionTone(decision?: Review['decision']): string {
  if (decision === 'PASS') return 'good';
  if (decision === 'BLOCKED') return 'bad';
  if (decision === 'HUMAN_REVIEW_REQUIRED' || decision === 'WARNING') return 'warn';
  return 'neutral';
}

function severityTone(severity: Severity): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bad';
  if (severity === 'MEDIUM') return 'warn';
  return 'neutral';
}

function qualityTone(status: CheckStatus): string {
  if (status === 'PASS') return 'good';
  if (status === 'FAIL' || status === 'ERROR') return 'bad';
  return 'warn';
}

function qualityDisplayName(tool: string): string {
  const names: Record<string, string> = {
    typecheck: 'TypeScript Build',
    eslint: 'ESLint',
    jest: 'Unit Tests',
    coverage: 'Test Coverage',
    npmAudit: 'Dependency/Security Audit',
  };
  return names[tool] ?? labelize(tool);
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function shortSha(value?: string): string {
  if (!value) return 'uncommitted';
  return value.length > 10 ? value.slice(0, 10) : value;
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function trimOutput(output: string): string {
  return output.length > 5000 ? `${output.slice(0, 5000)}\n... output truncated for display` : output;
}

async function readableError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    return text || response.statusText;
  }
  return text || response.statusText;
}

createRoot(document.getElementById('root')!).render(<App />);
