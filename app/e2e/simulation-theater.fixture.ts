/**
 * Simulation Theater V2 · e2e expectations DERIVED from the receipt of record the page renders (integration 2026-10-19).
 *
 * The prototype spec pinned run #428 of 401873008 and hand-picked playback seconds (22.9, 31.8, 66.6, …). On main the
 * receipt of record for 401873008 has moved (2026-10-19, no run #428) and will move again whenever the shadow job
 * writes a newer pre-kickoff receipt. So the spec no longer hard-codes a run: it resolves the record with the same loader
 * the routes use (lib/simulation-theater/loader.mjs → public-receipt.mjs simulationOfRecord) and computes every instant
 * from the compiled timeline. All instants are multiples of 100 ms, the seek bar's step, so the URL hook (dev route)
 * and the seek bar (public route) land on identical states.
 *
 * Node side only (imported by the spec, never by the app).
 */
import path from "node:path";

import { loadTheater } from "../src/lib/simulation-theater/loader.mjs";
import { compileTimeline } from "../src/lib/simulation-theater/timeline.mjs";
import { CAMERA_POLICY, REVIEW_ZOOM_CAPS, cameraAt } from "../src/lib/simulation-theater/camera.mjs";
import { driveSituation } from "../src/lib/simulation-theater/broadcast.mjs";

type Kf = { driveIdx: number; phase: string; t0: number; dur: number; breakKind?: string };
type Marker = { type: string; quarter: number; atT: number; driveIdx: number; exact: boolean };
type Compiled = { keyframes: Kf[]; markers: Marker[]; driveSpans: { driveIdx: number; t0: number; t1: number; startT: number }[]; tEnd: number };
type Ev = { index: number; scoring: boolean; plays: number; outcome: string };
type Sample = { receiptId: string; runIndex: number; events: Ev[]; validation: { ok: boolean } };
type Chip = { runIndex: number; sampleIndex: number; available: boolean };
type Manifest = {
  receiptId: string; runCount: number; chips: Chip[]; samples: Sample[];
  teams: { home: { abbr: string; name: string | null }; away: { abbr: string; name: string | null } };
};

/** ms → seconds on the seek bar's 100 ms grid, inside [lo, hi). */
const grid = (ms: number, lo = -Infinity, hi = Infinity) => {
  let g = Math.round(ms / 100) * 100;
  if (g < lo) g = Math.ceil(lo / 100) * 100;
  if (g >= hi) g = Math.floor((hi - 1) / 100) * 100;
  return g / 1000;
};
const mid = (k: Kf) => grid(k.t0 + k.dur / 2, k.t0 + 1, k.t0 + k.dur);

export type TheaterFixture = ReturnType<typeof deriveFixture>;

