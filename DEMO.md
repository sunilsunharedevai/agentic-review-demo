# 15-20 Minute Demo Script

## 1. Setup

```bash
npm install
cp .env.example .env
npm run build
npm run test
npm run dev
```

Open `http://localhost:5173`.

## 2. Story

A developer changed an Orders service in a small NestJS business application. Traditional tools should catch compile, lint, test, and dependency issues. The AI review should add contextual findings such as missing authorization, weak validation, unsafe logging, swallowed exceptions, and missing tests.

## 3. Walkthrough

1. Show `sample-project/src/orders/orders.service.ts`.
2. Show `sample-project/GROUND_TRUTH.md`.
3. Open the dashboard.
4. Point out the application shell: Dashboard, Reviews, Agent Activity, and Quality Checks.
5. Click **Run Agentic Review**.
6. Explain the workflow steps: git context, Code Review Agent, Quality Agent, deterministic tools, aggregation, policy.
7. Review the prominent policy decision and summary cards.
8. Open the Quality Checks panel and point out deterministic checks:
   - TypeScript passes.
   - ESLint reports real parsed issues.
   - Jest reports 1 failed / 2 total tests.
   - Coverage is calculated from real Jest output.
   - npm audit reports dependency security findings from npm metadata.
9. Expand a quality check to show raw parsed details.
10. Open findings.
11. Filter `Source = AI`.
12. Show contextual findings and evidence.
13. Open Agent Activity and show tool calls without chain-of-thought.
14. Accept one AI finding.
15. Dismiss one AI finding with a reason.
16. Explain that deterministic gates can block, while AI high/critical findings require human review.
17. Fixing example: change `return price * quantity * discount` to `return price * quantity * (1 - discount)` and rerun tests/review.
18. Explain CI/CD integration with GitHub Actions and PR comments.

## Expected Demo Results

Because `sample-project` is intentionally imperfect, the initial decision is expected to be `BLOCKED` when deterministic quality gates fail.

Current deterministic result targets:

- TypeScript Build: `PASS`, `0 compilation errors`.
- ESLint: `FAIL`, `1 errors | 1 warnings`.
- Unit Tests: `FAIL`, `1 passed | 1 failed | 0 skipped`.
- Test Coverage: real percentages from Jest coverage output.
- Dependency/Security Audit: live `npm audit` result, currently `0 critical | 3 high | 5 moderate | 1 low`.

## 5-Minute Executive Sequence

1. Open `http://localhost:5173` and identify the repository panel as the developer feature branch.
2. Click **Run Agentic Review** and narrate the workflow steps as the orchestrator runs.
3. Show the `BLOCKED` policy decision and explain that deterministic gates, not AI alone, block release.
4. Expand Quality Checks to show TypeScript, ESLint, Jest, Coverage, and Audit values from real tools.
5. Filter findings to `AI`, open one security/validation finding, then accept or dismiss it to demonstrate human-in-the-loop governance.
6. Open Agent Activity and show the trace of repository tools, deterministic tools, aggregation, and policy evaluation.

## Likely Questions

### Why AI if ESLint/SonarQube already exist?

Static tools are excellent for deterministic rules. AI adds contextual reasoning: ownership boundaries, missing authorization, weak validation, business logic intent, and test adequacy.

### Why two agents?

The Code Review Agent reasons over code context. The Quality Agent executes deterministic tools and preserves their outputs exactly. Separation reduces hallucination risk.

### What makes this agentic?

The review is orchestrated through agents with controlled tools, traceable tool activity, structured outputs, policy evaluation, and human review states. It is not a single unconstrained prompt.

### How are hallucinations controlled?

The agent receives bounded repository evidence, output is schema-validated, file access is constrained, deterministic results are authoritative, and AI findings require human validation.

### How do you protect source code?

Repository access is read-only and path constrained. Secrets are redacted where practical. API keys are environment-only. No arbitrary shell tool is exposed to the LLM.

### Why should AI not directly block production?

AI can be wrong. Deterministic gates can block automatically; AI high-risk findings route to human review until validated.

### How would this scale to 100 repositories?

Add queued review workers, persistent storage, repository policy profiles, shared tool cache, diff summarization, and CI webhook integration.

### How would cost be controlled?

Review changed files first, cap file bytes, summarize context, use smaller models for triage, cache repeated analysis, and reserve stronger models for high-risk changes.

### How would accuracy be measured?

Use ground-truth defect sets like `sample-project/GROUND_TRUTH.md`, track true positives, false positives, false negatives, reviewer dispositions, and post-merge defects.

### Could it automatically fix code?

Future phase: generate patches, run tests, and require explicit human approval before applying or committing changes.
