# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## What this repository is

This is not a conventional software project — there is no package.json, build tool, linter, or test runner. It is a **single self-contained HTML file dashboard** (`index.html`) produced through a no-code / "vibe-coding" workflow for a non-engineer user (a 냉동컨테이너 / reefer-container business person at a shipping company), plus the artifacts of that workflow:

- `index.html` — the deliverable. Single file, no external dependencies (no CDN scripts, no build step). Open it directly in a browser (double-click) to run it.
- `index (1).html` — identical byte-for-byte copy of `index.html` (verified via diff); safe to ignore or treat as a backup, not a divergent version.
- `프롬프트.md` — the reusable prompt template the user gives an AI assistant to kick off this kind of dashboard project (role, data, desired questions, constraints, and a 4-step process: inspect data → confirm questions are answerable → propose metrics/chart design and wait for confirmation → build `index.html`).
- `PRD.md` — the PRD for the *current* iteration of work (adding a route/노선 filter to the dashboard). Contains the authoritative spec: user assumptions, exact KPI/metric formulas, per-chart behavior on filter, and a numbered list of success criteria (S1–S12) with expected values — treat this as the source of truth for what "correct" looks like when touching filter behavior.
- `부킹이력_OO해운_2026-06.xlsx` — the original data source (educational/synthetic sample, sheet "6월 부킹이력"). **Not read directly by the current work** — the PRD states `DATA` in `index.html` is assumed to already contain this file's contents. Only go back to the xlsx if you need to verify/regenerate `DATA` itself.
- `files.zip` — a bundled export of `PRD.md` + `index.html` (a deliverable snapshot); not a separate source of information.
- `artifact_url.txt` — URL of a previously published Claude Artifact version of this dashboard.

There are no commands to build, lint, or test. "Running" the app means opening `index.html` in a browser. There is no committed automated test suite despite the PRD mentioning a prior jsdom-based check — that was done ad hoc in a previous session and not persisted as a script; don't assume a test file exists.

## Architecture of `index.html`

Everything lives in one file: inline `<style>` (CSS custom properties drive light/dark theming via `prefers-color-scheme` and `[data-theme]`), inline `<svg>` chart containers, and a single `<script>` block.

- **Data**: `const DATA = [...]` — 147 hardcoded booking records, one object per row. Fields: `quoteDate`, `etd`, `shipper`, `pol`, `pod`, `loop` (service route: `한중` / `동남아` / `한일`), `ctype` (container type: `20GP` / `40HC` / `40RF`), `box` (count), `teu`, `rateType`, `rate` (USD/box, quoted freight), `booked` (`'Y'`/`'N'`), `rollover` (`'Y'`/`'N'`/`null` — `null` means the concept doesn't apply, i.e. `booked==='N'`; never coerce this to a value), `staff`.
- **Domain scope**: "냉동컨테이너" (reefer) analysis = rows where `ctype === '40RF'` (25 of 147 rows). There is no container-manufacturer field in the data, so all "by maker" framing from the original prompt was replaced with "by route (`loop`)" analysis — this substitution is a deliberate, confirmed decision, not a gap to fix.
- **Route filter state**: a single module-level `activeRoute` (`null` = all routes, or one of `ROUTES`). Rendering is a full re-render pipeline: `render()` recomputes `scope`/`rf` from `activeRoute` and calls `renderKpi`, `renderTrend`, `renderShare`, `renderRate`, `renderTable` — there is no incremental DOM patching, so when adding filter dimensions, extend this same recompute-and-redraw pattern rather than introducing partial updates.
- **Two different aggregation scopes coexist by design**: KPIs / trend chart / table are scoped to the *selected* route (or all); the share (②) and rate (③) comparison charts are **always computed over all 3 routes** (`ALL_RF`, `routeAgg`) and only visually highlight the selected one (non-selected bars get reduced `fill-opacity`). Don't "fix" this into filtering ②③ to one route — collapsing to a single route would make share = 100% and defeat the comparison purpose (see PRD §3, S6).
- **Charts are hand-rolled inline SVG** built by string-templating into `svg.innerHTML`, not a charting library or `<canvas>`. Interactivity (tooltips, bar-click-to-filter) is wired by re-querying the just-inserted SVG elements (e.g. `svg.querySelectorAll('rect')`) after each render.
- **Filter chips** are generated into `#filterbar` from `ROUTES`, each carrying a `data-route` attribute and count; clicking toggles `activeRoute` and re-renders. Chart bars in ②③ also set `activeRoute` on click (same filter, different entry point) and re-clicking the active chip/bar clears the filter back to "all".
- **Formatting conventions**: integers via `fmt` (rounded, `ko-KR` thousands separator), one-decimal values via `fmt1`. Follow these instead of ad hoc `toFixed`/string concatenation.

## Working conventions specific to this project

- The user is a non-engineer domain expert, not a developer — explanations and confirmations should be in business/data terms (what a row means, what a metric measures), not implementation detail, unless they're reviewing code directly.
- Never fill blank/`null` data with assumed values; always state how missing data (e.g. `rollover: null`) was handled, per `프롬프트.md`'s stated constraints and `PRD.md §5`.
- Before computing any aggregate, confirm what one row represents (here: one shipper's single quote/booking) — this checking step is an explicit requirement from `프롬프트.md`.
- When changing dashboard behavior, cross-check against `PRD.md`'s success criteria (S1–S12) with their exact expected numbers (e.g. S1 baseline: 17.0% / 540 TEU / 1,164 USD/box / 68.0%, 25 rows) rather than only checking that the code runs.
