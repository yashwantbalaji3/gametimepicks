# Program 232 — live operations, protected console, public polish

Session 2026-09-01 23:52 ET → 2026-09-02 00:55 ET (03:52 → 04:55 UTC). Entry `fa808ba40` → close
**`343a75e36`**. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both pre-existing stashes and
founder-owned `vp/` untouched; **no paid call, no gated state change, nothing deployed**.

## Phase 0 — the SHA question, and the one thing that could clear the incident

`252935270` is the tip P231's gate ran green on; `fa808ba40` is its log commit five minutes later,
which production then served **exactly**. Ancestor chain proven, no ambiguity remaining.

**The Vault incident does not clear.** The newest `nfl-event-window` run is 23:02Z on `35f39b56a` —
which **predates the fix** (`f19027941`, 00:26Z) — and the ledger still ends 2026-08-29 with 9
entries. Required: a run on a commit carrying the ungated builder that writes a dated entry. Next
scheduled slot 14:30Z. **No backfill, no manual status edit.**

## Release A — the register went quiet when the pipeline stopped

The charter named a probe I had not run: *an old receipt must not satisfy a new slot*. It found a
hole in the register P231 built to catch exactly this class.

The per-product watchdog alarms for products **inside** a receipt. With no receipt for today it has
nothing to iterate and reports nothing — so hiding today's receipt made the board read `GATED_ONLY`,
**0 actionable**, with the entire day's evaluation missing.

That is the End Zone Vault defect — silence mistaken for health — reproduced one level up, inside the
thing built to surface it. `RECEIPT_DAY_MISSING` is now a **P1**, derived by comparing the newest
receipt to the current product day, which the console injects so the register stays replayable.
Probed both ways: it fires on a stale day and does **not** fire on a current one, because a detector
that always fires is switched off.

## Release B — protected, current, and twenty days old

`verify-admin-access.mjs` passes right now: unauthenticated `/launch` → 302 to SSO with zero content
bytes, deny carries `no-store`, public `/launch` and `/ops` → 404. **It was passing the whole time.**

It is not the whole question. The protected console's newest deployment is **20 days old**. Four
programs of console work — the derived incident register, both founder decision packets, every
evidence panel since P210 — exist in the repository, pass their guards, and have **never reached the
person the console is for**. "Is it protected" and "is it current" are different questions and only
one had an owner.

`verify-console-delivery.mjs` reports three dimensions and refuses to collapse them:

| dimension | state |
| --- | --- |
| APPLICATION_READY | PASS — internal build keeps `/launch`, public build prunes it |
| HOST_CONFIGURED | DELEGATED to the boundary verifier — two opinions about security is worse than one |
| CONTENT_CURRENT | **STALE — 20d** |

Currency is UNKNOWN without an authenticated session and is reported as UNKNOWN, never PASS: "we
could not tell" is precisely what twenty days looked like from outside. It prints **no** deployment
URL, project id or team id.

Two defects in my own verifier, both caught by running it rather than reading it: it looked for the
Vercel link only at the repo root when the ADR keeps it at `app/.vercel`, and it read stdout only —
the CLI prints its table to **stderr** — so it reported UNKNOWN over a listing that was right there.

**The redeploy was not run.** It is an external action against a project with a recorded exposure
incident, so it is packetized in Release F rather than taken unilaterally.

## Release C — two surfaces called yesterday's data "today's"

P231 proved link integrity. That is not the same as a page telling the truth about itself.

**The homepage** headed a section "Today's suggested cards" over four lanes with no date on any of
them. On 2026-09-02: MLB `09-01`, EPL `09-05`, UFC `09-05`, mixed `09-01`. Not one was today's —
inches below a strip reading "0 events today". The lanes are not wrong; UFC and EPL are event-driven
and MLB's had not published yet. The **dates were the truth and the page discarded them**: the loader
already carried `date` on every lane and nothing rendered it. Each lane now reads "Sep 1 · last
published" or "Sep 5 · next card".

