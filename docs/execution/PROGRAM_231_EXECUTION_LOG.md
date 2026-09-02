# Program 231 — operator experience, public IA, simulation UX, convergence

Session 2026-09-01 21:32 ET → 2026-09-01 22:40 ET (2026-09-02 01:32 → 02:40 UTC). Entry
`8f30cc653` → close **`252935270`**. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
pre-existing stashes and founder-owned `vp/` untouched; **no paid calls, no gated action taken**.

## Phase 0 — the close-SHA discrepancy, resolved

The charter flagged that P230's prose named `c51dcae2a` while its log named close `5d0cdeaea` and
production `b11633bb0`. All three are true of different things, and the chain proves it:

| SHA | what it is |
| --- | --- |
| `5d0cdeaea` | the log commit; the tip the gate ran green on (run 33576857188) and production was verified against |
| `b11633bb0` | a routine bot commit (`epl settle`) production was serving at that moment |
| `c51dcae2a` | the **final** register/classification commit, pushed after verification — docs only |

`5d0cdeaea` → `b11633bb0` → `c51dcae2a` → `8f30cc653`, each an ancestor of the next. The log's body
was written before its own commit existed, which is how a document comes to name a tip that is not
the last one. **`c51dcae2a` was itself never gate-verified or production-verified**; it is now
ancestry-covered by production `8f30cc653`, which serves origin/main exactly.

## Release A — operational proof, and the Vault stays open

54 P230 guards re-run green: lifecycle registry, producer assertions, ledger reconciliation, the
three product-lifecycle suites, tier-grid freshness, leg reachability, and the calibration
contradiction engine. Coverage **ALL_GOVERNED, 0 open gaps**. Offered window conserved across all
five sports, 0 owed, 0 findings.

**The End Zone Vault incident does not clear.** The last `nfl-event-window` run was 23:02Z on
`35f39b56a` — *before* the fix landed at 00:26Z — and the ledger still ends 2026-08-29 with 9
entries. Its acceptance event is a run on a commit carrying the fix producing a real entry; the next
scheduled slot is 14:30Z. Backfilling it would be fabrication.

## Release B — K1: thirty-two panels and no incidents panel

Open failures were legible only to whoever went looking in the right artifact. P230 found the Vault
missing three days of receipts behind nine green runs and nothing on the operator's screen would have
shown it.

Every row is **derived** from an authority already deciding the same thing — the product watchdog,
lifecycle coverage, offered-window findings. A row appears because a watchdog is reporting it now and
disappears when that watchdog stops; there is no field anyone can edit to make one go away, and a
guard proves the kind table holds no product name and no date (those would be rows typed into source
where nothing can ever clear them). Cause, owner, detection, mitigation and clearing event attach per
**failure class**, so the prose belongs to the class rather than the row. An unrecognised alarm
surfaces `UNCLASSIFIED` rather than being dropped.

**A founder gate is visible but not actionable.** Moonshot genuinely publishes without a settlement
path — real, and unfixable without the token. Ranking it beside a repairable failure puts a thing
nobody may touch at the top of the queue every day; hiding it would be worse. Live: **1 actionable**
(the Vault, with its exact clearing receipt), **1 gated**.

### The leak the boundary scan found

`/moonshot` was printing the founder answer token to every visitor — *"Open decision:
MOONSHOT_REPAIR_PAUSE_OR_RETIRE — publishing needs…"* — because the module returned the token and the
reason as one string.

**The fix was not to hide the pause.** The paused state and its full reason stay public word for
word; concealing readiness would be the worse failure. Only the token moved. The guard scans the
**built export** (it reached visitors through a data string, not a literal anyone would have grepped),
enumerates tokens from the registry so it cannot go stale behind a new gated product, refuses to run
against an empty token list or an empty export, and separately asserts the pause is still disclosed —
otherwise deleting the disclosure would satisfy it.

## Release C — I: six links pointed at redirect stubs, and the hop ate the intent

Audited the built export: **316 pages, 28,010 internal links, zero dead hrefs, zero empty anchors**,
six links into retired routes.

The extra page load is the smaller cost. `ClientRedirect` calls `window.location.replace(to)` with a
**fixed** target:

| link | arrives at | discarded |
| --- | --- | --- |
| `/picks?sport=mlb` | `/build#suggested-cards` | the sport |
| `/parlays?sport=mixed` | `/build#suggested-cards` | the sport |
| `/world-cup?tab=results` | `/results/` | the tab |

