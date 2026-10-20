# NFL Simulation Theater: player allocation (`nfl-player-allocation@1`)

Code: `app/src/lib/simulation-theater/player-allocation.mjs`, used by `box-score.mjs`. The audit check is `app/src/lib/consistency/checks.mjs` (`nflAllocatedLineInvariants`).
Tests: `app/src/lib/simulation-theater/player-allocation.test.mjs`.

## Why

The sim-v2 drive engine records drives, not plays or players. Each drive has a quarter, clock, offense, start spot, result, plays, net yards, seconds and score. Until now every player section of the Theater's projected box score was therefore `NOT_MODELED`.

This layer fills passing, rushing and receiving lines for one selected run. It allocates that run's recorded drive facts to players in the proportions of the **official player projection**: the player board, read only through `nflOfficialSnapshot` (founder decision, 2026-10-20). It reads nothing from the sim-v2 batch distributions, World Model V2 or role shares.

Every allocated line carries the status `ALLOCATED` and the label **"Allocated from the official projection"**. That keeps it distinct from the two existing statuses:

- `MODELED` means the engine stored the value.
- `DERIVED` means the value is exactly computable from the drives.

## Inputs

| Input | Source |
|---|---|
| Run | One adapted, validated `TheaterSample`, which is one stored run of one sim-v2 receipt. |
| Official projection | `gtp.contract.official-forecast-snapshot@1` for the same event: the forecast of record plus the player board. |
| Join | `nfl-athlete-<espnId>` id plus team abbreviation only. A display name is never used to match a player. |

## Rule

All steps run per team.

1. **Pools.** These are built from the official snapshot's `expected` values.
   - Passers are players with `player_pass_yds`, weighted by expected passing yards.
   - Rushers are players with `player_rush_yds`, weighted by expected rushing yards.
   - Receivers are players with `player_receptions`, weighted by expected receptions.
     - Their yards weight is the expected `player_reception_yds`.
     - If that is missing, the yards weight is expected receptions × the team's projected yards per reception. That rate is taken over receivers who have both families.
   - Scorers come from `anytime_td` p, converted to expected touchdowns with λ = −ln(1 − p). Each player's λ is split into rushing and receiving parts by the player's expected rushing vs receiving yards.
   - A player with only an `anytime_td` probability gets no line. Such players are listed in `unallocated` with reason `NO_VOLUME_FAMILY`.
2. **Volume.** Let P = Σ plays over the team's drives.
   - The projection implies E[attempts] = E[receptions] ÷ c and E[carries] = E[rushing yards] ÷ y.
   - attempts = round(P × E[att] ÷ (E[att] + E[car])).
   - carries = P − attempts.
   - completions = min(attempts, round(attempts × c)).
   - c = 0.65 and y = 4.3 (`ALLOCATION_RULES`) are rounded league-wide rates. They are allocation parameters, not forecasts, and changing them requires a new version.