**`/simulate` contradicted itself outright.** The header said "0 of 0 events on this slate" and "No
MLB games on this date"; the Simulation Explorer below said "Showing 15 of 15 simulated games" with
full 10,000-run reports — all from `09-01`. `explorerCards()` calls `buildAllGameDetails()` with no
date filter. Browsing the last simulated slate on an empty day is useful, so the fix is to say when:
"Sep 1 slate · 2026-09-01", plus a line above the cards when it is not the reader's date.

**My own guard passed vacuously first.** It searched the whole page for the slate date — and the date
rail lists every selectable date, so "Sep 1" was present and the assertion matched the **date picker**
while the gallery stayed undated. A section-attribution test that reads the whole page is not testing
attribution.

## Release D — verified; no redesign warranted

Two things looked like defects and both were my own measurement artifacts: logos rendering as empty
boxes (a screenshot racing the fetch — ATH 181px, TEX 132px natural, both painted) and a black band
over the scene (a mid-scroll frame; `elementFromPoint` found real content there).

The MLB scene walked SELECTED → running → **SIMULATION COMPLETE → the real report**. Scene matrix:
MLB·SETTLED, EPL·SCHEDULE_ONLY, NFL·SCHEDULE_ONLY, UFC·SIMULATION_READY, NBA off-season, NHL typed
absence, reduced-motion refusal that still narrates — 8 states reality-skipped.

I also **withdrew a claim before making it**: I believed only `/mlb` used the shared `SportShell` and
the hubs had different navigation grammar. No hub renders a tablist — all four are consistent long
scroll, and `/mlb`'s `SportShell` is real but deferred until scroll. The inconsistency did not exist.

## Release E — live operations

32 events conserved across five sports (0 owed, 0 findings); ALL_GOVERNED, 0 gaps; all six products
typed; 50 operational guards green.

## Release F — the safety rule that was never on the screen

NFL now answers `AUTHORIZE:NFL:<market-scope>:<credit-ceiling>:<expiry>`. Three fixed tokens meant
the ceiling and expiry would be **inferred from a receipt rather than stated by the person
authorising the spend**, and an authorisation whose limits someone else filled in is not a limit.

The console redeploy joins as an EXTERNAL action carrying the measured 20-day age.

Then the defect this release is named for: the panel rendered evidence, tokens, dry-run and the
forbidden line — and silently dropped `rules`. The console packet's first rule is **"NEVER re-add a
production domain"**, against a recorded ~4-minute unauthenticated window created exactly that way.
The most safety-critical sentence on the board existed in the object and never reached a screen, and
my guard passed because it checked the **module**. Checking the data is not checking the delivery.

## Register

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| A+B · incident staleness + delivery verifier | `46833153d` → `9b7a7f4d9` | `fa808ba40` | shipped |
| C · date attribution on Home and /simulate | `c4d3c3307` | `9b7a7f4d9` | shipped |
| D–F · scene verdicts, live ops, three-action sheet | `343a75e36` | `c4d3c3307` | shipped |

## Remaining partition

| class | rows | acceptance event |
| --- | --- | --- |
| INCIDENT | End Zone Vault 08-30 → 09-02 | first `nfl-event-window` run on a commit carrying `f19027941` that writes a dated ledger entry — next slot 14:30Z |
| ENGINEERING | none | — |
| REALITY | the Vault's clearing run · NFL 2 events NOT_YET_CAPTURED · NBA off-season | scheduled runs |
| FOUNDER | NFL odds renewal · Moonshot disposition | `AUTHORIZE:NFL:…`/`DEFER` · `MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>` |
| EXTERNAL | protected console redeploy — 20d stale, boundary intact | `CONSOLE_REDEPLOY:RUN` then re-run `verify-admin-access` |

**Classification: MATERIAL_PROGRESS.** No executable engineering row remains, but the Vault incident
is open and reality-gated on a scheduled run, and the law counts an open incident regardless of how
many releases shipped.

## Suites at close

| gate | result |
| --- | --- |
| typecheck | clean |
| phase 1 · unit + contract | 649 files → pass |
| phase 2 · rendered guards | 71 files → pass |
| browser matrix · three engines | 455 passed · 0 failed · 39 skipped |
| accessibility | 321 passed |
| page-weight budgets | 17 routes, all inside |
| public boundary | `/launch` pruned; zero founder tokens in the export |
