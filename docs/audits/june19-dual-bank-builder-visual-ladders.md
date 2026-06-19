# June 19 — Dual Bank Builder visual ladder redesign

_Branch `june19-dual-bank-builder-visual-ladders` off main `be90123b` (#527). Audit at 2026-06-19._

## Current-state review
| component / file | current behavior | issue | desired behavior | planned change |
|---|---|---|---|---|
| `app/bank-builder/page.tsx` | renders `BankBuilderPreviewPanel` at top ("Today's Dual Bank Builder") + crown hero + tower + run plan | lane ladder is a cramped step-card stack; not a true visual ladder | lead with a polished **two-lane 5-step visual ladder board** | swap panel → `DualLadderBoard` (keep crown/Mr.Dub/methodology) |
| `bank-builder-preview-panel.tsx` `LaneLadder`/`LaneStepCard`/`RestartLaneCard` | LaneLadder shows settled/pending steps + StepPips; RestartLaneCard for hidden lanes | not a vertical rail; steps not individually expandable to legs | replace with rail + expandable `<details>` step rows | new `DualLadderBoard` + `LadderStepRow`; keep panel for non-launched preview |
| `MoneyPath` | big stake→return display | fine — reuse | reuse for actual money | reuse |
| `LaneLegRow` (in panel) | expandable leg row (avatar, odds, settlement, factors, last-5) | not exported | reuse for step drawers | `export` it |
| Mr. Dub link card | present below panel | keep | per-lane + page-level link | keep + add per-lane link |
| active artifact loader (`loadTodaySlate` → `bankBuilderPreview`) | maps both lanes incl. stopped Lane B steps into `LaneDisplay.steps` | stopped steps present in the data object | view model must EXCLUDE stopped steps from the public board | new pure `buildPublicDualLadder()` |
| Lane A state | `advanced`: Step 1 settled WON (Mexico DNB + Soto, $100→$197.88), Step 2 awaiting, 3-5 upcoming | — | ladder: Step 1 cleared (expandable → won legs), Step 2 awaiting, 3-5 upcoming | view model `advanced` |
| Lane B state | `stopped` + `publicVisible:false`, restart queued; steps carry Switzerland WON + Goldschmidt LOST | must stay hidden publicly | ladder: Step 1 queued/starting path, 2-5 upcoming; NO stopped Step 2 | view model `queued_restart` (ignores `lane.steps`) |
| Completed crown proof | hero + tower below | keep as proof | keep below the dual board | unchanged |
| Mobile | panel uses `grid sm:grid-cols-2` | OK base; ensure new board stacks + no overflow | lane cards stack on mobile, rows not clipped | responsive grid + `overflow-x-hidden` |

## Plan
1. **`lib/bank-builder/public-dual-ladder.ts`** — pure `buildPublicDualLadder(lane, laneId)` → `PublicDualLadderView` with 5 `PublicLadderStep`s from `BANK_BUILDER_LADDER`. Rules: stopped/`publicVisible:false` → `queued_restart` (Step 1 queued, 2-5 upcoming, NO lane.steps read); advanced/active → map each ladder step to the lane's real step (settled-won→cleared+card, pending→active+card, current coming_soon→awaiting, else upcoming); a settled **lost** step is never surfaced. Unit-tested.
2. **`components/bank-builder/dual-ladder-board.tsx`** (server component, native `<details>`) — heading + two `LaneLadderCard`s (Lane A / Lane B), side-by-side desktop / stacked mobile, each with a vertical gradient **rail** + 5 `LadderStepRow`s + a per-lane "Full ledger on Mr. Dub" link.
3. **`LadderStepRow`** — rail icon (✓ cleared / glowing dot active+awaiting / number upcoming), money target `$start → $goal` + `~Nx`, status badge, and a native `<details>` drawer: the real card (stake→return via `MoneyPath`, combined odds, survival/risk/confidence, date, status) + legs (reused `LaneLegRow`), or an honest "awaiting / starting path" body when no card.
4. **Page** — swap `BankBuilderPreviewPanel` for `DualLadderBoard` in the launched section; keep crown hero, tower, run plan, Mr. Dub link, methodology. Keep `BankBuilderPreviewPanel` for the non-launched dry-run preview.
5. Server-rendered + native `<details>` → stopped-lane data never reaches the HTML (verified pattern: Goldschmidt = 0 in `/bank-builder` HTML).

## Guards
- No settlement changes; no new BB legs; protected `public/data/bank-builder/*` untouched; stopped/failed lane details never on the public board (only Mr. Dub). No banned copy (lock/safe/safest/guaranteed/guarantee/sure thing/free money/risk-free/can't miss) and no "failed/collapsed/dead/fresh restart" public copy.
