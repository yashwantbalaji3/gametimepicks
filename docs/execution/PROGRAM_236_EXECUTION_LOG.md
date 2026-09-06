# Program 236 · Daily products and four-sport completion

Start `f7ece5e5d` · baseline ET 2026-09-05 20:52 / UTC 2026-09-06T00:52Z.
Protected money verified at baseline: portfolio `affe6b21071f2b3be96bb2774eb347c3`,
bank-builder-locks `cb80473f88f3cb5f67208fa568925295` — both match the charter's expected values.
Stashes: 2, preserved. `vp/` untracked, preserved.

## Phase A — the products' actual lifecycle

### Live callers (traced, not guessed from filenames)

| Stage | Caller | Cadence | Entry point |
|---|---|---|---|
| Generation | `.github/workflows/daily-products.yml` | cron `30 15 * * *` | `activate-daily-portfolio.mjs --apply` |
| Settlement | `.github/workflows/nightly-settle.yml` | cron `30 5`, `30 7` | `scripts/automation_settle.sh` (Python) |

Both are green on every recent run. Both have been green while producing nothing.

### THE DEFECT: both products draw from a retired competition

`buildPersistedDailyPortfolio` composes the candidate pool as:

    pool   = loadWorldCupModelPicks(...)                    // Moonshot's ONLY source
    wcTeam = loadWorldCupTeamLegs(...)                      // Bank Builder's PREFERRED source
    bbPool = [...wcTeam, ...wcFill, ...loadMlbModelPicks(...)].filter(p => p.player == null)

