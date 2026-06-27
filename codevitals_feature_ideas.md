# CodeVitals — Roadmap (FROZEN — build, don't re-plan)

**Positioning:** *Explainable Code Intelligence.* Not just scores — evidence, reasoning, and
prioritized improvements. CodeVitals isn't "another AI analyzer," it's AI decision support:
Explainable Scoring → Confidence → Evidence → Root Cause → Sprint Plan.

**Suggested README opening line:** *"CodeVitals is an explainable code intelligence platform
that combines deterministic static analysis with AI-guided reasoning to help developers
understand not just what is wrong with their code, but why it matters, how confident the
analysis is, and what to fix first."*

**Design Principles** — every future addition must satisfy at least one of these, or don't build it:
- ✅ Makes the analysis more explainable
- ✅ Makes recommendations more actionable
- ✅ Reuses existing analysis infrastructure
- ✅ Improves interview discussion value
- ❌ Skip anything requiring an entirely new analysis engine unless it unlocks a genuinely new capability

---

## Stage 1 — Better Reports
*Goal: can users trust the analysis?*

### Explainable Scoring ⭐ build this first
- Expose the score breakdown instead of the final number alone —
  `Maintainability: 74 → Long Functions -8, Duplication -6, Deep Nesting -5, Documentation +4,
  Naming +3`, plus a what-if layer (*"Fix duplication → 80. Fix both → 85."*).
- Reuses your existing scoring formula — this just stops hiding the math.
- Effort: 1–2 days.

### Multi-Dimension Report Card
- Grades per category (Maintainability / Architecture / Security / Testing) instead of one hero
  number, using categories you already track.
- Effort: presentation change only.

### Confidence Score
- Tag every finding with detection method + trust level: `Unused Import: 100% (AST)`,
  `Possible Duplicate Logic: 81% (AST + similarity)`, `Naming Suggestion: 58% (AI opinion)`.
- Effort: half a day.

### Executive Summary view (shared reports)
- One-page version: project, language, grade per dimension, top 3 strengths, top 3
  improvements. Extends your existing Phase 3 shareable-report feature.
- Effort: a day.

---

## Stage 2 — Better Intelligence
*Goal: reduce cognitive overload — turn hundreds of individual findings into a handful of
actionable architectural improvements users can act on.*

### Architecture Insights / Structural Analysis
- Use "Structural Analysis" when explaining the mechanics (dependency graph, coupling,
  circular references — precise). "Architecture Insights" is fine as the UI panel label
  (reads better to a skimming recruiter). Same feature, pick the word to fit the audience.
- Build the import graph from `lib/analyzer/parser.ts` output. Tarjan's SCC for circular deps,
  degree analysis for god files/dead code. The graph is evidence — the report leads with the
  finding: *"3 circular dependencies. Largest cycle: Auth→Session→User→Auth. Impact: harder
  testing. Recommendation: extract a shared interface."*
- Render with the same Mermaid.js pipeline as System Design Visualizer.
- Effort: 1–2 days + narrative pass.

### Root Cause Clustering
- Group issues by where they live (Auth layer: 17 issues, validation duplicated across
  controllers, extract middleware) instead of a flat issue list.
- Directory-path heuristics for grouping, one Groq call per cluster for reason + recommendation.
- Effort: a day.

### Top Fixes (landing panel — synthesis, not new analysis)
- Merge Architecture Insights + Root Cause Clustering output into one ranked top-5 list:
  *"1. Break circular dependency (Auth↔Session↔User) — High impact. 2. Split Dashboard.tsx —
  High. 3. Extract Validation Middleware — Medium..."* No fake numbers, just High/Medium/Low
  impact based on affected-file count. This is the first thing a user sees — make it the
  landing view of the report.
- Effort: near-zero once the two features above exist — it's a merge + sort.

