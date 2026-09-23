# v1.8 — UX-1: partial audit (2026-09-22)

**Coverage, stated first.** This covers **6 surfaces** — `/`, `/today`, `/results`, `/bank-builder`,
`/moonshot`, `/mr-dub` — plus a structural sweep of **all 2,458 built pages**. The brief lists ~25 surfaces;
Research, Research Lab, Simulations, Build, Markets, Team/Player, Matchup, Compare, Ask, Methodology and the
error/loading states are **not** covered. Findings below were measured against **live Production**
(`285425f07`) at 375×812 and 1024px, not read off the source.

Four findings that turned out to be **non-defects** are recorded in §5, because "we checked and it is
correct" is worth as much here as a finding.

---

## 1. P1 · `/results` shows no result at all on a phone

**Route:** `/results/` · **Evidence:** measured in Production at 375×812 — the first record figure on the
page sits at **y = 1,773 px**, i.e. **2.2 viewport heights** below the fold. The first screen is entirely
filter chrome: three dropdowns, two date inputs, five range buttons and two paragraphs of explanatory prose.
The `ALL SETTLED HISTORY` headline (`21.8% · 24–86 · 110 decisive · 4 pending · 114 cards`) only begins to
appear at the very bottom edge.

**User impact:** a phone visitor who lands on the page the brief describes as needing to be "understandable
within seconds" must scroll past two screens of controls before seeing a single number. The controls are
useful, but they answer a question the visitor has not asked yet.

**Proposed fix:** render the settled-history headline **above** the controls, and collapse the filter block
into a disclosure that is open on desktop and closed on mobile. The figures already exist server-side.

**Risk:** low-moderate. Reordering two blocks is reversible, but the explorer is a client component whose
default filter determines that headline, so the summary must be derived server-side (or the page will flash).
**Dependency:** none. **Not shipped this session** — it is a layout decision on a primary surface and is
worth the founder seeing before it lands.

---

## 2. P1 · Home reads "4 sports active · 16 events on today's board" when all 16 are MLB

**Route:** `/` · **Evidence:** Home's counts strip renders, in one comma-separated run:

> `4 sports active` · `16 events on today's board` · `16 simulation-ready` · `10 top model picks` · `4 active product cards`

`/today` describes the same board as **`MLB · 16 MLB games · 662 model leans`**, and `/bank-builder`'s
eligible-universe panel states it outright: **"96 eligible legs across 1 sport"**, with NFL, UFC, Premier
League and NBA each listed as *not eligible for prediction products*.

**User impact:** *a sport whose model is live* and *a sport playing today* are different facts, and the front
door puts them side by side without distinguishing them. The natural reading of "4 sports active, 16 events"
is that the 16 events span the 4 sports. Today they are all MLB. This is the same class as the
current-vs-legacy framing errors C2 corrected: not a wrong number, a number whose scope is unstated.

**Proposed fix:** name the scope on the board count, derived from the day's actual sports rather than
hardcoded — e.g. "16 MLB events on today's board" on a single-sport day, and the sport list on a mixed day.

**Risk:** **this is why it is not shipped.** Today is a single-sport day, so a fix written today can only be
verified on a single-sport day. A label derived from a one-day window is exactly the shape that has bitten
this repository before (the NFL club registry named from the rolling window). The fix needs a mixed-sport
day — an NFL Sunday — or a fixture that fakes one, before it is trustworthy. **Dependency:** a mixed-sport
fixture.

---

## 3. P1 · 88 of 93 MLB matchup pages share a title and an `<h1>` with another page

**Route:** `/matchups/mlb/<gamePk>/` · **Evidence:** 93 built pages collapse to **38 distinct `<title>`
values**; **88 pages** share theirs with at least one other. Example — four separate games:

```
/matchups/mlb/824545/   "Detroit Tigers at Chicago White Sox matchup history and team stats | GameTimePicks"
/matchups/mlb/824546/   (identical)
/matchups/mlb/824547/   (identical)
/matchups/mlb/824548/   (identical)
```

Each has its own correct `rel=canonical`, so these are not canonical duplicates — they are distinct games
(consecutive `gamePk`s in a series) that are **indistinguishable from their title and their `<h1>`**, both of
which read only `New York Mets at Texas Rangers`.

**User impact:** two open tabs are indistinguishable; a search result cannot say which game it is; and 88
near-identical titles is a weak signal to a crawler on a page family built for search.

**Proposed fix:** put the game's own date in the title and the `<h1>`. **A date alone is not sufficient** —
doubleheaders share one — so the disambiguator must fall back to the game number, which is why this is
worth doing properly rather than quickly. **Risk:** low, but it touches `withRouteMetadata` for a 93-page
family and any guard that pins the current title. **Dependency:** none.

---

## 4. P2 · `/bank-builder` repeats "Live today" and hangs its caption outside the gutter

**Route:** `/bank-builder/` at 375×812 · **Evidence:** two elements in the same right-aligned column carry
the text `Live today` — a chip at x=261 (w=100) and a bare label at x=291 (w=70). Immediately below, the
`Next transition: settles overnight from official box scores…` caption starts at **x = 14**, left of the
16 px gutter every sibling respects, and runs 347 px wide.

**User impact:** minor. The status is stated twice in two styles, and the caption does not line up with the
card it belongs to. **No horizontal page scroll** (`scrollWidth === innerWidth === 375`).

**Proposed fix:** drop the bare label, keep the chip; align the caption to the gutter. **Risk:** very low.
**Dependency:** none. Held only because it belongs with a mobile pass rather than alone.

---

## 5. Checked and CORRECT — recorded so they are not re-raised

| Suspected | Verdict |
|---|---|
| `/results` renders `0.0%` rates — the C9 "zero is not a rate" rule | **Correct.** Every one is a real `0-3`, `0-4`, `0-2` day: zero wins over N **decisive**. The rule forbids a rate over *zero decisive*, and those rows render `no settled cards yet` instead. Verified in Production. |
| `21.8% · 24–86 · 110 decisive` does not reconcile | **Correct.** 24 + 86 = 110, and the per-sport rows (8 + 91 + 11) sum to 110. First read at a 0.55 screenshot scale misread "110" as "20". |
| 15 pages have no `<h1>` | **Correct and deliberate.** All 15 are `ClientRedirect` stubs for retired routes (`/picks`, `/parlays`, `/board`, `/nba`, …), each `robots: { index: false, follow: false }` with its reason documented in source. A server `redirect()` emits an error shell under `output: "export"`, which is why they are client stubs. |
| Pages missing a `<main>` landmark | **None.** 0 of 2,458. |

## 6. Worth copying — `/moonshot` is the model for era separation

`/moonshot`'s "What this product's records actually say" is the pattern the other product surfaces should
follow: four tiles that each name **which** record they read (`2 published today` · `4–33 settled record ·
since 2026-08-15 · settled receipts` · `0 legacy open cards` · `$0.00 legacy stranded stake`), with the June
era in a **collapsed, dated** disclosure — `LEGACY ERA (JUNE 2026, 7 CARDS) 0–7 · 2026-06-23 … 2026-07-06`.
Current and legacy are visibly different things, both shown, neither summed.

The four C3 violations corrected in PR #637 were all on surfaces that had **not** been given this treatment.

## 7. Not covered

Research · Research Lab · Simulations · Build/Simulate · Markets · Team pages · Player/fighter pages ·
Matchup (beyond §3) · Compare · Ask GameTime · Methodology · About/trust · footer · loading states ·
empty states · error/fallback states · NBA public/internal boundary · tablet widths.
