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
import { buildLiveRows, phaseOf, shouldPollEvent } from "../../src/lib/sports/nfl/live-prop-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const nowMs = Date.parse(NOW);

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
if (!schedule?.rows) { console.error("REFUSED: canonical schedule unreadable — live state is never attached to a guessed fixture"); process.exit(2); }

/*
 * ⚠ ONLY GAMES THAT HAVE STARTED. A pre-kickoff read carries no stat and no score by design, so
 * fetching one buys nothing; and polling a fixture days out would be a request loop with no answer
 * in it. The window closes 8 hours after kickoff, by which point a finished game has settled.
 */
const only = arg("event");
const targets = schedule.rows.filter((r) => {
  if (only && r.providerEventId !== only) return false;
  const k = Date.parse(String(r.dateUtc ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  if (!Number.isFinite(k)) return false;
  return k <= nowMs && nowMs - k <= 8 * 3600_000;
});

if (!targets.length) {
  console.log(`no NFL game is in its live window at ${NOW} — nothing to track`);
  process.exit(0);
}

const outDir = path.join(APP, "public/data/nfl/live-props");
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