Measured against today's real artifacts (2026-09-05):

    wcModelPicks (Moonshot's only pool) : 0      ← World Cup is retired
    wcTeamLegs   (BB preferred pool)    : 0      ← World Cup is retired
    mlbModelPicks                       : 55     ← team legs 0, player props 55
    mlb markets: pitcher_strikeouts, batter_hits, batter_hits_runs_rbis, batter_total_bases

So **Moonshot is structurally incapable of producing a card**: its entire pool is a competition that
was archived. And **Bank Builder** is team-markets-only by hard rule, while its only live feed (MLB)
publishes exclusively player props — 55 candidates filtered to 0 every day.

This is not a thin slate. It is an unreachable one. The published reason —
"fewer than 2 model-qualified legs — awaiting a full card" — is literally true and materially
misleading: it describes a slate that came up short, when no slate can ever qualify.

The charter's own words for this distinction: *an unavailable feed and a legitimate no-card slate
must have different status and incident behavior.* Today they are the same string.

### Why it went unnoticed

Every layer reported success. The workflow exits 0 because generation genuinely ran. The artifact
validates because its date and bankroll are correct. The page shows an honest-sounding reason. The
only thing wrong is that the answer had been decided before the slate was ever read — and nothing in
the stack asks whether a pool with zero reachable candidates is a pool at all.

Bank Builder's market vocabulary is the tell. `BB_MARKET_LABEL` maps `moneyline_90`, `double_chance`,
`draw_no_bet`, `match_total_goals`, `btts` — soccer team markets, every one. The product was built
around a soccer feed. The World Cup ended; EPL replaced it as the live authorized soccer sport; the
pool was never rewired.

### The settlement half: a settler that runs nightly and can reach nothing

`settle-mlb-player-props.mjs` IS scheduled (nightly-settle.yml, "MLB player-prop settlement"). It
grades player props from the official StatsAPI box score joined by gamePk — exactly the right engine.
Its scope is the problem:

    for (const lane of dp.lanes ?? []) {
      if (lane.status !== "active") continue;      // ← nothing is ever active
      ...

It reads only `mr-dub/daily-portfolio.json`. It never opens the two artifacts that actually hold
pending cards. Confirmed by grep: neither `dual-bank-builder-active.json` nor `moonshot-lane/` appears
anywhere in the file.

### Two card stores per product, and only the empty one is wired

| Product | Store that HOLDS cards | Store the settler READS |
|---|---|---|
| Bank Builder | `methodology/launch/dual-bank-builder-active.json` — laneA step 1, laneB step 2, **both pending since 2026-08-17** | `mr-dub/daily-portfolio.json` — lanes `awaiting`, 0 legs |
| Moonshot | `moonshot-lane/active.json` — step 1 **active since 2026-08-17** | same empty daily file |

The stranded cards are MLB player props with real game identity —
`MLB:824320:batter_hits:Kyle_Tucker:under`, `moonshot:mlb:824725:batter_total_bases:Gabriel_Moreno` —
carrying gamePk, player, market, side and line, and declaring `settlement.source: "mlb_stats_api"`.
They are fully gradeable. Nothing has ever tried.

The two Python settlers cannot help: `settle_active_dual_bank_builder.py` is legacy (only its own test
imports it), and `settle_stepped_bank_builder.py` — the current-shape engine — grades **soccer**
markets from API-Football. The cards are baseball. The generation side moved to MLB; the settlement
side never did.

### The complete causal chain

1. The candidate pool reads a retired competition → generation yields 0 legs
2. No lane ever reaches `active` → the nightly settler's filter skips every lane
3. The real pending cards live in two artifacts no settler opens
4. Every stage exits 0, so nineteen days of non-operation reported as health

Nothing here is a crash. Each layer is individually defensible and the composition produces a product
that cannot run. That is why it survived this long.

### Transition contract (to be encoded)

| From | Event | To | Write |
|---|---|---|---|
| `awaiting` | pool yields a qualifying card, all legs pre-event | `active` | one frozen card, idempotency key `{product}:{lane}:{cycle}:{step}:{slateDate}` |
| `active` | every leg won | `won` → next step, same cycle | advance once; stake rolls |
| `active` | any leg lost | `lost` → cycle closes, next cycle initialised once | realize −seed; step resets to 1 |
| `active` | any leg unresolved | `active` | hold; never a fabricated loss |
| `active` | all legs push/void | **neutral, non-advancing** | documented paper state; never a false win, never permanent pending |

## Phase B — the transition contract, and settling the stranded cards

Three modules, each pure where it can be:

- `src/lib/products/lifecycle.mjs` — the transition machine. No fs, no clock, no network. 13 tests.
- `src/lib/products/mlb-prop-grading.mjs` — one owner for "what does this market settle on". The
  arithmetic previously lived only inside `settle-mlb-player-props.mjs`; a second settler would have
  meant two definitions of a total base. 10 tests.
- `src/lib/products/ladder-settlement.mjs` — reads both card stores, grades, applies transitions.
  Root and box-score source are injected, so the replay suite runs against a temp fixture with no
  network at all. 14 tests.

All 37 mutation-probed: eleven deliberate breaks (all-push → win, loss stops deciding early, empty
card counts as a win, decided cards re-gradeable, double advance, identity drops the cycle,
idempotency index ignored, writes redirected into the source store, withheld write unnamed, dry run
writes anyway, unsettleable market graded blind) each produced failures. No guard passes vacuously.

### The write that was refused

`build-mr-dub-ledger.mjs` reads both card stores and writes `mr-dub/portfolio.json` — the protected
paper bankroll. Grading the 2026-08-17 cards in place would therefore restate a financial record that
predates this program, as a side effect of the next ledger rebuild. The instruction is explicit that
protected history stays byte-identical.

So settlement writes a PROSPECTIVE store, `public/data/products/lifecycle/`, referencing each
historical card by identity and mutating neither source artifact. The refused write is named in the
receipt itself (`withheldWrite`) rather than quietly skipped, and a test asserts it stays named.

Idempotency had to move with it. Because the settler no longer marks the cards it grades, it cannot
use them to remember its own work — the first version re-settled the same card on every run. The
ledger carries a cumulative `settledIndex` instead: a card in it is finished, and no later run
re-grades it, including one whose feed now disagrees.

### The nineteen-day cards, settled

    bank-builder:a:c3:s1:2026-08-17   Kyle Tucker under 1.5 hits → 0 WON
                                      Gabriel Moreno over 0.5 hits → 1 WON        card WON → step 2
    bank-builder:b:c3:s2:2026-08-17   Shane McClanahan under 4.5 K → 3 WON
                                      Luis Campusano over 1.5 H+R+RBI → 0 LOST    card LOST → run 4
    moonshot:a:c1:s1:2026-08-17       Gabriel Moreno over 1.5 TB → 1 LOST
                                      Shane McClanahan under 4.5 K → 3 WON
                                      Luis Campusano over 1.5 H+R+RBI → 0 LOST    card LOST → run 2

Kyle Tucker's line was verified independently against the box score before applying: 0 hits in 5 AB,
game Final, official date 2026-08-17. One advance and two restarts — the first real progression
either product has recorded.

Verified after applying: portfolio `affe6b21071f2b3be96bb2774eb347c3` and bank-builder-locks
`cb80473f88f3cb5f67208fa568925295` byte-identical; both card stores byte-identical; a rerun settles
0 and holds 3.

Both product pages now render the settled record — every leg, the official number it was graded
against, and the resulting ladder position — or say plainly that nothing has been graded yet.

Gate: SUCCESS 196s · 5359 unit · 447 rendered.

## Phase C — a pool that exists

`src/lib/daily-portfolio/mlb-team-legs.ts` reads `public/data/mlb/team-markets/<date>.json` — the
live artifact the MLB board job already writes daily — and emits the same `ModelPick` contract the
retired World Cup loader did. Measured on 2026-09-05: **45 legs across 15 games**, three markets each,
where the pool had been 0.

Only the three markets `build-mlb-product-settlement.mjs` grades from the committed linescore cache
are emitted. Settleability is a precondition, not a later concern; this program exists because three
ungraded cards sat pending for nineteen days.

`modelProbability` is the bookmaker's DE-VIGGED number, exactly as the World Cup loader used it, and
`edge` is 0 on every leg. This repository's own calibration work demoted every modelled MLB market to
market-context, so quoting the market's own probability is the honest input.

### What the products do now

At the scheduled generation hour (15:30 UTC, before first pitch):

    Bank Builder  A   2/2 legs   +102    $100 → $202.45   eligible
    Bank Builder  B   2/2 legs   +201    $100 → $300.81   eligible
    Moonshot      A   6/6 legs  +3463    $25  → $890.63   eligible
    Moonshot      B   8/8 legs +12099    $25  → $3049.72  eligible

Run at any other hour the pre-event filter legitimately empties the pool — at 01:16 UTC only 3 of 45
legs remain, because the slate has been played. `activate-daily-portfolio.mjs` gained a `--now` seam
so that can be demonstrated rather than argued about; production default is unchanged.

### The 28-leg card

Moonshot groups legs into per-game structures and took EVERY game on the slate. There was no bound.
On a World Cup day of four sparsely-priced matches that yielded three to five legs and the missing
cap was invisible. On a fifteen-game MLB slate the first run produced:

    Moonshot A   28 legs   +1,420,977,392   $25 → $355,244,372.91
    Moonshot B   41 legs   +780,461,779,727 $25 → $195,115,444,956.64

A latent defect my change exposed rather than caused. The ceiling is now ten legs — the largest lane
this product was ever designed to publish, since its own deepest-slate test builds Lane A at exactly
ten and the historical June-23 production slate builds Lane B at eight. Every existing card fits
underneath unchanged: the June-23 lanes still build 5 legs at +818 and 8 legs at +3893, both active.

Two attempts were needed. The first capped each lane independently at five, which broke two things:
the historical Lane B fell to 4 legs and stopped clearing its floor, and the lanes ranked to
different game sets, silently breaking the documented tier relationship where B is a superset of A.
The bound now sizes the shared game set on the AGGRESSIVE lane, so both draw from the same games and
the superset holds by construction.

**Stated limitation:** this bounds an absurdity; it is not a payout constraint. A ten-leg longshot can
still quote a return well above the lane's $1,000 ladder target, because the +700 floor is a minimum
with no maximum beside it. Recorded, not papered over.

### Two of my own tests were vacuous

Mutation probing caught them. A test asserting the de-vigged favourite is chosen used a fixture where
the home side was the favourite, so hardcoding `ml.home` passed it; it now checks both directions. And
a "sport with no draw keeps its moneyline" guard could not fail, because the existing `?? ml` fallback
already covered that case — the guard I had added was a no-op, so it was reverted rather than kept as
unfalsifiable code.

Gate: SUCCESS 206s · 5370 unit · 447 rendered.
