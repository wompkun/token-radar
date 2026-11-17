# Token Radar (token-radar-01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maximal-quality make.fun token-radar-01 entry: a ranked board of pre-token protocols by implied value plus an offline dashboard, in `~/workspace/makefun-sponsor/token-radar-build/`, without submitting, signing, or creating a GitHub repo.

**Architecture:** `main.ts` (Node 24, stdlib only) reads the sealed snapshot, scores with `lib/model.ts` (radar-2), writes `board.json` + `data.js`, copies `dashboard/` + `screenshots/`, writes `dossier.json` via `vendor/makefun-board.ts`. The dashboard is static HTML/CSS/JS, no network, reading `data.js`.

**Tech Stack:** Node 24, TypeScript (type-stripping), plain HTML/CSS/JS, Playwright Chromium 131 for screenshots and e2e checks, `node --test` for model tests.

**Spec:** `competition.yaml` + `RULES.txt` in the kit at `~/workspace/makefun-sponsor/token-radar-01-kit/`; `~/workspace/makefun-skill.md` sections 2–5 for submission rules.

## Global Constraints

- Board: all 40 watchlist slugs, 100–4000 rows, ranks 1..N exactly once, implied_value_usd non-increasing with rank, farm_steps 3–12 strings of 20–600 chars each.
- Dashboard: `index.html` + at least one `.css` and `.js`, no network (no http/https in attributes, style, script imports, CSS or JS imports), total dashboard source under 64KB in the dossier.
- Screenshots: 3 images, each at most 512 KiB, long side at most 1440.
- Model: no protocol-name special-casing; only snapshot fields (tvl_usd, change_7d, mcap_usd, listed_at/age, category, chains, gecko_id/symbol).
- Rewards: 1st $1,000, 2nd–5th $50, 6th–10th $25, total $1,325; AI judge ranks by win rate, so design quality matters as much as the model.
- handed_over_places=none: a handed-over transcript bundle takes no paid place; do not fabricate transcripts.
- Do NOT submit, sign anything, create a GitHub repo, or spend money in this build.

## Review Focus

- A protocol name/category from the snapshot containing HTML or a URL must not execute in the dashboard (all insertion via textContent / createElement, never innerHTML with data).
- A 7d change of +4448% (present in the snapshot) must not crown a protocol (growth is clamped).
- A wrapped bridge with a huge TVL must not top the board (farmability by category).
- The dashboard must still render if a protocol has null change_7d / listed_at (unknown age/growth handled).
- Screenshots must show the actual built dashboard, not the starter's.

## Brainstorming (short, starter already existed)

- What: best pre-token protocol radar — which protocol is worth farming next, and what to do about it — for airdrop farmers, judged by an AI judge on the dossier.
- Approaches considered: (A) keep starter model, restyle only — rejected: starter ranks wrapped bridges high and bottom rows at $1; (B) radar-2 model + redesigned dashboard — chosen; (C) external data / ML — rejected: sealed snapshot only, no network, no name special-casing.
- Success: gate passes, top 10 are plausibly farmable, dashboard is clear at 1440x900, screenshots are of the built dashboard.

---

### Task 1: Model radar-2 in lib/model.ts

**Files:**
- Modify: `lib/model.ts`
- Test: `tests/model.test.ts`

**Interfaces:**
- Consumes: `Snapshot` (as_of, floor_usd, protocols, watchlist)
- Produces: `impliedValue(p, asOf, model)` -> {implied, growthPct, growthMult, maturityMult, farmMult, chainMult, age}; `farmability(category)`; `ageMultiplier(age, model)`; `buildBoard(snapshot)` -> BoardRow[]; `farmSteps(p, age)` -> 7 FarmStep[]

