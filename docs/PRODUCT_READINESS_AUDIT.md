# Product experience audit — findings and 30-day plan

Program 139 · 2026-08-05 · all nine founder observations reproduced on production `482f90f6` before any change.

## What shipped this run (P0)

| # | Founder observation | Fix | Verified |
|---|---|---|---|
| P0-1 | Diagnostic box dominates the homepage hero; "Behind", "Withheld" are the first impression | `TerminalSummaryPanel` **moved to `/methodology`** — unchanged, not softened, just relocated to where a reader has already asked "how does this work?" | `out/index.html`: 0 occurrences of "What this site compares" / "Withheld" |
| P0-2 | Simulation Hub promotes a settled UFC archive beside live MLB | New `lib/home/simulation-hub.mjs` derives each sport's state from artifacts. UFC → `HISTORICAL_ONLY` → renders under **"Other coverage"**, never the primary hub | 9 guards; built HTML has "Simulation Hub" then "Other coverage" |
| P1-1 | "Daily Dashboard" should be "Mr. Dub's Portfolio" everywhere | Renamed in top nav, command rail, mobile nav, trust-center link, page metadata | 3 label guards updated to the new canonical value |

**Design note on P0-2:** an in-season *no-play* stays in the primary hub. Hiding a quiet day would make
model discipline look like an outage — the opposite defect.

---

## P0-4 — NOT FIXED, and the most important finding

### Bank Builder / Moonshot are stale, not disciplined

The founder asked whether the paused products are "honest model discipline or an operations failure."
It is an operations failure, and the evidence is unambiguous:

```
MLB board            2026-08-05   current — the daily board IS running
bank-builder ledger  2026-08-04   current
moonshot lane        2026-07-21   15 days stale, status still "active"
daily-portfolio      2026-07-21   15 days stale
mr-dub/portfolio     2026-07-07   PROTECTED — frozen by design, not a defect
```

**Root cause:** `scripts/refresh_daily_products.sh` is the only thing that regenerates Bank Builder
and Moonshot daily cards, and **it is not referenced by any GitHub workflow**. It has never been
scheduled. The last run was manual, around 2026-07-21. Nothing is broken — nothing is *running*.

```bash
grep -rln "refresh_daily_products" .github/workflows/   # → no matches
```

**Why the page still says "Live today":** the `/bank-builder` freshness badge is fed the *MLB slate*
date, which the daily board keeps current, while the cards below it are a different artifact on a
different (absent) schedule. The badge measures one thing and sits above another.

I attempted the obvious one-line fix — feed it `bbPreview.date` — and **reverted it**: that value is
the slate date passed through, so it changes nothing. Shipping it would have added complexity to a
money page while fixing nothing. The precise diagnosis is recorded in place at
`app/src/app/bank-builder/page.tsx` above the badge.

**The real fix needs, in order:**
1. Feed the badge the bank-builder **ledger/summary artifact** date, not the slate date.
2. A fixture test that fails when slate date and card date diverge — the condition that produced this.
3. Separate *operational* state from *model outcome* on the page: `Generation Pending`,
   `Generation Failed`, `Completed — No Qualified Card`, `Card Published`. Today all four render the same.
4. Decide whether to schedule `refresh_daily_products.sh`. **This needs founder approval — it can
   spend Odds API credits.** Until then the honest page state is "no current card", not "Live today".

---

## Remaining founder observations — not started

| Observation | Status | Note |
|---|---|---|
| Footer falls back to blue-and-gold | **Open** | One visual system; footer tokens diverge from the crimson system above |
| Market Center too dense; "pts" ambiguous | **Open** | Needs "pp" relabel + worked example (`58.6% − 66.6% = −8.0 pp`), glossary key, progressive disclosure |
| Picks Lab redundant | **Open — decision needed** | Founder preference is consolidation into Market Center/Build, with `/picks` redirected |
| Build: 180 legs, no grades or compatibility | **Open** | Needs a versioned grade rubric + deterministic invalid/duplicate/opposite-side rules. Correlation must be labelled "not validated" — the repo has no validated correlation matrix, and fabricating a coefficient is worse than disclosing ignorance |
| Team logos / player portraits inconsistent | **Open** | Needs one central identity resolver + coverage test |
| Multi-sport expansion (NFL/NBA/EPL) | **Open** | MLB is the only sport with a live model; UFC is archive-only |

---

## 30-day plan

**Now (24–48h)** — P0-4 badge fix + fixture test · operational-state vocabulary on Bank Builder/Moonshot ·
founder decision on scheduling `refresh_daily_products.sh` (credit impact).

**Days 3–7** — Footer/visual-system unification · Market Center "pp" relabel, worked example, glossary key ·
Picks Lab keep/merge/retire decision executed with a redirect.

**Week 2** — Central identity resolver (logos/portraits) + route-by-route coverage test · Market Center
progressive disclosure (beginner default / advanced expansion).

**Weeks 3–4** — Build grade rubric (versioned, tested, explained) · deterministic incompatibility rules
with plain-language reasons · unknown-correlation disclosure · full route-by-route inspection at
390/768/1440 + 200% zoom.

**Later** — Sport-adapter contract, then NFL/NBA/EPL only when schedule, data, model, settlement, and a
daily owner all exist end to end. No public "live" label before that.

---

## Ranking rationale

P0-4 outranks the visual work because a page that says "Live today" over fifteen-day-old cards is a
**truth** defect, and this product's entire claim is that it tells the truth about its own record. A
dated footer is a quality problem; a false freshness label is a credibility problem.
