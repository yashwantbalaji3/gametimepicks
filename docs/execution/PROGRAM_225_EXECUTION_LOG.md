# Program 225 — offered-window & product convergence

Session: 2026-09-01, 10:36 → 12:15 ET (14:36 → 16:15 UTC). Entry `2ae2c7f19`, three bot commits
behind; fast-forwarded to `8355e8aac`. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged
throughout; both pre-existing stashes and founder-owned `vp/` untouched; no paid calls.

**Release B's automation proved itself overnight.** nightly-settle ran twice (06:18 and 08:43 ET) and
the event-identity audit executed live, regenerating at 12:43Z with 2,163 rows and the same 8 known
findings.

---

## Release 0A — the gate was checking a build it had not made

quality-gate ran the whole suite and *then* built the export. Sixty-three test files read `out/`, and
each opens with some form of `if (!fs.existsSync(PAGE)) return;` — an early return inside the test
body, not a skip. In CI they neither failed nor reported as skipped: **they reported as passing,
having asserted nothing.** The same 250 tests "pass" with the export present and absent.

Two guards repaired the night before — the /ufc self-consistency pair and the sport-lab built-export
check — had never once been exercised by the gate that is supposed to protect them.

**Proven, not argued.** With a rendered defect injected into /ufc (the page made to claim "the
market's own favourite", which `sport-lab-cards` explicitly forbids there):

| | tests | failures |
|---|---|---|
| old order — whole suite, before any build | 5,417 | **0** |
| new order — phase 2, after the build | 409 | **1**, exit 1 |

The runner refuses phase 2 when `out/` is missing (exit 3) or when the partition selects no files
(exit 4), so it cannot reproduce one level up the vacuous pass it removes. Partitioning is a content
scan rather than a manifest: a hand-maintained list's failure mode is a new rendered guard quietly
landing in phase 1, where it goes back to passing without looking. `npm run gate` runs the identical
sequence, so a stale local `out/` can never look greener than CI.

**Verified in CI on `637914f43`:** phase 1 → build → phase 2, all three success.

### A gap found while proving it

The first defect I injected — turning *"the sample is far too small to support any claim"* into
*"the evidence is compelling and consistent"* — **escaped both orders.** The repo bans the outcome
words (edge, lock, guaranteed, best bet, profitable, beat the market); nothing banned a claim about
how strong the evidence is, which is the same overstatement in an academic coat. Now guarded,
narrowly enough that "a compelling matchup" stays legal, and starting from a true zero across the
built export rather than a grandfathered exception list.

My first draft of that guard was itself broken — written through a non-raw Python heredoc, so every
`\b` landed in the file as a literal backspace byte and the pattern matched nothing. Caught by
mutation probe. Third self-authored guard defect these probes have caught.

## Release 0B — 27.7 KB into a 24.4 KB loader

The memory index is loaded whole at session start; over the limit, only *part* arrives, silently.
165 entries were written and an unknown tail of them was simply not there.

Compacted with an audit trail rather than deletion: 36 program narratives (Programs 058–199) moved
to `MEMORY_ARCHIVE.md`, every topic file left exactly where it was. **21.3 KB, 3.1 KB headroom, 130
current entries**, one pointer to the archive.

`check-memory-size.mjs` enforces the limit, the archive's existence, and that **every archived
pointer resolves** — an archive of dead links would let compaction look like preservation while
losing the history. It reports SKIPPED in words, and never prints OK, when there is no memory
directory (the CI case): a check that cannot see its subject and reports success anyway is the exact
defect this program spent the morning removing.

## Release C — the offered-window control plane

One pure owner; closed vocabulary ordered most-terminal-first so an event lands in exactly one state.
The two failure states (`JOIN_FAILED`, `SOURCE_STALE`) outrank every stage, because a row we cannot
join or whose source has rotted must never read as healthy just because a later stage also matched.
Conservation is the acceptance test.

**Four defects in my own runner**, all caught by reading the output instead of accepting it:

- **EPL** read a guessed path that does not exist, fell back to the wrong artifact, mapped an
  identity field that is not the identity, found zero rows and reported the sport as `NO_EVENTS` — a
  sport erased from the matrix by a wrong path, which is exactly the omission this release detects.
- **UFC** applied the odds-capture age bound only to bouts the capture had priced, of which there
  were none — so a capture generated 08-29, naming only bouts that started 08-29, describing a card
  already fought, was invisible behind an ordinary-looking unpriced window.
- **UFC** read a card-level `model` block as per-bout publication, so all fourteen bouts reported
  `PUBLISHED` and masked the informative state.
- **MLB** reported yesterday's twelve started games without saying which day it described — "today is
  over" rather than "today is not built yet". Each sport window now carries its own `windowDate`.

Current matrix: MLB 12 `STARTED` (window 08-31) · NFL 1 `NOT_OFFERED` · UFC 11 `FORECAST_READY` + 3
`NOT_OFFERED`, 11 owed · EPL 1 `REFUSED` · NBA `NO_EVENTS`. Overall **WORK_OWED**.

### Correction — the "public" summary is not served

The commit message says the counts-only artifact is exposed publicly. It is not. The export prunes
`out/data` **deny-by-default**, keeping only files a built page actually references plus
`build-info.json`; nothing references `ops/offered-window.json`, so it is swept. The artifact is
correctly counts-only and would be safe to serve — but it is staged, not published, and the
protected console (Release K) is its intended consumer. Recorded here rather than left overstated.

---

## Resume anchor

Pushed and gated green this session: `a0a14954e` (CI phases), `637914f43` (memory), `73b245641`
(offered window). Production covered by the tip.

Next, dependency-ordered:

1. **Release E** — four-sport production reconciliation, consuming the Release C matrix. The 11 owed
   UFC rows and the NFL `NOT_OFFERED` row are its first real inputs.
2. **Release F** — product lifecycles. Moonshot's `MOONSHOT_REPAIR_PAUSE_OR_RETIRE` remains
   founder-gated; its engineering packet is the deliverable, not its reactivation.
3. **Release K/H** — give the offered-window summary a consumer so it stops being staged-but-unserved.
4. **Release G** — Top Picks and risk tiers, which may only select from published, pre-start,
   settlement-capable identities the matrix names.