- [ ] **Step 1: Write the failing test** — `tests/model.test.ts`: watchlist coverage (40/40), 200 rows, ranks 1..200, monotonic implied, farmability bridge 0.15 / CEX 0.10 / lending 1.0 / curator 0.85, age peak 1.0 at 365d / 0.75 after 3y / 0.85 unknown, growth cap 100 on +4448%, farm steps 7 x 20–600 chars and category-specific, `boardIssue(board, snapshot) === null`.
- [ ] **Step 2: Run test to verify it fails** — Run: `node --test tests/model.test.ts` — Expected: FAIL (functions/constants missing).
- [ ] **Step 3: Implement radar-2** — `implied = max(1000, round(TVL*0.25 * (1+clamp(change_7d,-50,100)/100*0.5) * ageMult * farmMult * (1+0.01*min(chains,5))))`; early rows scored by implied, not TVL; 7 farm steps with a category-specific second action.
- [ ] **Step 4: Run test to verify it passes** — Run: `node --test tests/model.test.ts` — Expected: PASS, all tests.
- [ ] **Step 5: Commit** — `git add lib/model.ts tests/model.test.ts && git commit -m "model: radar-2 with farmability, age peak, growth cap"`

### Task 2: Dashboard redesign (ui-ux-pro-max design system)

**Files:**
- Modify: `dashboard/app.css`, `dashboard/app.js`
- Test: `tests/e2e-flow.mjs` (Playwright, Chromium 131 in `~/.cache/ms-playwright/`)

**Interfaces:**
- Consumes: `window.RADAR` from `data.js` (rows, live, model, model_version, watchlist_slugs)
- Produces: ranked board table, spotlight top 5, top-10 horizontal bar chart (sqrt-scaled, value labels), search/category/chain/early filters, detail dialog with model breakdown + 7 farm steps, model panel with farmability table.

- [ ] **Step 1: Write the failing test** — `tests/e2e-flow.mjs`: board renders 200 rows; detail opens for rank 1 and shows 7 steps; category filter reduces rows; chart bar #10 width >= 20% of bar #1 width.
- [ ] **Step 2: Run test to verify it fails** — Run: `node tests/e2e-flow.mjs` — Expected: FAIL on chart-bar ratio (linear scale gives ~9%).
- [ ] **Step 3: Implement dashboard** — dark slate palette from ui-ux-pro-max (`#0F172A` bg, `#F59E0B` primary, `#8B5CF6` accent, system fonts only, no webfonts — offline gate); sqrt chart bars; textContent-only rendering.
- [ ] **Step 4: Run test to verify it passes** — Run: `node tests/e2e-flow.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add dashboard/ tests/e2e-flow.mjs && git commit -m "dashboard: radar-2 dark theme, spotlight, sqrt chart, filters"`

### Task 3: Build, gate check, screenshots

**Files:**
- Modify: `screenshots/1-board.png`, `screenshots/2-detail.png`, `screenshots/3-filtered.png`
- Test: `out/` build + gate script (board/dossier/dashboard checks)

- [ ] **Step 1: Build** — Run: `MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json` — Expected: exit 0, 200 rows.
- [ ] **Step 2: Gate check** — board rows/watchlist/ranks/monotonic/farm steps; dashboard total < 65536 bytes, no http/https; screenshots 3, each <= 512 KiB, long side <= 1440.
- [ ] **Step 3: Screenshots** — Playwright Chromium, 1440x900: board, detail (`#p=<rank1 slug>`), filtered (`#category=Lending`); view each image and fix layout issues found.
- [ ] **Step 4: Rebuild + re-check** — rebuild so `out/` carries the new screenshots, re-run gate check.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "build: screenshots of the built dashboard"`

### Task 4: Security guidance review + verification before completion

**Files:**
- Modify: none unless a finding needs a fix (then a failing test first, per TDD)
- Test: full verification run (tests + build + gate + e2e)

- [ ] **Step 1: Security review (guidance mode)** — grep dashboard for http/https/imports; confirm no innerHTML with snapshot data; confirm no keys/secrets in output; confirm farm steps never ask for payment to claim.
- [ ] **Step 2: Fresh verification** — Run: `node --test tests/model.test.ts && node tests/e2e-flow.mjs && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json` — Expected: all pass, exit 0.
- [ ] **Step 3: Report** — build path, model + why, design choices, grade/check output, screenshot sizes, board row count + top 10, `bundle --dry-run` result, what remains before GitHub + submission.
