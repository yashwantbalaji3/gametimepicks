#!/usr/bin/env node
/**
 * LIVE NFL PLAYER-PROP TRACKING (Phase 5 · V1) — the stat so far, beside the forecast we froze.
 *
 *   node app/scripts/nfl/capture-live-props.mjs --now <ISO> [--event <id>] [--dry-run]
 *
 * THREE TRUTHS, AND ONLY ONE OF THEM MOVES:
 *
 *   frozen    our pregame projection and the book's price AT CAPTURE — both immutable once published
 *   live      the provider's current player and game state — replaced on every read
 *   settled   the final stat and how it landed against the FROZEN line
 *
 * The frozen block is copied out of the committed player board and never recomputed here, so no
 * path in this producer can rewrite a published forecast or a captured price with a later one.
 *
 * ⚠ NO "ON TRACK", NO PROJECTED FINISH, NO LIVE PROBABILITY. None is validated, and a number that
 * looks like a forecast is read as one however it is labelled. See lib/sports/nfl/live-prop-state.mjs.
 *
 * ⚠ THE JOIN IS BY DURABLE ID. Board ids are `nfl-athlete-<espnId>` and ESPN's boxscore keys its
 * athletes by that same id, so no name is ever compared. The identity defect that published
 * "Not offered" for eight priced players on 2026-09-25 cannot occur on this path.
 *
 * FREE. ESPN's public summary endpoint; no provider credit is spent and no key is used.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLiveRows, phaseOf, promoteFinality, selectLiveTargets, shouldPollEvent } from "../../src/lib/sports/nfl/live-prop-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const nowMs = Date.parse(NOW);

/*
 * ── THE TARGET SET CANNOT COME FROM A FORWARD-ONLY WINDOW ───────────────────────────────────────
 *
 * This selected live games out of `nfl/schedule/latest.json`, and that file holds only FUTURE
 * kickoffs. `capture-nfl-schedule.mjs` builds it through `mergeWindowEvents(responses, d0, d1)` with
 * `d0 = new Date(NOW)` — the capture INSTANT, not its date — and `inWindow` keeps `t >= d0`. A game
 * that has kicked off is dropped the next time the schedule is captured. Today's artifact proves it:
 * generated 2026-09-25T14:34:12Z, 17 rows, earliest kickoff 2026-09-27 — Thursday's 00:15Z game,
 * played hours earlier, is simply not in it, while a committed board for it still is (33 of the 49
 * boards on disk are for games that have already started).
 *
 * So the two filters were mutually exclusive: the schedule keeps `kickoff > captureInstant` and this
 * producer wants `kickoff <= now`. It found anything at all ONLY while the schedule happened to be
 * stale relative to kickoff — and the lane's own header records that scheduled delivery here runs
 * 1h40m to 4h55m late. A schedule capture arriving after the first Sunday kickoff would silently
 * empty the target set for the rest of the slate, and a game already under way would never settle.
 * "nothing to track" would look exactly like a quiet afternoon.
 *
 * THE BOARDS ARE THE RIGHT SOURCE, and they are the artifact this producer already depends on: it
 * needs each board for the frozen lines anyway, each carries its own `providerEventId` and
 * `kickoffUtc`, and they persist after kickoff instead of evaporating. Identity still comes from a
 * committed canonical artifact, which is what the refusal below was protecting.
 *
 * The schedule is still read, and still consulted — but as a CROSS-CHECK, never as a filter. Two
 * canonical artifacts disagreeing about a kickoff instant is a real integrity failure and is refused;
 * a game the schedule has simply moved past is not.
 */
const BOARD_DIR = path.join(APP, "public/data/nfl/player-board");

const boards = (() => {
  let files = [];
  try { files = fs.readdirSync(BOARD_DIR).filter((f) => f.endsWith(".json")); } catch { return null; }
  return files.map((f) => read(path.join(BOARD_DIR, f))).filter(Boolean);
})();
if (!boards?.length) { console.error("REFUSED: no readable NFL player boards — live state is never attached to a guessed fixture"); process.exit(2); }

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const only = arg("event");
const OUT_DIR = path.join(APP, "public/data/nfl/live-props");

