# P242 narrow exception — NFL Simulation Theater, public beta behind a flag

Status: **approved in principle, feature OFF.** The founder approved this exception in chat on 2026-10-19.
The public feature stays disabled until acceptance passes and the release-owning session hands it off.

## The decision

On 2026-10-19 the founder approved, in chat, a narrow exception to the P242 animation retirement: **"Public beta if gates pass"**. It covers clearly disclosed, drive-level Theater playback only.

P242 (2026-09-07) retired the staged "Generate Simulation" reveal and the recording/presentation player. This exception does not undo that retirement. It allows one different thing: the Simulation Theater V2 replay on the existing public page `/nfl/simulation/[eventId]`. The founder approved the dev-route prototype of the Theater as D2 on 2026-10-18.

## Scope

In scope:

- **Where.** The "Simulation replay" section on `/nfl/simulation/[eventId]`, and only for games whose Simulation V2 receipt of record the page already shows. The record must be the latest receipt generated before kickoff, with ≥10,000 runs and zero incoherent runs (`app/src/lib/sports/nfl/sim-v2/public-receipt.mjs`).
- **What.** Drive-level playback of one representative run of that receipt: score bug, team colours, drive strip, camera follow/full field, halftime and final cards, phone sheets, reduced motion and keyboard control. The components are the prototype's own: `TheaterSection`, `TheaterLoader` and `TheaterIsland`, with the dev hooks off.
- **Disclosure.** Four labels stay on screen and in the accessibility tree at all times, outside the client island: **SIMULATED · DRIVE-LEVEL · MOVEMENT ILLUSTRATIVE · EXPERIMENTAL MODEL**. A methodology note sits with them. It says that drive boundaries are recorded facts from the drive-engine receipt, that movement within a drive is illustrative, and that the engine has not been shown to be more accurate than the baseline forecast.
- **Fallbacks.** With JavaScript off, the page shows a server-rendered table of the recorded drives. A receipt that fails to adapt, or has no valid run, shows "Simulation replay unavailable" with its reason, and nothing is packed into the page.

Out of scope. These stay retired and unmounted:

- the presentation player (`app/src/components/simulate/presentation-player.tsx`) and its launchers
- the staged `SportSimulationAnimation` (`app/src/components/game/simulation-animation.tsx`)
- the runner's phase machine and the "Generate Simulation" CTA
- every `?play=1` href

The guard in `app/src/lib/simulation-dashboard.test.mjs` ("The ceremony stays retired") is unchanged. No other sport and no other page is covered. NBA Theater remains a dev-only private candidate.

## The flag

- **Name and values.** `GTP_NFL_THEATER_PUBLIC` is read at build time. It is ON only when it is exactly `1`.
- **How OFF works.** `app/next.config.mjs` defines it into the bundle as `"1"` or `"0"`. The page imports the section only inside `if (process.env.GTP_NFL_THEATER_PUBLIC === "1")`, which is a compile-time constant. With the flag OFF, the build contains no theater pack, no theater CSS and no island chunk on the page.
- **Branch state.** The flag is **OFF in the branch** and in every Production build until the handoff below.

## Gates (all required before the flag is turned on for Production)

1. **Acceptance matrix passes.** Run `app/e2e/simulation-theater.spec.ts` against the integrated route (target `public`) at 320, 390, 768 and 1440 px. It checks no horizontal overflow, the exact labels, the methodology note, the no-JS drive table, keyboard control, reduced motion, phone sheets, contrast and structure. Also run it against the dev route, and the unit suite (`public-theater*.test.mjs`, the prototype's theater tests and renderer parity).
2. **Post-build boundary passes.** `public-theater-export.test.mjs` must pass in the post-build phase. It proves the OFF build carries nothing of the Theater on `/nfl/simulation/<id>/`, and that the ON build carries the pack, the labels, the note and the drive table.
3. **Flag OFF until handoff.** The release-owning session turns the flag on, in a separate change, only after gates 1–2 pass. The integration branch never turns it on.
4. **Exact-head CI.** The quality gate must be green on the exact head commit that turns the flag on. A run on an earlier or merge-ref commit does not count.

## Rollback

Unset `GTP_NFL_THEATER_PUBLIC`, or set it to anything but `1`, and rebuild. The section, its pack, its CSS and its island then leave the build. The rest of `/nfl/simulation/[eventId]` (the Simulation V2 report) does not change.