### AI Coaching with Evidence + "Why This Matters" + Sprint Planner
- Three refinements to the existing Groq layer:
  1. Cite the metric that triggered the flag ("complexity is 19, threshold is 10")
  2. Problem → Why it matters → Suggested fix structure (educational framing)
  3. Sprint 1/2/3 output instead of a paragraph
- Caution: don't attach a fabricated "+N points" estimate unless verified post-fix.
- Effort: prompt changes only.

---

## Stage 3 — Product Readiness
*Goal: make the project feel production-ready, not just feature-complete. This is broader than
monetization — and the empty/error states matter more in practice than the pricing page, since
anyone poking at your live demo is far more likely to hit a broken edge case than your Stripe
integration.*

- **Public GitHub URL analysis (Phase A only):** paste URL → fetch via GitHub's unauthenticated
  contents/tarball API → analyze. No OAuth, no webhooks, no stored tokens. ~80% of the value,
  1–2 days. README badges and full OAuth/rescan pipeline (Phases B/C) stay deferred indefinitely.
- **Pricing page + mocked "Pro" tier + real token-limit gate** (already designed, just
  currently deactivated). No Stripe — a working payment gateway adds zero interview signal here.
- **Empty states and error states** — what does the UI show on a failed parse, an empty ZIP, a
  rate-limited guest, a network timeout? Worth an explicit pass; this is what actually breaks a
  live demo in front of someone.

---

## Stage 4 — Better Engine
*Goal: can the engine become stronger? Lowest interview-signal-per-hour — do this last.*

- **Tree-sitter language expansion** (Java/C++/Rust/C# syntax gates via WASM grammars, not
  native toolchain spawning) — also fixes the un-sandboxed shell execution risk already flagged
  against the existing Python/Go checks, and actually runs on serverless where `javac`/`rustc`
  wouldn't.
- **ZIP parsing concurrency** — replace the sequential per-file loop with `Promise.all` + a
  concurrency limiter so large uploads don't block the event loop.

---

## Parking lot (only if Stage 1–4 are done with time to spare)

- Codebase Persona, Complexity Treemap (standalone), Recurring Offenders, Secrets Scanning —
  all cheap, none urgent, none required by the Design Principles above as written.

---

## What to skip entirely

| Idea | Why |
|---|---|
| Full Architecture Diagram Generator (auto-layering) | Needs heuristics beyond the graph — v2, not now |
| Project Evolution Replay (LLM-inferred commit timeline) | Hallucination risk, not just effort |
| Full Dependency Intelligence (bundle size, CVE lookups) | Reopens the "depends on another service" problem |
| Generic AI PR Reviewer | Saturated, well-funded market (CodeRabbit, Greptile, Qodo, Anthropic itself shipped one in March 2026). Your planned incident-aware reviewer is the sharper, less-crowded angle |

---

## Build order

1. Explainable Scoring
2. Multi-Dimension Report Card + Confidence Score
3. Executive Summary view
4. Architecture Insights (graph + findings)
5. Root Cause Clustering
6. Top Fixes landing panel
7. AI coaching refinements
8. GitHub Phase A
9. Pricing page + mocked Pro + token limits + empty/error states
10. Tree-sitter + ZIP concurrency

---

## Execution notes (not roadmap changes — practical follow-through)

- **Release tags:** ship Stage 1 as `v1.1`, Stage 2 as `v1.2`. Gives you real milestones instead
  of one big undated push.
- **README closing line**, after the opening positioning paragraph: *"Unlike purely AI-based
  reviewers, every recommendation is grounded in measurable code metrics and structural
  analysis."* That sentence is the actual differentiator — lean on it.
- **Demo video:** once Stage 2 ships, record a 60–90s walkthrough (Upload ZIP → Explainable
  Score → Structural Analysis → Top Fixes → Sprint Plan) and pin it in the README. Communicates
  the value faster than screenshots or paragraphs for anyone skimming the repo.

**Roadmap frozen here. Next step is building, not another round of feedback.**
