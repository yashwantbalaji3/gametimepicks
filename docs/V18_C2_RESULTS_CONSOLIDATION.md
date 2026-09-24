# v1.8 — C2: the canonical Results projection becomes the one the product reads (receipt)

**Date:** 2026-09-22 · **Branch:** `v18-c2-results-consolidation` · **Base:** `128295d2e`

C2 turns the C1 read model on: the builder now runs on a schedule and the surfaces that print the current
record read it through one reader. Doing that surfaced a defect in the C3 policy's enforcement and four
rendered violations of the C3 decision on surfaces C3 did not audit.

## 1. 🔴 The C3 policy did not hold over the artifact a page loads

C3 stamps `cell.presentation` at construction and says `presentationOf(era)` is "the single place the rule
lives". Three of its four predicates then read **the stamped field** instead. Those are not the same thing:
the constructor is not what a page loads. A page loads `results/projection/latest.json`, and that artifact
was built in C1, **before C3 existed** — not one of its 53 cells carries `presentation`.

Measured against the committed file, unmodified:

| | before | after |
|---|---|---|
| `recordLabelOrNull(juneLadder)` in the default CURRENT frame | **`"5–0"`** | `null` |
| `mayShowIn(juneLadder, "CURRENT")` | **`true`** | `false` |
| `legacyCells(projection)` — the panel that is their only permitted home | **`0` cells** | `6` cells |
| `recordLabelOrNull(juneLadder, {context: LEGACY_HISTORY})` | `"5–0"` | `"5–0"` (unchanged) |
| `recordLabelOrNull(compositeRecord)` | `"36–35"` | `"36–35"` (unchanged) |

The policy failed **open** on the front-door side and **shut** on the legacy-panel side, simultaneously.
C3's suite could not see it: every cell it tests comes from `makeCell`, which stamps the field.

`sumSameEra` was the one predicate that held — because it derives from `era`. That is the fix, applied
everywhere: **the era is the fact, `presentation` is a copy of it, and a copy never outranks its source.**
`cellPresentation(cell)` derives the frame, and **refuses** a cell whose stamp contradicts its era, so a
hand-edited artifact cannot widen its own frame. A cell with no typed era establishes no frame and fails
closed to "no figure".

This was latent — no consumer read the projection yet. C2 is the change that would have published it.

## 2. Four rendered C3 violations, found by reading the built pages

C3 §3 fixed two (the front door, the `/mr-dub` banner). It did not audit `/results` or `/bank-builder`.
Each of these was live in Production at `128295d2e`.

| # | Surface | What it rendered |
|---|---|---|
| 1 | `/results` products grid | **"Road to $10K completed 5–0"** as Bank Builder's description, beside "2 paper cards published today" — a June ladder inside a **current** products summary, undated, unlabelled. The Moonshot tile next to it already carried the founder decision's treatment; Bank Builder was missed. → now **"Settled record 36–35"**, through the canonical reader. |
| 2 | `/results` "Bank Builder — settled cards" | `completedCards[0]` — **"Road to $10K · 5–0 · $100.00 → $20,465.40 · official"**, undated, directly above the current awaiting-lane note. That owner row is itself conflated: **ladder 1's `5–0` beside BOTH ladders' combined final**, and it carries no date, so it cannot be shown honestly in any frame. → the dated per-ladder source renders instead, inside a labelled legacy panel. The owner is **not** rewritten. |
| 3 | `/bank-builder` climb hero | "Completed ladders · Verified · official results · $100 → $10,376.17 **5–0** · $100 → $10,089.23 **5–0**" — the right label, but **no dates and no era**, inside the live hero under today's rung. → dated (`Jun 9 – Jun 13, 2026`), labelled `legacy history`, era sentence added; an **undated** ladder is now dropped rather than shown undated. |
| 4 | `/mr-dub` ladder section | eyebrow **"The record, as settled"** over two June ladders, summed in prose as **"ten winning legs"** — that is 5–0 + 5–0 = 10–0, the exact arithmetic C3 taught `sumSameEra` to throw on. A refusal in the model does nothing about a total typed into a string. The closing sentence also pulled today's lane into the same paragraph. → legacy eyebrow, exact span, era context, no sum, no juxtaposition. The existing hedge was already right and is kept. |

