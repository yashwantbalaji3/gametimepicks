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
 *   period    while in play: V2 quarter == ESPN period (the clock is reported as drift: the gateway caches by design)
 *
 * Recorded files are read, never written. A difference is a LAG only when the gateway was behind ESPN and the next verified pass
 * agrees; passes without usable ESPN truth are counted as unverified, never as agreement.
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
const RANK = { PRE: 0, IN_PLAY: 1, FINAL: 2 };

/**
 * Compare one pass. Returns { t, refusal?, unverified?, v2, espn, issues, clockDrift }.
 * `unverified` — no usable ESPN ground truth for this pass (missing, unparseable, challenged, or an in-play summary
 * without scores): such a pass proves nothing and is counted, never treated as agreement.
 * `behind` on an issue — the gateway/V2 is BEHIND ESPN (the only direction a cache can produce).
 */
export function comparePass(t, eventResponse, summary) {
  const truth = espnTruth(summary);
  const envelope = eventResponse?.event ?? null;
  if (!envelope) return { t, refusal: eventResponse?.reason ?? eventResponse?.state ?? "NO_EVENT", espn: truth, issues: [], clockDrift: false };
  const game = {
    providerEventId: envelope.providerEventId ?? envelope.eventId,
    kickoffUtc: envelope.startTime ?? null,
    awayAbbr: envelope.competitors?.away?.abbr ?? null, awayTeam: envelope.competitors?.away?.name ?? null,
    homeAbbr: envelope.competitors?.home?.abbr ?? null, homeTeam: envelope.competitors?.home?.name ?? null,
    settlement: null,
  };
  const v2 = eventFromNflRoster(game, envelope);
  const out = { t, v2: { status: v2.status, away: v2.away.score, home: v2.home.score, progress: v2.progress }, espn: truth, issues: [], clockDrift: false };
  const started = truth && truth.cls !== "PRE" && truth.cls !== "OTHER";
  if (!truth || truth.cls === "OTHER" || (started && (truth.home == null || truth.away == null))) { out.unverified = true; return out; }
  const v2cls = V2_CLASS[v2.status] ?? "OTHER";
  if (v2cls !== truth.cls) out.issues.push({ kind: "status", detail: `V2 ${v2.status} vs ESPN ${truth.name}`, behind: (RANK[v2cls] ?? -1) < RANK[truth.cls] });
  if (truth.cls === "PRE") {
    if (v2.home.score != null || v2.away.score != null) out.issues.push({ kind: "score", detail: `a score before kickoff (${v2.away.score}–${v2.home.score})`, behind: false });
  } else if (v2.home.score !== truth.home || v2.away.score !== truth.away) {
    // Behind = the gateway still shows no score (pregame envelope) or a strictly lower total than ESPN.
    const vt = (v2.home.score ?? 0) + (v2.away.score ?? 0), et = truth.home + truth.away;
    out.issues.push({ kind: "score", detail: `V2 ${v2.away.score}–${v2.home.score} vs ESPN ${truth.away}–${truth.home}`, behind: v2.home.score == null || vt < et });
  }
  if (truth.cls === "IN_PLAY" && v2cls === "IN_PLAY") {
    const q = v2.progress?.quarter ?? null;
    // ESPN's summary sometimes omits period/clock mid-play (seen in SEA@DEN overtime): nothing to compare, so the period
    // check is unverified for this pass rather than a disagreement.
    if (truth.period == null) out.periodUnverified = true;
    else if (q !== truth.period) out.issues.push({ kind: "period", detail: `V2 Q${q} vs ESPN period ${truth.period}`, behind: q != null && truth.period != null && q < truth.period });
    // The gateway caches up to 120 s and ESPN is fetched at a different moment: a running clock differs by design.
    // Clock is reported as drift, never as a disagreement.
    else if ((v2.progress?.clock ?? null) !== truth.clock && truth.name === "STATUS_IN_PROGRESS") out.clockDrift = true;
  }
  return out;
}

/**
 * Replay a capture directory. An issue is a LAG only when the gateway was BEHIND ESPN on that pass AND the next pass
 * is verified (ESPN truth present, no refusal) and no longer shows that kind of issue. Everything else — a gateway
 * that is ahead, a difference followed by a refused or unverified pass, a difference that persists — is a DISAGREEMENT.
 */
export function replayDir(dir) {
  const stamps = fs.readdirSync(dir).filter((f) => /-event\.json$/.test(f)).map((f) => f.replace(/-event\.json$/, "")).sort();
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
  const passes = stamps.map((t) => comparePass(t, read(`${t}-event.json`), read(`${t}-espn.json`)));
  for (let i = 0; i < passes.length; i++) {
    const next = passes[i + 1];
    const nextVerified = next && !next.refusal && !next.unverified;
    for (const is of passes[i].issues) {
      const cleared = nextVerified && !next.issues.some((n) => n.kind === is.kind);
      is.severity = is.behind && cleared ? "LAG" : "DISAGREEMENT";
    }
  }
  const all = passes.flatMap((p) => p.issues.map((i) => ({ t: p.t, ...i })));
  return {
    passes: passes.length,
    refusals: passes.filter((p) => p.refusal).length,
    unverified: passes.filter((p) => p.unverified).length,
    clockDrift: passes.filter((p) => p.clockDrift).length,
    periodUnverified: passes.filter((p) => p.periodUnverified).length,
    disagreements: all.filter((i) => i.severity === "DISAGREEMENT"),
    lags: all.filter((i) => i.severity === "LAG"),
    timeline: passes.map((p) => ({ t: p.t, refusal: p.refusal ?? null, unverified: !!p.unverified, v2: p.v2 ?? null, espn: p.espn ? { name: p.espn.name, period: p.espn.period, clock: p.espn.clock, away: p.espn.away, home: p.espn.home } : null })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error("usage: replay-v2-capture.mjs <capture-dir> [--json]"); process.exit(2); }
  const r = replayDir(dir);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log(`passes ${r.passes} · gateway refusals ${r.refusals} · unverified (no usable ESPN truth) ${r.unverified} · disagreements ${r.disagreements.length} · lags ${r.lags.length} · clock drift ${r.clockDrift} · period unverified ${r.periodUnverified}`);
  for (const d of r.disagreements) console.log(`  DISAGREEMENT ${d.t} ${d.kind}: ${d.detail}`);
  for (const d of r.lags) console.log(`  lag ${d.t} ${d.kind}: ${d.detail}`);
}
