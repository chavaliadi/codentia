# CodeVitals 🩺

> **A multi-language project health analyzer with deterministic metrics, structured AI insight, and scan evolution tracking.**
>
> Drop in a single file or an entire ZIP — CodeVitals scores your codebase, explains why, and tracks how it improves over time.

---

## What Is This?

CodeVitals is a web SaaS that gives developers a structured maintainability score for their code, plus an explicit correctness gate where available. It uses:

- **Static analysis** (AST-based for JS/TS, regex-based for everything else) for deterministic, reproducible metrics
- **AI-powered explanation** (Llama 3 70B via Groq) for human-readable insights and actionable recommendations
- **Evolution tracking** (Convex) to show how your codebase improves scan-to-scan
- **Shareable reports** so you can drop a link in a PR or README

**It is not a guarantee that code is runtime-correct.** It is a structured health report with syntax/correctness signals where supported — like getting bloodwork done for your code.

---

## Core Product Philosophy

| Priority | Principle |
|----------|-----------|
| 1 | **Helpful & Clear** — explain what's wrong, not just flag it |
| 2 | **Trustworthy** — deterministic metrics, not magic black boxes |
| 3 | **Calm** — no red alerts, no alarmism. Constructive tone. |
| 4 | **Habit-forming** — evolution tracking makes repeat scans rewarding |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Vanilla CSS (custom design system) |
| **Auth** | Clerk |
| **Database / Realtime** | Convex |
| **AI** | Groq API — Llama 3 70B |
| **AST Parsing** | Babel (`@babel/parser`, `@babel/traverse`, `@babel/types`) |
| **ZIP Handling** | adm-zip |
| **Charts** | Recharts |
| **Icons** | Lucide React |

---

## Project Structure

```
ai-project/
├── app/
│   ├── page.tsx                  # Landing page (Paste Code / Upload ZIP tabs)
│   ├── analyze/page.tsx          # Single-file results page
│   ├── project/page.tsx          # Multi-file project results page (with share modal)
│   ├── dashboard/page.tsx        # Evolution tracking dashboard
│   ├── scan/[id]/page.tsx        # Public shareable scan report
│   └── api/
│       ├── analyze/route.ts      # Single-file analysis endpoint
│       ├── analyze-zip/route.ts  # ZIP upload & multi-file analysis endpoint
│       └── save-scan/route.ts    # Save scan to Convex (for sharing + history)
│
├── lib/
│   ├── analyzer/
│   │   ├── parser.ts             # Babel AST parser (JS/TS)
│   │   ├── metrics.ts            # AST metric extraction (complexity, depth, etc.)
│   │   ├── scorer.ts             # Scoring engine (0–100, letter grades)
│   │   ├── textAnalyzer.ts       # Generic regex-based analyzer (Python, Java, Go, etc.)
│   │   ├── aggregate.ts          # Multi-file aggregation → ProjectResult
│   │   └── types.ts              # Shared types (AnalysisResult, Issue, Grade…)
│   ├── ai/
│   │   └── groq.ts               # Groq/Llama 3 70B integration
│   └── db/
│       └── saveScan.ts           # Server-side Convex mutation helper
│
├── convex/
│   ├── schema.ts                 # UserTable + ScansTable (3 indexes)
│   ├── user.ts                   # CreateNewUser mutation
│   └── scans.ts                  # saveScan, getScansByUser, getProjectHistory,
│                                 # getScanById, deleteScan
│
├── components/
│   └── analyzer/
│       ├── ScoreGauge.tsx        # SVG arc score gauge
│       ├── MetricsGrid.tsx       # Metrics card grid
│       ├── IssueList.tsx         # Filterable issue list
│       └── AIInsight.tsx         # Typewriter AI insight panel
│
└── proxy.ts                      # Clerk middleware (public routes config)
```

---

## Analysis Engine

### Correctness vs Maintainability (Product Contract)

CodeVitals reports two separate signals:

- **Correctness Gate**: syntax/type/lint status where available
- **Maintainability Score**: structural quality metrics

If correctness fails, that status should be treated as primary. A maintainability score does not imply code is executable or bug-free.

