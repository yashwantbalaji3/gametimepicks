#!/usr/bin/env node
/**
 * PUBLICATION EVIDENCE · the ACTUAL first pitch of graded MLB games (TRUTH-001, founder decision 4).
 *
 *   node scripts/mlb/capture-mlb-actual-first-pitch.mjs [--write]
 *
 * Two StatsAPI sources (free, no key), both read with a `fields` filter:
 *   - `feed/live` gameData.gameInfo.firstPitch — to the MINUTE (…:06:00.000Z), and ROUNDED (a pitch recorded at
 *     …:48:57 is stated …:49:00), so on its own the true start is only known to [t − 60 s, t + 60 s);
 *   - `playByPlay` — the first event with isPitch = true carries a millisecond `startTime`. It is the time the pitch was
 *     RECORDED, so the true first pitch is at or a little before it: kept as [t − 10 s, t].
 * The pitch-event time is preferred when present and consistent with the minute (within −60 s / +120 s of it).
 * Missing values stay missing (never filled with the scheduled time).
 *
 * Output: data/internal/mlb/actual-first-pitch/<capturedAt>.json — internal, not a build input. Append-only by file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const WRITE = process.argv.includes("--write");
const graded = fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const games = new Map();
for (const r of graded) if (!games.has(r.gamePk)) games.set(r.gamePk, { gamePk: r.gamePk, date: r.date, scheduledUtc: r.firstPitchUtc });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const capturedAt = new Date().toISOString();
const out = [];
for (const g of [...games.values()].sort((a, b) => a.gamePk - b.gamePk)) {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${g.gamePk}/feed/live?fields=gameData,datetime,dateTime,gameInfo,firstPitch`;
  let firstPitch = null;
  let feedScheduled = null;
  let firstPitchEvent = null;
  let error = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      firstPitch = d?.gameData?.gameInfo?.firstPitch ?? null;
      feedScheduled = d?.gameData?.datetime?.dateTime ?? null;
      error = null;
      break;
    } catch (e) {
      error = String(e.message ?? e);
      await sleep(1000 * (attempt + 1));
    }
  }
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/playByPlay?fields=allPlays,playEvents,startTime,isPitch`);
    if (res.ok) {
      const d = await res.json();
      const times = (d?.allPlays ?? []).flatMap((p) => (p.playEvents ?? []).filter((e) => e.isPitch === true && e.startTime).map((e) => e.startTime));
      firstPitchEvent = times.length ? times.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null;
    }
  } catch { firstPitchEvent = null; }
  // Consistency: the recorded pitch must sit near the stated (rounded) minute; otherwise distrust it.
  const consistent = firstPitchEvent && firstPitch
    && Date.parse(firstPitchEvent) >= Date.parse(firstPitch) - 60_000 && Date.parse(firstPitchEvent) < Date.parse(firstPitch) + 120_000;
  out.push({
    ...g, feedScheduledUtc: feedScheduled, actualFirstPitch: firstPitch, precisionSec: firstPitch ? 60 : null,
    firstPitchEvent, firstPitchEventConsistent: !!consistent,
    // The interval the true first pitch lies in, by the best consistent source.
    startInterval: consistent
      ? { from: new Date(Date.parse(firstPitchEvent) - 10_000).toISOString(), to: firstPitchEvent, basis: "PITCH_EVENT" }
      : firstPitch ? { from: new Date(Date.parse(firstPitch) - 60_000).toISOString(), to: new Date(Date.parse(firstPitch) + 60_000).toISOString(), basis: "FEED_MINUTE" } : null,
    error,
  });
  await sleep(150);
}
const doc = {
  schema: "gtp.mlb.actual-first-pitch@1",
  source: "MLB StatsAPI /api/v1.1/game/{gamePk}/feed/live gameData.gameInfo.firstPitch (free, no key)",
  capturedAt,
  precision: "startInterval: [recorded first pitch − 10 s, recorded first pitch] from the play-by-play when consistent with the feed's rounded minute; else [t − 60 s, t + 60 s) around that minute",
  count: out.length,
  withActual: out.filter((x) => x.actualFirstPitch).length,
  games: out,
};
console.log(`[first-pitch] ${doc.withActual}/${doc.count} graded games have an actual first pitch; later than scheduled: ${out.filter((x) => x.actualFirstPitch && Date.parse(x.actualFirstPitch) > Date.parse(x.scheduledUtc)).length}; earlier: ${out.filter((x) => x.actualFirstPitch && Date.parse(x.actualFirstPitch) < Date.parse(x.scheduledUtc)).length}`);
if (WRITE) {
  const dir = path.join(ROOT, "data/internal/mlb/actual-first-pitch");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${capturedAt.slice(0, 19).replace(/:/g, "-")}Z.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
  console.log(`✓ wrote ${path.relative(ROOT, file)}`);
}