/*
 * ── THE PROMOTION SWEEP — PROVISIONAL → CANONICAL, AND WHY IT IS NOT IN THE LOOP BELOW ────────────
 *
 * ⚠ CANONICAL WAS UNREACHABLE. See `promoteFinality`: polling stopped at the exact instant the stamp
 * would have changed, so every NFL prop settlement ever written was permanently PROVISIONAL and the
 * documented terminus of the lifecycle had never once been reached.
 *
 * ⚠ AND IT CANNOT RIDE THE LIVE WINDOW. The obvious fix — promote inside the target loop — is wrong
 * for the same reason the defect existed: `selectLiveTargets` only yields a game for eight hours after
 * kickoff, and Thursday night kicks at 00:15Z with its window closing at 06:30Z, after this workflow's
 * last Friday slot at 04:45Z. A promotion that depends on a cron overlapping a three-hour window is a
 * promotion that silently does not happen. So the sweep walks every committed artifact, on every
 * invocation, before any liveness question is asked — and `nfl-event-window.yml` calls it daily with
 * `--promote-only` so a game whose closure falls outside every live slot still reaches CANONICAL.
 *
 * FREE AND FETCH-FREE. Promotion is a statement about the clock and the recorded first-final instant,
 * so no provider is touched and nothing but `finality` moves.
 */