## 3. Consumers repointed

Three surfaces each opened `mr-dub/portfolio.json`, reached into `.record`, and formatted the figure
inline — three copies of one rule, and the front door had already drifted once (C3 §3.1). They now ask
`currentProductRecord("bank-builder")`, which passes **no** presentation context, so the strict CURRENT
default applies and a legacy era is unreachable from them by construction.

Rendered output is **byte-identical** where it should be, verified in the built export:

| Surface | before | after |
|---|---|---|
| `/` | `Record 36–35` · `0 pending · 71 settled` | same |
| `/today` | `36–35` · `0 pending · 71 settled` | same |
| `/bank-builder` | `Record 36–35` | same |

A fourth reader, `results-trust-center.ts`, now supplies `/results` with the same figure.

## 4. Lifecycle — the builder runs, and cannot go green while failing

One step in `nightly-settle.yml`, after every owner is rebuilt and before the health gate.

- **Not `continue-on-error`, no `|| echo`.** Either turns an explicit `exit 1` green; this repository has
  shipped both (a paid UFC capture that bought prices then threw, a settle step whose `|| true` ran nothing).
- **Exit codes are named**: `1` = the write-once refusal, surfaced as `::error title=Results projection
  refused a restatement` with the operator action spelled out, never a generic red settler; `2` = bad
  arguments; `3` = an owner refused. All propagate via `exit "$rc"`.
- **`derive-cycle-table.mjs` now runs too, first, under `set -e`.** It was in **no workflow at all**, so
  the cycle table froze the day it was written while the projection went on citing it as an owner. A read
  model of a stale owner is not a read model.
- No new commit-allowlist line: `git add app/public/data/results/` already exists, and the guard pins it.