| Mode | Languages | Correctness Gate | Maintainability |
|------|-----------|------------------|-----------------|
| **Deep** | JS/TS | Syntax-aware (`pass/fail`) | AST structural metrics |
| **Quick** | Python, Go, Java, C++, etc. | Python/Go syntax check, others `unknown` (rolling out by language) | Text/regex structural metrics |

### Supported Languages (Current)

| Language | Mode | Correctness |
|----------|------|-------------|
| JavaScript / TypeScript | Deep | Syntax-aware (`pass/fail`) |
| Python | Quick+ | Syntax check (`pass/fail`) |
| Go | Quick+ | Syntax check (`pass/fail`, or `unknown` if Go toolchain missing) |
| Java | Quick | `unknown` (structural + language-specific insights) |
| C++ | Quick | `unknown` (structural + language-specific insights) |

### Deep Analysis (JavaScript / TypeScript)
Uses Babel to parse a real AST. Metrics extracted:

| Metric | What It Measures |
|--------|-----------------|
| `avgCyclomaticComplexity` | Average decision paths per function |
| `maxCyclomaticComplexity` | Worst-case function complexity |
| `avgFunctionLength` | Average lines per function |
| `maxFunctionLength` | Longest function in file |
| `maxNestingDepth` | Maximum block nesting depth |
| `duplicationPercentage` | Sliding-window duplicate line detection |
| `unusedImportCount` | Imports declared but never referenced |
| `totalFunctions` | Function count |
| `totalLines` | Line count |

### Quick Scan (Python, Java, Go, C++, C#, Rust, Ruby, Others)
Uses regex + brace/indentation tracking when an AST is unavailable. Detects:
- Function boundaries (language-aware patterns)
- Nesting depth via brace counting
- Complexity keywords (`if`, `for`, `while`, `switch`, etc.)
- Duplicate lines (sliding window)
- Long functions

### Scoring

```
Score = 100 − penalties

Penalties:
  Complexity     up to −25 pts
  Function len   up to −20 pts
  Nesting depth  up to −20 pts
  Duplication    up to −20 pts
  Unused imports up to −15 pts

Grade thresholds:
  90–100 → Excellent
  75–89  → Good
  55–74  → Fair
  0–54   → Critical
```

### Category Scores (Project Level)

| Category | Formula |
|----------|---------|
| Readability | avg(nesting score, function length score) |
| Maintainability | avg(complexity score, duplication score) |
| Cleanliness | unused import score |
| Structure | avg(function balance, file size score) |

---

## Phases — What's Done, What's Next

### ✅ Phase 1 — Single-File Analyzer (COMPLETE)
- Paste code, select language, get instant analysis
- AST-based metrics for JS/TS
- Score gauge (0–100), letter grade, issue list
- AI Insight panel with typewriter animation
- Metrics grid (complexity, function length, nesting, duplication)
- Unused import detection (including JSX components)