3. **Yards, drive by drive.**
   - A drive with net yards > 0 is split. Passing gets round(net × the projection's passing-yard share), and rushing gets the rest.
   - A drive with net yards ≤ 0 is **unattributed**: a drive-level record cannot tell a sack, a penalty or a loss apart.
   - So **team passing + rushing + unattributed = Σ drive net yards, exactly**.
   - If a team has no completions, the share is 0. If it has no carries, the share is 1.
4. **Players.** Each team total is split over the pool weights by largest-remainder apportionment. Ties go to the lower playerId.
   - Caps: completions ≤ attempts, and receptions ≤ targets.
   - Yards go only to players with a completion, reception or carry.
   - Across receivers, Σ targets = attempts, Σ receptions = completions, and Σ receiving yards = passing yards.
5. **Touchdowns.** Only the team's offensive TD drives get a scorer.
   - They are apportioned over the scorer λ, with caps: rushing TDs ≤ carries, and receiving TDs ≤ receptions.
   - Scorers are then assigned to the TD drives in drive order, with slots ordered by λ (descending), then playerId.
   - A receiving TD also counts as a passing TD for the passer with the most completions.
   - Tries (XP and two-point), defensive and special-teams scores, kicking, and defense stay team-level or `NOT_MODELED`.

The rule is deterministic per (receipt, runIndex): it uses no randomness and no clock. The server table and the client dialog (unpacked `theater-pack@1`) produce byte-identical output.

## Reconciliations

Each of these must hold. The allocator checks them, and the audit re-checks them independently against the raw stored drives and the snapshot.

- passing + rushing + unattributed = Σ net yards, and unattributed = Σ net yards of the drives with net ≤ 0.
- attempts + carries = Σ plays.
- completions ≤ attempts, both per team and per player. receptions ≤ targets per player.
- Lines sum to the team totals:
  - Σ att = Σ tgt = attempts.
  - Σ cmp = Σ rec = completions.
  - Σ passing yds = Σ receiving yds = passing.
  - Σ car = carries, and Σ rushing yds = rushing.
- Exactly one touchdown per offensive TD drive, and none anywhere else.
  - Σ passing TD = Σ receiving TD.
  - TD ≤ carries or receptions for the scorer.
  - The scorer has at least one yard per TD.
- Every row's id is an `nfl-athlete-*` id that the official snapshot carries for that team.

## Failing closed

If anything below fails, the box score keeps **today's `NOT_MODELED` player rows exactly**, keeps the `NOT_MODELED` "Passing / rushing yards" category, and records the reason in `allocation: { ok: false, kind, code, reason }`.

| Kind | Code | When |
|---|---|---|
| INPUT | `NO_OFFICIAL_SNAPSHOT` | No snapshot was supplied, or it is not an NFL snapshot with players. This is the default when the caller passes no `{ official }`. |
| INPUT | `SAMPLE`, `RUN_BINDING` | The run is not validated, or belongs to another receipt. |
| INPUT | `EVENT_MISMATCH`, `TEAM_MISMATCH` | The snapshot is for another event, or its team abbreviations differ. |
| INPUT | `NO_PASSER`, `NO_RUSHER`, `NO_RECEIVER` | The projection has an empty pool for a team that has drives. |
| INPUT | `TD_CAPACITY` | The run's TD drives cannot be placed on the projection's scorers. |
| INVARIANT | Any reconciliation code | A reconciliation broke. This is a bug, and the audit reports it as `BOX_SCORE_INCONSISTENT`. |

## Coverage on committed receipts (2026-10-20, main `61d9b9c715`)

- There are 1,030 validated stored runs across 206 receipts and 44 events. Every event has an official snapshot.
- 815 runs allocate and reconcile.
- 215 fail closed with `NO_PASSER`. On those boards the passing family is withheld for one team's QB (for example the TB, CHI and PHI boards).
- No run is refused for TD capacity, and no run breaks an invariant.
- The audit reports zero `BOX_SCORE_INCONSISTENT` records on the new `simulation-theater.allocated-players` surface.

## Worked example: 401873008, run #48 (MEDIAN_LIKE), WSH 20–30 SF

Receipt: `data/internal/research/nfl/sim-v2/shadow/2026-10-19/401873008-93e33ba709b93f85.json`.

Official sources: `data/internal/nfl/forecast-receipts/2026-10-20/401873008-rev-0007Z.json` and `app/public/data/nfl/player-board/401873008.json`.

| Team | Plays | Att | Cmp | Car | Net yds | Pass | Rush | Unattributed |
|---|---|---|---|---|---|---|---|---|
| WSH | 63 | 42 | 27 | 21 | 378 | 273 | 107 | −2 (drive 15) |
| SF | 51 | 28 | 18 | 23 | 446 | 308 | 139 | −1 (drive 18) |

- **Passing.** Purdy 18/28, 308 yds, 3 TD. Daniels 27/42, 273 yds, 2 TD.
- **Rushing (SF).** McCaffrey 11–65, 1 TD. Black 5–29. Purdy 4–26. James 2–10. Mac Jones 1–9.
- **Rushing (WSH).** Daniels 8–42. White 5–26. Ekeler 3–17. Kaliakmanis 3–13. McNichols 2–9.
- **Receiving (SF).** Evans 4/6, 78 yds, 1 TD. Kittle 3/5, 64 yds, 1 TD. McCaffrey 3/4, 44 yds. Pearsall 2/4, 37 yds. Tonges 1/1, 31 yds. Aiyuk 3/5, 25 yds, 1 TD. Juszczyk 1/2, 16 yds. Cooks 1/1, 13 yds.
- **Receiving (WSH).** McLaurin 5/8, 57 yds, 1 TD. Diggs 5/8, 49 yds, 1 TD. Okonkwo 4/6, 36 yds. Williams 3/5, 34 yds. Burks 2/4, 27 yds. Brown 2/3, 21 yds. McNichols 2/3, 17 yds. White 2/3, 17 yds. Ekeler 2/2, 15 yds.
- **Touchdowns by drive.**
  - Drive 4: McCaffrey rush.
  - Drive 8: Evans from Purdy.
  - Drive 9: Diggs from Daniels.
  - Drive 16: Kittle from Purdy.
  - Drive 19: McLaurin from Daniels.
  - Drive 22: Aiyuk from Purdy.
- **Unallocated.** Craig Reynolds (WSH): he has only an anytime-TD probability.

## Limits (read before showing it)

- These lines are an **allocation**, not a simulation of players. Within a run, each player's share is the projection's share. The variation from run to run comes only from the drives.
- The completion rate is the constant c in every run.
- Attempts include sacks and scrambles, and carries include kneels. The drive record cannot separate them.
- The Theater UI does not pass the snapshot yet, so the dev-route dialog still shows `NOT_MODELED` rows. Wiring it up needs the official snapshot on the manifest, row rendering in `BoxScoreTable.tsx`, and updated e2e expectations.
- The NFL Theater stays non-public until the drive engine is re-anchored to the official forecast. This layer adds no flag.