`projection-wiring.test.mjs` (C1's biconditional) is deleted per C1 §9.4 and replaced by
`projection-lifecycle.test.mjs`, which pins the direction that can still bite. **Its reader detector also
had a blind spot**: it required a specifier ending in `results/projection`, so a sibling importing
`"./projection"` — exactly what `current-record.ts` does — was invisible to the test meant to notice
readers. Both spellings are matched now, with controls for each.

## 5. Probes

**16 of 16 catch**, each applied and reverted, with **3 negative controls** (a behaviour-free comment on the
core, the workflow and the front door) correctly reporting *not* caught.

| Probe | |
|---|---|
| `recordLabelOrNull` trusts the stamp again (the original fail-open) | caught (2) |
| `mayShowIn` trusts the stamp again | caught (2) |
| `legacyCells` filters on the stamp again (the panel empties) | caught (1) |
| the contradiction refusal is removed (a forged stamp is believed) | caught (1) |
| an untyped era resolves to CURRENT instead of failing closed | caught (1) |
| the build step becomes `continue-on-error` | caught (1) |
| the builder invocation gains `\|\| echo` | caught (1) |
| the build step is removed entirely | caught (5) |
| the cycle-table rebuild is dropped | caught (1) |
| `nightly-settle` stops staging `app/public/data/results/` | caught (1) |
| the builder's exit code stops propagating | caught (1) |
| the front door opens the record owner inline again | caught (4) |
| the front door names the `LEGACY_HISTORY` frame | caught (2) |
| `/bank-builder` formats its own record beside the canonical one | caught (1) |
| the shared reader passes a `LEGACY_HISTORY` context | caught (1) |
| *(the cycle-table probe on its first run)* | **escaped** — see below |

**Two probe findings worth recording, because both are guard-quality failures the probes caught and a
reading would not have.**

1. The cycle-table guard matched the word `derive-cycle-table` **in the step's own header comment**, so
   deleting the invocation left it green. A guard that reads prose as code fires on its own footnotes.
   Assertions about what *runs* now read a comment-stripped view of the step.
2. The step extractor's first two drafts sliced the **neighbouring** step — first via a lookahead, then
   because a step's leading comment block was attributed to the step above it. Both made
   "cannot be green while it fails" read an unrelated step's `continue-on-error`. A scoping control now
   pins that the slice is exactly one step and is the builder's own.

## 6. Guards restated, not weakened

Four guards pinned the old spelling rather than the property. Each is restated to the property **and made
stricter** — every one now also asserts the page does *not* do the thing it used to.

| Guard | pinned the proxy | now pins |
|---|---|---|
| `home-restructure` "canonical artifacts" | `portfolio.json` / `p.record.wins` | reads through `currentProductRecord`, **and** opens no owner |
| `v17-play-surface-copy` `/bank-builder` record | the owner path literal | the canonical reader, **and** no hand-rolled record format |
| `c3-legacy-presentation` front door | `let recordLabel … = null` | the canonical reader, **and** names no legacy frame or completed-ladder source |
| `v17-play-surface-copy` Mr. Dub headline | `eyebrow="The record, as settled"` | the corrected legacy eyebrow (that eyebrow *was* violation #4) |

## 6b. The C9 rule, pinned where it is actually read

The projection refuses a zero record in the model. **The other read model does not**: `read-model.mjs`'s
`row()` coerces every absent count with `wins ?? 0`, and **12 of its 31 rows today carry `wins: 0,
losses: 0`** — all four NFL tiers, two EPL tiers, all four `multi` tiers, and the NFL and `multi` stream
totals. Nothing renders them as `0–0`, and that is the point: the only thing between those rows and a
rendered zero record is one early return inside the explorer's `Rate` component. `/results` already has two
other call sites that print `{wins}-{losses}`.

`c9-never-zero-zero.test.mjs` pins it over the built export. Three things about it were decided by probing,
not by reading:

- **It is scoped, because site-wide it is noise.** A blanket `0–0` scan over `out/` matches **64 pages** —
  every one an EPL exact-score probability table, where `0–0` is a scoreline and correct. A negative control
  asserts the guard stays silent on those, and that at least one really carries one (so the control is not
  vacuous).
- **It matches the ASCII hyphen too.** The canonical formatter uses an en dash, but `/results`' "Official
  record" tile writes `${wins}-${losses}` — a detector that knew only the en dash would miss the call site
  most likely to regress. Measured first: ASCII `0-0` occurs **zero** times across all six surfaces, so it
  costs no noise.
- **Its real positive control is a rebuild.** Making `currentProductRecord` return `"0–0"` and rebuilding
  fails the guard with both front-door contexts named.

**And it says what it cannot see.** Removing the `Rate` early return and rebuilding changed *nothing* in the
static HTML: the explorer is a client component, and those twelve rows only reach the DOM after a viewer
picks NFL or `multi` in its filter. So the guard covers the **server-rendered** record surfaces — where C2
repointed the readers, and therefore where a regression would land — and the explorer's filtered rows need
a driven browser test, named as a follow-up rather than silently implied.

## 6c. Two unrelated defects found while verifying, filed not fixed

Both are pre-existing on `origin/main` and neither is caused by C2.

1. **Two EPL paper cards never graded.** `epl-medium-2026-09-19` / `epl-high-2026-09-19` are `pending` with
   **every leg `result: null`**; the receipt has not been rewritten since 2026-09-20. The nightly
   `complete-pending-days.mjs --window-days 30 --apply` sweep exists so this cannot happen and has not
   closed them in three nights. (§7)
2. **A post-build guard that fires on its own build clock.** `finals-history-isolation.test.mjs` searches
   raw HTML for a gamePk with `includes(String(pk))` — no digit boundaries. It failed with "historical
   gamePk 718780 leaked into the export"; the page's single occurrence is inside `1790123718780`, the
   build's own `serverNowMs` (2026-09-23T00:35:18.780Z). It passes or fails on the millisecond the build
   starts. Its existing "positive control" only checks that the research-page allowance is exercised — it
   never checks that the detector catches a real leak.

## 7. Verification

`lint:scripts` clean · `tsc --noEmit` clean · unit **7,087 pass / 1 fail** · post-build rendered guards
**606 pass / 0 fail** · `npm run build` ok (127–139s).

The one failure is **pre-existing on `origin/main` and unrelated to C2**:
`explorer-scope.test.mjs` — "no lab receipt in the last 30 days carries a pending card older than 3 days".
`epl-medium-2026-09-19` and `epl-high-2026-09-19` have `result: "pending"` with every leg `result: null`;
the receipt has not been rewritten since 2026-09-20. That file, that test and the nightly sweep are
untouched by this branch (the test imports only node builtins and reads committed data), and it reads the
wall clock, so it crossed its 3-day threshold today. **The nightly `complete-pending-days.mjs --window-days
30 --apply` sweep exists so this cannot happen, and it has not completed these cards in three nights.**
Filed separately; not fixed here.

## 8. What C2 did NOT do

No owner rewritten, no settlement changed, no era blended, no history deleted, no selector or threshold
touched, no registry or model status changed, no provider, no secret, no Production env change. The June
ladders keep their real `5–0`, their exact dates and their owner — what changed is only **where** they may
appear, which is the C3 decision being enforced rather than described.

**Files in non-test `src/` that FS-read `mr-dub/portfolio.json`: 12 → 9.** The three that stopped are
exactly the three that printed the current record (`/`, `/today`, `/bank-builder`); a fourth current-record
surface, `/results`, now takes the figure from the projection too, though its page still reads the owner for
`read-model.mjs` (§9). The remaining nine are named in §9 with the reason each is a legitimate non-Results
use. The "61 direct readers" figure carried into this session counted every file mentioning the string
anywhere, tests and comments included; measured as files that actually open it, outside tests, it was 12.

## 9. Retained readers, and why

`portfolio.json` is the money and lifecycle owner as well as the record owner, and most of its readers want
the former. These are **not** Results consumers and do not belong on the projection:

| Reader | Wants | Verdict |
|---|---|---|
| `lib/daily-portfolio/accounting.ts` | bankroll, exposure, crown | money state — retain |
| `lib/mr-dub/master-ledger.ts`, `product-allocation.ts`, `open-exposure.ts` | ledger + allocation | money state — retain |
| `lib/mr-dub/protected-invariant.mjs` | the protected-record invariant itself | a **producer-side** check over the owner — retain |
| `lib/products/product-state-view.mjs`, `lifecycle-registry.mjs`, `ladder-settlement.mjs` | product lifecycle/state | not a record — retain |
| `lib/money-integrity.ts`, `lib/audits/product-truth.mjs` | cross-owner reconciliation | must read owners directly — retain |
| `lib/results/read-model.mjs` | the `/results` explorer's row model (P233) | a **second** read model over the same owners — the next C2 subgroup, not folded in here |
| `app/results/page.tsx` (`resultSources`) | feeds `read-model.mjs` | follows `read-model.mjs` |

## 10. Next

1. `read-model.mjs` + `/results` `resultSources` — the remaining duplicate read model. Deliberately left
   out: it is a row/filter/interval explorer, not a record lookup, and folding it in here would have made
   one PR out of two concepts.
2. `moonshot-state.mjs` already implements its own correct legacy/current split; reconcile it with
   `legacyCells` rather than repointing it blind.
3. The two filed defects in §6c.
4. A driven browser test for the explorer's client-filtered rows (§6b) — the one part of the C9 rule no
   static guard can reach.
