#!/usr/bin/env node
/**
 * LIVE HUB V2 — replay a recorded acceptance capture through the V2 view model (read-only, offline).
 *
 *   node scripts/live/replay-v2-capture.mjs <capture-dir> [--json]
 *
 * The capture kit (docs/live/capture/capture.sh) records, every pass, `<T>-event.json` (our gateway's answer for
 * the event: `{ event: envelope }` or a refusal) and `<T>-espn.json` (ESPN's own summary — ground truth). This
 * feeds each recorded envelope through `eventFromNflRoster` exactly as the V2 board would, and compares, per pass:
 *
 *   score     V2 home/away == gateway envelope == ESPN (only once ESPN says the game has started; before that the
 *             reader must see no score at all, so a numeric V2 score pre-kickoff is a disagreement)
 *   status    V2 status vs ESPN's state class (scheduled / in play / final)
 *   period    while in play: V2 quarter == ESPN period, and V2 clock == ESPN displayClock
 *
 * Recorded files are read, never written. A lag of one pass after a transition is reported as LAG (the gateway
 * caches up to 120 s by design), not hidden; everything else that differs is a DISAGREEMENT.
 */
import fs from "node:fs";
import path from "node:path";
import { eventFromNflRoster } from "../../src/lib/live/v2/from-envelope.mjs";

const num = (v) => { const n = typeof v === "string" ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };

/** ESPN summary → { cls: PRE|IN_PLAY|FINAL|OTHER, name, period, clock, home, away }. */
export function espnTruth(summary) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const st = comp.status ?? {};
  const name = st.type?.name ?? null;
  const cls = name === "STATUS_SCHEDULED" ? "PRE"
    : /^STATUS_(IN_PROGRESS|HALFTIME|END_PERIOD|END_OF_REGULATION|OVERTIME)$/.test(name ?? "") ? "IN_PLAY"
    : /^STATUS_FINAL/.test(name ?? "") ? "FINAL" : "OTHER";
  const side = (h) => (comp.competitors ?? []).find((c) => c.homeAway === h);
  return { cls, name, period: num(st.period), clock: st.displayClock ?? null, home: num(side("home")?.score), away: num(side("away")?.score) };
}

const V2_CLASS = { PREGAME: "PRE", LIVE: "IN_PLAY", DELAYED: "IN_PLAY", FINAL_PROVISIONAL: "FINAL", FINAL_CANONICAL: "FINAL" };

/** Compare one pass. Returns { t, refusal?, v2, espn, issues: [{kind, detail}] }. */
export function comparePass(t, eventResponse, summary) {
  const truth = espnTruth(summary);
  const envelope = eventResponse?.event ?? null;
  if (!envelope) return { t, refusal: eventResponse?.reason ?? eventResponse?.state ?? "NO_EVENT", espn: truth, issues: [] };
  const game = {
    providerEventId: envelope.providerEventId ?? envelope.eventId,
    kickoffUtc: envelope.startTime ?? null,
    awayAbbr: envelope.competitors?.away?.abbr ?? null, awayTeam: envelope.competitors?.away?.name ?? null,
    homeAbbr: envelope.competitors?.home?.abbr ?? null, homeTeam: envelope.competitors?.home?.name ?? null,
    settlement: null,
  };
  const v2 = eventFromNflRoster(game, envelope);
  const issues = [];
  if (truth) {
    const v2cls = V2_CLASS[v2.status] ?? "OTHER";
    if (v2cls !== truth.cls) issues.push({ kind: "status", detail: `V2 ${v2.status} vs ESPN ${truth.name}` });
    if (truth.cls === "PRE") {
      if (v2.home.score != null || v2.away.score != null) issues.push({ kind: "score", detail: `a score before kickoff (${v2.away.score}–${v2.home.score})` });
    } else {
      if (v2.home.score !== truth.home || v2.away.score !== truth.away) issues.push({ kind: "score", detail: `V2 ${v2.away.score}–${v2.home.score} vs ESPN ${truth.away}–${truth.home}` });
    }
    const envScore = [num(envelope.competitors?.away?.score), num(envelope.competitors?.home?.score)];
    if (envScore[0] !== v2.away.score || envScore[1] !== v2.home.score) issues.push({ kind: "score", detail: `V2 ${v2.away.score}–${v2.home.score} vs gateway ${envScore[0]}–${envScore[1]}` });
    if (truth.cls === "IN_PLAY" && v2cls === "IN_PLAY") {
      if (v2.progress?.quarter !== truth.period) issues.push({ kind: "period", detail: `V2 Q${v2.progress?.quarter} vs ESPN period ${truth.period}` });
      if ((v2.progress?.clock ?? null) !== truth.clock && truth.name === "STATUS_IN_PROGRESS") issues.push({ kind: "clock", detail: `V2 ${v2.progress?.clock} vs ESPN ${truth.clock}` });
    }
  }
  return { t, v2: { status: v2.status, away: v2.away.score, home: v2.home.score, progress: v2.progress }, espn: truth, issues };
}

/** Replay a capture directory. A difference that the NEXT pass no longer shows is downgraded to LAG. */
export function replayDir(dir) {
  const stamps = fs.readdirSync(dir).filter((f) => /-event\.json$/.test(f)).map((f) => f.replace(/-event\.json$/, "")).sort();
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
  const passes = stamps.map((t) => comparePass(t, read(`${t}-event.json`), read(`${t}-espn.json`)));
  for (let i = 0; i < passes.length; i++) {
    const next = passes[i + 1];
    // A state transition the gateway reports one pass late (its cache is up to 120 s by design) is a LAG, and so is
    // anything that differs only on that same pass (e.g. no score yet on the cached pregame envelope). A score that
    // differs while the states agree is never a lag.
    const transition = passes[i].issues.some((x) => x.kind === "status") && next && !next.issues.some((x) => x.kind === "status");
    for (const is of passes[i].issues) {
      const persists = next && next.issues.some((n) => n.kind === is.kind);
      const lagKind = is.kind === "status" || is.kind === "period" || is.kind === "clock" || transition;
      is.severity = next && !persists && lagKind ? "LAG" : "DISAGREEMENT";
    }
  }
  const all = passes.flatMap((p) => p.issues.map((i) => ({ t: p.t, ...i })));
  return {
    passes: passes.length,
    refusals: passes.filter((p) => p.refusal).length,
    disagreements: all.filter((i) => i.severity === "DISAGREEMENT"),
    lags: all.filter((i) => i.severity === "LAG"),
    timeline: passes.map((p) => ({ t: p.t, refusal: p.refusal ?? null, v2: p.v2 ?? null, espn: p.espn ? { name: p.espn.name, period: p.espn.period, clock: p.espn.clock, away: p.espn.away, home: p.espn.home } : null })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error("usage: replay-v2-capture.mjs <capture-dir> [--json]"); process.exit(2); }
  const r = replayDir(dir);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log(`passes ${r.passes} · gateway refusals ${r.refusals} · disagreements ${r.disagreements.length} · one-pass lags ${r.lags.length}`);
  for (const d of r.disagreements) console.log(`  DISAGREEMENT ${d.t} ${d.kind}: ${d.detail}`);
  for (const d of r.lags) console.log(`  lag ${d.t} ${d.kind}: ${d.detail}`);
}