`/build/custom` reads `?sport=` client-side, so repointing does not merely save a hop — it restores
intent the redirect was silently dropping. Worst of the six: a card **on `/results`** labelled "Soccer
Specials" pointed at `/world-cup/`, whose redirect target is `/results/` — it bounced the reader
through a stub back to the page they were already on.

### Why the existing guard could not see them

`redirect-stub-links.test.mjs` has caught this class since Sprint 036 and has two structural limits.
Its `STUBS` map is hand-maintained, and three entries named `/picks` as the real destination — but
`/picks` has since become a stub itself, so the map that exists to stop chained hops was recording one
as the correct answer. And it scans **source literals**: two of the six were computed from the sport
key (`/${detail.sport === "world_cup" ? "world-cup" : detail.sport}`), so no literal existed to match.

The new guard derives the stub set from the built export, cannot go stale, and does not care how an
href was constructed.

## Release D/E — J: the simulation and sport routes had no ceiling

Verified before building. Most of J was already delivered: four distinct code-native SVG scenes
registered per sport, aria-hidden by contract, motion behind the global reduced-motion guard,
hidden-tab pause in `simulation-stage` — each already guarded, scene matrix green on three engines.

What J lacked was its last acceptance line. **Seven routes were budgeted**; the simulation hub, every
sport hub and every signature-product page were not — including the two heaviest, `/simulate` (522 KB)
and `/ufc` (514 KB), which carry the scene code. A page with no budget cannot regress, because nothing
is measuring it: the guard's coverage was the list, not the site.

Ten budgets added at ~2× measured, the ratio the existing entries use. Probed by setting `/simulate`
to 400 KB — it fails with the measured 522.

## Release F — the two founder gates, answerable

"Founder-gated" is a label. The packets are the questions with evidence attached.

**NFL odds:** 69 of 3,000 credits used across 107 requests (23 paid), against a provider-verified
opening balance of 4,342 used / 15,658 remaining — all derived from the ledger the calls wrote. That
surfaces the fact which changes the ask: P171 expired at **program close**, not at its ceiling, so
2,931 credits were never spent. Renewing permission and granting more money are different questions.

**Moonshot:** record, contradictions, last publication and open unsettleable count read through the
same module the public page renders, so founder and visitor answer about one set of numbers. Three
branches, each with a stated consequence, every one preserving the ledger byte-for-byte.

The spend figure is guarded twice — it must match the ledger *and* must not appear as a literal.
"Prepare, do not execute" is a property of the code: a guard asserts no fetch, no URL, no write, no
spawn.

## Register

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| A · operational proof | (verification only) | — | closed |
| B · K1 incidents + token boundary | `4e34ba8c3` | `8f30cc653` | shipped |
| C · I link destinations | `8e62b986e` | `4e34ba8c3` | shipped |
| D/E · J budgets + assurance | `ed91a90a7` | `8e62b986e` | shipped |
| F · founder gate packets | `252935270` | `ed91a90a7` | shipped |

## Remaining partition

| class | rows |
| --- | --- |
| INCIDENT | End Zone Vault 08-30 → 09-01 — cause fixed in P230; clears on the first `nfl-event-window` run carrying the fix (next slot 14:30Z) |
| ENGINEERING | none |
| REALITY | the Vault's clearing run · NFL 2 events NOT_YET_CAPTURED · NBA off-season |
| FOUNDER | NFL paid-odds renewal · Moonshot disposition — both now packetised and answerable |
| EXTERNAL | protected-console host configuration (application contract complete; deployment is founder/external) |

**Classification: MATERIAL_PROGRESS.** K1, I and J are closed and no executable engineering row
remains — but the Vault incident is still open, and the law counts an open incident regardless of how
many releases shipped. It is reality-gated on a scheduled run, not on work.

## Suites at close

| gate | result |
| --- | --- |
| typecheck | clean |
| phase 1 · unit + contract | 649 files → pass |
| phase 2 · rendered guards | 68 files → pass |
| browser matrix · Chromium / WebKit / Firefox | 458 passed · 0 failed · 36 skipped |
| accessibility gate | 321 passed across three engines |
| page-weight budgets | 17 routes, all inside |
| public boundary | `/launch` absent; zero founder tokens in the export |
