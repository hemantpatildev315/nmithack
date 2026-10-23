# ⚡ Production AI-Evaluation Hackathon Starter

A clean, production-grade **Next.js 15 (App Router)** + **TypeScript (Strict)** + **Tailwind CSS** starter designed specifically for AI benchmark evaluation hackathons, deterministic agent workflows, and rubric scoring.

---

## 🚀 Key Features

- **Strict Repository Size Budget (< 5 MB)**: Comprehensive `.gitignore` excluding all build artifacts, heavy datasets, model weights, local cache files, and dependencies.
- **Architectural Separation**:
  - `src/app`: Modern Next.js App Router (Layouts, UI, and REST API handlers).
  - `src/components/ui`: Accessible primitives (`Button`, `Card`, `Input`, `Badge`) with full keyboard navigation and ARIA attributes.
  - `src/lib/gemini`: Google Gemini client with **deterministic Safe Fallback Mock Mode** for offline evaluation and CI resilience.
  - `src/lib/tools`: Deterministic agent tools (markdown block extractors, tolerant JSON parsers, exact match, token-level SQuAD F1, n-gram overlap, latency percentiles).
  - `src/lib/validators`: Centralized Zod schemas for all inbound payloads, test cases, rubrics, and run summaries.
  - `src/tests`: Unit and API test suites powered by **Vitest** and **React Testing Library**.
- **Quality & Security Baseline**:
  - Strict `tsconfig.json` with `noImplicitAny: true` and rigorous type checks.
  - Centralized environment validator (`src/lib/env.ts`) using Zod.
  - Global API response helpers (`src/lib/api-response.ts`) preventing sensitive stack traces or raw database internals from leaking to clients.

---

## 📂 Architecture & Directory Structure

```text
├── .env.example              # Documented environment template
├── .gitignore                # Comprehensive exclusions keeping repo < 5 MB
├── next.config.ts            # Production Next.js config
├── package.json              # Optimized scripts and dependencies
├── postcss.config.mjs        # PostCSS configuration
├── tailwind.config.ts        # Accessible theme token system
├── tsconfig.json             # Strict TypeScript configuration
├── vitest.config.ts          # Vitest + jsdom + RTL test configuration
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── eval/route.ts       # POST /api/eval (runs test cases against rubrics)
    │   │   └── health/route.ts     # GET /api/health (service health & diagnostic metadata)
    │   ├── globals.css             # Tailwind layers & CSS color variables
    │   ├── layout.tsx              # Root HTML layout with dark theme
    │   └── page.tsx                # Interactive AI evaluation cockpit & benchmark runner
    ├── components/
    │   └── ui/
    │       ├── Badge.tsx           # Status badge primitive with pulsing indicators
    │       ├── Button.tsx          # Accessible button (ARIA, loading spinners, variants)
    │       ├── Card.tsx            # Semantic card layout components
    │       └── Input.tsx           # Form input linked with ARIA error descriptions
    ├── lib/
    │   ├── api-response.ts         # Sanitized API response serializer & error boundary
    │   ├── env.ts                  # Zod environment variable parser
    │   ├── utils.ts                # Tailwind class merge utility
    │   ├── gemini/
    │   │   ├── client.ts           # Gemini SDK client with automatic mock fallback
    │   │   └── mock-data.ts        # Pre-calibrated mock evaluations & deterministic generators
    │   ├── tools/
    │   │   ├── calculation-engine.ts # Deterministic EM, Token F1, rubric aggregators
    │   │   └── data-parser.ts      # Markdown extraction and safe JSON recovery
    │   └── validators/
    │       ├── common.schema.ts    # Pagination and ID schemas
    │       └── eval.schema.ts      # Evaluation test case, rubric, and result schemas
    └── tests/
        ├── setup.ts                # Vitest setup with @testing-library/jest-dom
        ├── health.test.ts          # Baseline passing test for health endpoint & sanitizer
        ├── tools.test.ts           # Tests for data parser and calculation engine
        ├── gemini.test.ts          # Tests for Gemini client and mock fallback
        └── validators.test.ts      # Tests for Zod validation schemas
```

---

## 🛠️ Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

To run against real Google Gemini models, provide your API key in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
ENABLE_MOCK_GEMINI=false
```
*(If no API key is provided, the application automatically uses deterministic Safe Mock Fallbacks)*.

### 2. Available Scripts

```bash
# Start local development server on http://localhost:3000
npm run dev

# Run Vitest test suite
npm run test

# Run tests in interactive watch mode
npm run test:watch

# Run TypeScript typecheck without emitting files
npm run typecheck

# Build for production
npm run build
```

---

## 🧪 Testing Harness

Run all tests with:
```bash
npm run test
```

Test coverage includes:
- **Baseline Health Check (`src/tests/health.test.ts`)**: Validates `GET /api/health` and verifies that error handlers never leak stack traces.
- **Deterministic Tools (`src/tests/tools.test.ts`)**: Validates text normalization, code block extractors, tolerant JSON parsers, exact match, token F1 scores, and percentile calculations.
- **Gemini Fallback Client (`src/tests/gemini.test.ts`)**: Validates mock generation consistency and keyword matching.
- **Zod Schemas (`src/tests/validators.test.ts`)**: Verifies strict input validation and boundary checks.