### ✅ Phase 2 — Multi-Language + ZIP Upload (COMPLETE)
- **ZIP upload** with drag-and-drop — analyze entire projects
- **Multi-language support**: 14+ languages via hybrid approach
  - Deep Analysis (JS/TS) → full AST
  - Quick Scan (Python, Java, Go, C++, C#, Rust, Ruby, etc.) → TextAnalyzer
- **Mode badges** — every file tagged 🔬 Deep or ⚡ Quick
- **Project results page** (`/project`)
  - Weighted project score (file-size-aware)
  - 4-category bar chart (Readability, Maintainability, Cleanliness, Structure)
  - Top improvements ranked by potential score gain
  - Full file breakdown table (score, grade, mode, top issue)
- **macOS resource fork filtering** — `._filename` and `__MACOSX/` auto-excluded
- **File exclusions** — `node_modules`, `.next`, `dist`, `build`, `.git`, `vendor`, `__pycache__`

### ✅ Phase 3 — Scan History + Sharing (COMPLETE)
- **Convex ScansTable** — persists scan results per user
  - Indexed by `userId`, `scanId`, and `userId + createdAt`
- **Soft auth** — analyze freely without login; login to save history
- **Share Modal** — from any project report
  - Visibility toggle: **Summary** (score + categories + improvements) or **Full Report** (includes file-by-file breakdown)
  - Generates a unique public link at `/scan/[id]`
- **Public scan page** (`/scan/[id]`) — no login needed to view
  - Respects visibility setting set by sharer
  - CTA to convert viewers into users
- **Dashboard** (`/dashboard`) — requires login
  - Project sidebar (switch between named projects)
  - **Evolution banner** — score delta from last scan, supportive messaging
  - **Score trend chart** (Recharts line chart, oldest-first)
  - Category bar breakdown for latest scan
  - Scan history list with share actions
  - Project-level delete action (**Delete Project History**)
- **Named projects** — user provides project name on upload, groups history

### 🔜 Phase 4 — Score Badge + GitHub Integration (PLANNED)
- Embeddable score badge (like shields.io) for GitHub READMEs
  ```
  ![CodeVitals](https://codevitals.app/badge/abc123)
  ```
- GitHub URL input — analyze a public repo directly (no ZIP needed)
- Re-analyze button on project page (upload new version, compare delta)

### 🔜 Phase 5 — Monetization (PLANNED)
- Token system activation (deferred intentionally — growth first)
- Stripe integration for premium tiers
- Higher file limits, priority queue for AI

### 🔜 Phase 6 — VS Code Extension (PLANNED)
- In-editor score sidebar
- Issue highlights inline
- One-click scan via same backend API

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
# Create .env.local with:
NEXT_PUBLIC_CONVEX_URL=<your convex URL>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk key>
CLERK_SECRET_KEY=<clerk secret>
GROQ_API_KEY=<groq key>

# 3. Push Convex schema
npx convex dev --once

# 4. Start the dev server
npm run dev
```

App runs at `http://localhost:3000`

> **Note:** Convex and Clerk require their own project setups at convex.dev and clerk.com respectively. Groq API keys are free at console.groq.com.

---

## Environment Variables

| Variable | Where to Get It |
|----------|----------------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex dashboard → project settings |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API keys |
| `CLERK_SECRET_KEY` | Clerk dashboard → API keys |
| `GROQ_API_KEY` | console.groq.com → API keys |

---

## Key Design Decisions

**Why no token limits?**
Tokens create friction before trust is established. The evolution tracking feature only has value if users scan repeatedly. Unlimited free scanning is the growth mechanism. Tokens are planned for Phase 5 after adoption.

**Why not full AST for every language?**
Maintaining language-specific ASTs for 10+ languages would be an enormous scope explosion. The TextAnalyzer provides meaningful signal (function length, nesting depth, complexity, duplication) for 95% of use cases in non-JS/TS files.

**Why store scan summaries instead of full raw data?**
Convex storage stays lean and fast. Full file-level data is only persisted when the user explicitly chooses "Full Report" visibility for a shareable link.

**Why shareable links at all?**
Organic growth. Users sharing scan links in PRs and READMEs market the product for free. Every open-source repo that uses a CodeVitals badge becomes an acquisition channel.

---

## Validation

Phase 2 self-analysis — CodeVitals analyzed its own `lib/` folder:
- **97/100 — Excellent** overall
- Correctly identified `metrics.ts` as weakest file (83/100) — it contains a legitimate 17-path `computeComplexity` function
- Correctly flagged `aggregateResults` as 115 lines long
- Correct mode badges on all 20 files

This is a real-world sanity check: the tool analyzed itself and produced accurate, actionable results.

## Demo Checklist (2-3 mins)

Use this flow before interviews or resume submissions:

1. **Broken TypeScript** -> expect `Correctness Gate: Fail`, syntax errors visible, score capped.
2. **Valid TypeScript** -> expect `Correctness Gate: Pass`, maintainability insights.
3. **Broken Python** -> expect `Correctness Gate: Fail` (quick+ syntax support).
4. **Java or C++ snippet** -> expect language-specific issues with `Correctness Gate: Unknown`.
5. **ZIP upload** -> expect project score + correctness summary (`failed`, `unchecked`, confidence band).

## Known Limits (Current)

- Java and C++ are **Quick mode** today: language-specific structural insights are available, but correctness remains `unknown`.
- Go correctness depends on local Go tooling (`gofmt`); if unavailable, status falls back to `unknown`.
- Project trend grouping currently uses project name. Similarity-based grouping across renamed projects is a planned enhancement.