export function deriveFixture(eventId: string, repoRoot = path.resolve(process.cwd(), "..")) {
  const load = loadTheater(repoRoot, eventId);
  if (!load.ok || !load.manifest) throw new Error(`theater e2e: ${eventId} has no usable receipt of record (${load.error?.code})`);
  const m = load.manifest as unknown as Manifest;
  const chip = m.chips.find((c) => c.available)!;
  const s = m.samples[chip.sampleIndex] as Sample;
  const c = compileTimeline(s) as Compiled;
  const cr = compileTimeline(s, { reducedMotion: true }) as Compiled;
  const kfs = (d: number, phase: string) => c.keyframes.find((k) => k.driveIdx === d && k.phase === phase) ?? null;
  const n = s.events.length;

  // the reference drive (the prototype used run #428's drive 7): the first scoring drive from drive 4 on whose PROGRESS
  // lasts ≥ 1.5 s and whose midpoint the follow camera frames zoomed in (> 1.05×), as the camera tests require
  const zoomedAt = (k: Kf | null) => Boolean(k && cameraAt(s, c, mid(k) * 1000, { mode: "follow" }).z > 1.05);
  const ref = s.events.find((ev) => ev.index >= 3 && ev.scoring && (kfs(ev.index, "PROGRESS")?.dur ?? 0) >= 1500 && zoomedAt(kfs(ev.index, "PROGRESS")))
    ?? s.events.find((ev) => ev.index >= 3 && ev.scoring && (kfs(ev.index, "PROGRESS")?.dur ?? 0) >= 1500)
    ?? s.events.find((ev) => ev.scoring)!;
  const refProgress = kfs(ref.index, "PROGRESS")!;
  const refResult = kfs(ref.index, "RESULT")!;
  const half = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "HALFTIME") ?? null;
  const final = c.keyframes.find((k) => k.phase === "BREAK" && k.breakKind === "FINAL")!;
  const earlyReduced = cr.keyframes.find((k) => k.phase === "RESULT" && s.events[k.driveIdx].scoring)!;

  // a mid-drive quarter rollover (an inexact marker): in this run, else in another representative run of this receipt
  let roll: { run: number; t: number; quarter: number } | null = null;
  for (const ch of [chip, ...m.chips.filter((x) => x.available && x.runIndex !== chip.runIndex)]) {
    const ss = m.samples[ch.sampleIndex] as Sample;
    const cc = ss === s ? c : (compileTimeline(ss) as Compiled);
    const mk = cc.markers.find((x) => x.type === "QUARTER_ROLLOVER" && !x.exact);
    if (mk) { roll = { run: ss.runIndex, t: grid(mk.atT + 100, mk.atT + 1, mk.atT + 700), quarter: mk.quarter }; break; }
  }

  // the zoom review variant: a PROGRESS instant where the default cap binds (1.35×) and the 1.6× review cap reaches 1.6×
  let zoomT: number | null = null;
  const reviewCap = REVIEW_ZOOM_CAPS[0];
  for (const k of c.keyframes.filter((x) => x.phase === "PROGRESS")) {
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const t = grid(k.t0 + k.dur * f, k.t0 + 1, k.t0 + k.dur);
      const a = cameraAt(s, c, t * 1000, { mode: "follow" });
      const b = cameraAt(s, c, t * 1000, { mode: "follow", maxZoom: reviewCap });
      if (Math.abs(a.z - CAMERA_POLICY.maxZoom) < 1e-3 && Math.abs(b.z - reviewCap) < 1e-3) { zoomT = t; break; }
    }
    if (zoomT != null) break;
  }

  // paused mid-drive frames across the game, plus a drive start and a drive end (interp-tag sweep)
  const progressMids = c.keyframes.filter((k) => k.phase === "PROGRESS" && k.dur >= 900).map(mid);
  const pick = (xs: number[], k: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / k)) === 0).slice(0, k);
  const interpTimes = [...new Set([
    ...pick(progressMids, 5),
    ...(roll && roll.run === s.runIndex ? [roll.t] : []),
    grid(kfs(ref.index, "START")!.t0 + 100),
    mid(refResult),
  ])];

  // the most crowded available run (most drives): the timeline-target stress case
  const crowded = m.chips.filter((x) => x.available)
    .map((x) => m.samples[x.sampleIndex] as Sample)
    .sort((a, b) => b.events.length - a.events.length)[0];

  return {
    eventId,
    receiptId: m.receiptId as string,
    file: load.file as string,
    teams: m.teams as { home: { abbr: string }; away: { abbr: string } },
    runCount: m.runCount as number,
    /** the run the page opens on (first available chip) */
    run: s.runIndex,
    runs: m.chips.filter((x) => x.available).map((x) => x.runIndex) as number[],
    chipIndexOf: (run: number) => m.chips.findIndex((x) => x.runIndex === run),
    crowdedRun: crowded.runIndex,
    crowdedDrives: crowded.events.length,
    drives: n,
    tEnd: c.tEnd / 1000,
    /** seconds (100 ms grid) */
    t: {
      early: grid(c.keyframes.find((k) => k.phase === "PROGRESS" && k.driveIdx === 1)?.t0 ?? 3400) || 0.1,
      mid: mid(refProgress),
      result: mid(refResult),
      half: half ? mid(half) : null,
      final: mid(final),
      earlyReducedResult: mid(earlyReduced),
      zoom: zoomT,
      interp: interpTimes,
    },
    roll,
    refDrive: ref.index,
    /** the drive strip at the reference drive's RESULT: "Drive 7 of 19 · 10 plays · 75 yds" */
    refStrip: driveSituation(ref, "RESULT", m.teams, n).text as string,
  };
}