const PROMOTE_ONLY = process.argv.includes("--promote-only");
let promoted = 0;
for (const f of (() => { try { return fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json")); } catch { return []; } })()) {
  const prior = read(path.join(OUT_DIR, f));
  const next = promoteFinality(prior, NOW);
  if (!next) continue;
  promoted += 1;
  if (DRY) { console.log(`${next.matchup}: would promote ${next.rows.filter((r) => r.settlement).length} settlement(s) to CANONICAL (dry run)`); continue; }
  fs.writeFileSync(path.join(OUT_DIR, f), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${next.matchup}: reconciliation window closed — ${next.rows.filter((r) => r.settlement).length} settlement(s) now CANONICAL`);
}
if (promoted === 0) console.log("no artifact was awaiting promotion to CANONICAL");
if (PROMOTE_ONLY) process.exit(0);

/* The rule itself lives in the library, where a behavioural test can hold it. This does IO. */
const { targets, disagreements, verdict } = selectLiveTargets({ boards, scheduleRows: schedule?.rows ?? [], nowMs, only });

/*
 * ⚠ A CONTESTED FIXTURE IS EXCLUDED, NOT A REASON TO ABANDON THE SLATE.
 *
 * `selectLiveTargets` already drops any game whose board and schedule disagree on kickoff — that is
 * the fail-closed part, and it is per game. This caller used to escalate that into `exit 2`, which
 * meant ONE disagreement anywhere killed live tracking for every other game.
 *
 * And "anywhere" was the whole archive: the loop reads all forty-nine committed boards, thirty-three
 * of them for games already played, against a schedule capture that refreshes daily. A provider
 * correcting the kickoff of a game from three weeks ago would have taken down the live product for
 * the current slate. Excluding the contested game is the truthful response; taking down thirteen
 * honest games with it is not more truthful, only less available.
 *
 * ⚠ SYSTEMIC IS STILL FATAL. If disagreements exist and NOT ONE target survived, this is not one
 * moved fixture — it is a schedule capture that cannot be reconciled with any board, and that refuses.
 *
 * ⚠ AND THE EXIT CODE IS NOT THE SIGNAL. Exiting non-zero here would mark the run failed and SKIP the
 * commit step below, discarding the honest artifacts this run just produced — the shape that has cost
 * this repository real archives. The disagreement is surfaced instead by
 * `app/scripts/ops/nfl-lifecycle-trace.mjs`, which reports it as BOARD · INCONSISTENT for the one game
 * it concerns.
 */
if (disagreements.length) {
  console.error(`::warning::${disagreements.length} fixture(s) EXCLUDED — board and schedule disagree on kickoff, so no live state is attached to them:\n  ${disagreements.join("\n  ")}`);
}
if (verdict === "REFUSE_UNRECONCILABLE") {
  console.error("REFUSED: not one board reconciled with the schedule — this is not one moved fixture, it is a capture that cannot be reconciled with any of them");
  process.exit(2);
}

if (!targets.length) {
  console.log(`no NFL game is in its live window at ${NOW} — nothing to track`);
  process.exit(0);
}

const outDir = OUT_DIR;
let wrote = 0;
let skippedSettled = 0;
for (const ev of targets) {
  /*
   * ⚠ A SETTLED GAME LEAVES THE LOOP. Once the provider has said FINAL and every row has reached a
   * terminal state, there is nothing left to observe — and settlement is idempotent, so a further
   * read could only ever confirm what is already recorded or raise a reconciliation. Polling on
   * regardless is how a "live" tracker spends the rest of the week re-reading Sunday's box scores.
   *
   * ⚠ The 8-hour window would eventually stop it anyway. That is a backstop, not the rule: a game
   * that finishes in three hours should stop being polled in three hours, not five later.
   */
  const decision = shouldPollEvent(read(path.join(outDir, `${ev.providerEventId}.json`)), NOW);
  if (!decision.poll) {
    skippedSettled += 1;
    console.log(`${ev.shortName}: not polled — ${decision.reason}`);
    continue;
  }
  const board = read(path.join(APP, `public/data/nfl/player-board/${ev.providerEventId}.json`));
  if (!board?.players) { console.log(`${ev.shortName}: no player board — skipped (a live row without a frozen forecast is not a row)`); continue; }

  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${ev.providerEventId}`);
  if (!res.ok) { console.log(`${ev.shortName}: provider ${res.status} — no live state written, previous file left intact`); continue; }
  const summary = await res.json();
  const phase = phaseOf(summary);

  /* The sealing rule, the settlement idempotency and the join all live in the library — see
     buildLiveRows. This script does IO and nothing else. */
  const priorPath = path.join(outDir, `${ev.providerEventId}.json`);
  const { rows, finalFirstObservedAt, finality, frozenRefusedNewerBoard, frozenRefusedNoPregameSnapshot, reconciled, recoveredFromNoMeasurement } = buildLiveRows({
    providerEventId: ev.providerEventId,
    kickoffUtc: ev.dateUtc,
    board, summary, prior: read(priorPath), observedAt: NOW,
    hashOf: (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16),
  });
  if (frozenRefusedNewerBoard) console.log(`  note: ${frozenRefusedNewerBoard} prediction(s) had a NEWER board value that was refused — the published frozen block stands`);
  if (frozenRefusedNoPregameSnapshot) console.log(`  ⚠ ${frozenRefusedNoPregameSnapshot} prediction(s) have NO frozen block: no snapshot proved it predates kickoff, so none was minted`);
  if (reconciled) console.log(`  note: ${reconciled} settled prediction(s) now disagree with the provider — recorded beside the settlement, which is unchanged`);
  if (recoveredFromNoMeasurement) console.log(`  note: ${recoveredFromNoMeasurement} prediction(s) had NO measurement at the first FINAL read and were graded from a later one`);

  const artifact = {
    schemaVersion: 1, artifact: "nfl-live-props", dataClass: "PUBLIC_DERIVED",
    providerEventId: ev.providerEventId, matchup: ev.shortName, kickoffUtc: ev.dateUtc,
    phase, finality, finalFirstObservedAt, observedAt: NOW, source: "espn-nfl-summary (free)",
    frozenFrom: board.generatedAt,
    counts: { rows: rows.length, withLiveStat: rows.filter((r) => r.live.statValue != null).length, settled: rows.filter((r) => r.settlement?.state === "SETTLED").length, noMeasurement: rows.filter((r) => r.settlement?.state === "NO_MEASUREMENT").length, frozenRefusedNewerBoard, frozenRefusedNoPregameSnapshot, reconciled },
    disclaimer: "Live figures are the provider's factual game state. The projection and the sportsbook line beside them are our pre-kickoff record and do not change during the game. No live probability, projected finish or on-track reading is shown.",
    rows,
  };
  if (DRY) {
    console.log(`${ev.shortName}: ${phase} · ${artifact.counts.rows} rows · ${artifact.counts.withLiveStat} with a live stat · ${artifact.counts.settled} settled (dry run)`);
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${ev.providerEventId}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`${ev.shortName}: ${phase} · ${artifact.counts.rows} rows · ${artifact.counts.withLiveStat} with a live stat · ${artifact.counts.settled} settled`);
    wrote += 1;
  }
}
if (!DRY) console.log(`wrote ${wrote} live-prop artifact(s)${skippedSettled ? `; ${skippedSettled} already settled and skipped` : ""}`);
