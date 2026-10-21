// Material-change ledger per nfl-event-window publish (vs previous publish), with hours-to-kickoff per affected game.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, OUT, SINCE = "2026-10-01T00:00Z"] = process.argv.slice(2);
const git = (a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 1 << 30 });
const raw = (spec) => { try { return git(["show", spec]); } catch { return null; } };
const js = (spec) => { const r = raw(spec); try { return r == null ? null : JSON.parse(r); } catch { return null; } };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function flat(v, p, m) { if (Array.isArray(v)) { v.forEach((x, i) => flat(x, p + "[" + i + "]", m)); } else if (v && typeof v === "object") { for (const k of Object.keys(v)) flat(v[k], p + "." + k, m); } else m.set(p, v); return m; }
const nonClock = (a, b) => { if (!a || !b) return ["<missing>"]; const A = flat(a, "", new Map()), B = flat(b, "", new Map()); const out = new Set();
  for (const [k, v] of B) { const w = A.get(k); if (w === v) continue; if ((typeof v === "string" && ISO.test(v)) || (typeof w === "string" && ISO.test(w))) continue; if (/inputHash|Hash$|sha256|runId/i.test(k)) continue; out.add(k.replace(/\[\d+\]/g, "[]")); }
  for (const k of A.keys()) if (!B.has(k)) out.add("-" + k.replace(/\[\d+\]/g, "[]")); return [...out]; };
const commits = git(["log", "origin/main", "--first-parent", `--since=${SINCE}`, "--grep=nfl event window", "--format=%H\t%cI"]).trim().split("\n").map((l) => l.split("\t")).reverse();
const FC = "app/public/data/nfl/forecasts/latest.json", INJ = "data/internal/research/injuries/nfl/latest.json", ROS = "app/public/data/nfl/rosters/latest.json", PB = "app/public/data/nfl/player-board/";
const kick = {}; const teamAbbr = {}; const events = []; let prev = null;
for (const [h, t] of commits) {
  const fc = js(`${h}:${FC}`), inj = js(`${h}:${INJ}`);
  const ros = js(`${h}:${ROS}`); for (const tm of ros?.teams ?? []) teamAbbr[tm.providerTeamId] = tm.teamAbbr;
  const games = new Map((fc?.forecasts ?? []).map((f) => [f.providerEventId, f])); for (const f of games.values()) kick[f.providerEventId] = { ko: f.kickoffUtc, m: f.matchup, home: f.home.abbr, away: f.away.abbr };
  const ev = { h: h.slice(0, 10), t, changes: [] };
  if (prev) {
    const hko = (id) => +((Date.parse(kick[id]?.ko) - Date.parse(t)) / 36e5).toFixed(2);
    for (const [id, f] of games) {
      const p = prev.games.get(id); if (!p) { ev.changes.push({ kind: "NEW_GAME", id, hToKo: hko(id) }); continue; }
      const a = p.forecastSummary ?? {}, b = f.forecastSummary ?? {};
      const num = []; if ((a.winProbability?.home ?? 0).toFixed(3) !== (b.winProbability?.home ?? 0).toFixed(3)) num.push(`win ${(a.winProbability?.home * 100).toFixed(1)}→${(b.winProbability?.home * 100).toFixed(1)}`);
      for (const k of ["margin", "total"]) if (a[k]?.median !== b[k]?.median || a[k]?.p10 !== b[k]?.p10 || a[k]?.p90 !== b[k]?.p90) num.push(`${k} ${a[k]?.median}→${b[k]?.median}`);
      if (JSON.stringify(a.projectedScore) !== JSON.stringify(b.projectedScore)) num.push("score");
      if (num.length) ev.changes.push({ kind: "FORECAST_NUMBER", id, hToKo: hko(id), what: num.join(", "), dpp: +Math.abs((b.winProbability?.home - a.winProbability?.home) * 100).toFixed(2) });
      const st = []; if (p.teamInputs?.state !== f.teamInputs?.state || JSON.stringify(p.teamInputs?.absences) !== JSON.stringify(f.teamInputs?.absences)) st.push(`teamInputs ${p.teamInputs?.state}→${f.teamInputs?.state}`);
      if (p.sideDecision?.publishedSide !== f.sideDecision?.publishedSide || p.sideDecision?.abstention !== f.sideDecision?.abstention) st.push(`side ${p.sideDecision?.publishedSide}→${f.sideDecision?.publishedSide}`);
      if (p.marketComparison?.state !== f.marketComparison?.state) st.push(`market ${p.marketComparison?.state}→${f.marketComparison?.state}`);
      else if (JSON.stringify(nonClock(p.marketComparison, f.marketComparison)) !== "[]") st.push("market numbers");
      if (st.length) ev.changes.push({ kind: "FORECAST_STATE", id, hToKo: hko(id), what: st.join(", ") });
    }
    // player boards: non-clock leaves
    const pbFiles = git(["diff", "--name-only", prev.h, h, "--", PB]).trim().split("\n").filter((n) => /\/\d+\.json$/.test(n));
    for (const f of pbFiles) { const id = f.match(/(\d+)\.json$/)[1]; if (!kick[id]) continue; const d = nonClock(js(`${prev.h}:${f}`), js(`${h}:${f}`)); if (d.length) ev.changes.push({ kind: "PLAYER_BOARD", id, hToKo: hko(id), what: d.slice(0, 5).join(" ") + (d.length > 5 ? ` (+${d.length - 5})` : "") }); }
    // injuries on teams with a game in the next 7 days (and not started)
    const upcoming = new Map(); for (const [id, k] of Object.entries(kick)) { const hh = hko(id); if (hh > 0 && hh < 168) { upcoming.set(k.home, id); upcoming.set(k.away, id); } }
    const A = new Map(Object.values(prev.inj?.entries ?? {}).map((e) => [e.athleteId, e.status]));
    const byGame = {};
    for (const e of Object.values(inj?.entries ?? {})) { const s0 = A.get(e.athleteId) ?? "(none)"; if (s0 === e.status) continue; const ab = teamAbbr[e.providerTeamId]; const id = upcoming.get(ab); if (!id) continue; (byGame[id] ??= []).push(`${e.athleteName} ${s0}→${e.status}`); }
    for (const [id, l] of Object.entries(byGame)) ev.changes.push({ kind: "INJURY_STATUS", id, hToKo: hko(id), n: l.length, what: l.slice(0, 3).join("; ") });
  }
  events.push(ev); prev = { h, games, inj };
}
fs.writeFileSync(OUT, JSON.stringify({ kick, events }, null, 1));
const c = {}; for (const e of events) for (const x of e.changes) c[x.kind] = (c[x.kind] ?? 0) + 1; console.log("publishes", events.length, c);
