// Turns a capture folder into a lifecycle + gap report (Markdown on stdout). Read-only.
// node report.mjs <captures-dir>
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2];
const EV = "401872995";
const lines = fs.readFileSync(path.join(dir, "captures.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { bad: l }; } });
const json = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
const stamps = [...new Set(lines.filter((l) => l.name === "event").map((l) => l.t))].sort();
const toIso = (t) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
const problems = [];
const ours = ["slate", "event", "live-html", "game-html", "build-info"];
const challenged = lines.filter((l) => ours.includes(l.name) && l.mitigated === "challenge");
const bad = lines.filter((l) => [...ours, "espn-summary"].includes(l.name) && l.mitigated !== "challenge" && (l.http !== 200 || !(l.bytes > 0)));
for (const b of bad) problems.push(`${toIso(b.t)} ${b.name}: HTTP ${b.http}, ${b.bytes} bytes`);
if (challenged.length) problems.push(`${challenged.length} request(s) to our site met Vercel bot mitigation (x-vercel-mitigated: challenge) — VERCEL_BOT_CHALLENGE: absence of evidence for those passes, not a site failure (docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md); first ${toIso(challenged[0].t)}, last ${toIso(challenged.at(-1).t)}`);
const timeline = [];
let last = null, frozen0 = null;
const frozenChanges = [];
let maxPlayers = 0, playersSeenAt = null;
for (const t of stamps) {
  const fz = fs.existsSync(path.join(dir, `${t}-frozen.txt`)) ? fs.readFileSync(path.join(dir, `${t}-frozen.txt`), "utf8").split("\n").filter((l) => !l.startsWith("main ") && !l.startsWith("receipt ")).join("\n") : null;
  if (fz == null || /UNREADABLE|ABSENT/.test(fz)) problems.push(`${toIso(t)} frozen forecast fingerprint ${fz == null ? "missing" : fz.match(/UNREADABLE|ABSENT/)[0]}`);
  else if (frozen0 == null) frozen0 = fz;
  else if (fz !== frozen0) frozenChanges.push(toIso(t));
  const ev = json(`${t}-event.json`)?.event ?? null;
  const sl = (json(`${t}-slate.json`)?.events ?? []).find((e) => e.providerEventId === EV) ?? null;
  if (!ev) { if (!lines.some((l) => l.t === t && l.name === "event" && l.mitigated === "challenge")) problems.push(`${toIso(t)} event envelope unreadable`); continue; }
  if (!sl) problems.push(`${toIso(t)} event absent from the slate envelope`);
  const c = ev.competitors ?? {};
  const row = { at: toIso(t), state: ev.state, phase: ev.period?.phase ?? null, period: ev.period?.number ?? null, clock: ev.period?.clock ?? null, score: `${c.away?.abbr ?? "?"} ${c.away?.score ?? "—"} – ${c.home?.abbr ?? "?"} ${c.home?.score ?? "—"}`, sourceUpdatedAt: ev.sourceUpdatedAt, fetchedAt: ev.fetchedAt };
  const players = Array.isArray(ev.playerStats) ? ev.playerStats.length : ev.playerStats && typeof ev.playerStats === "object" ? Object.keys(ev.playerStats).length : 0;
  if (players > maxPlayers) { maxPlayers = players; playersSeenAt ??= row.at; }
  if (sl && (sl.state !== ev.state || JSON.stringify(sl.competitors) !== JSON.stringify(ev.competitors))) problems.push(`${row.at} slate and event envelopes disagree (${sl.state} vs ${ev.state})`);
  if (ev.state === "PRE" && (c.away?.score != null || c.home?.score != null)) problems.push(`${row.at} a score is present before the game started`);
  const espn = json(`${t}-espn.json`);
  const ec = espn?.header?.competitions?.[0];
  if (ec) {
    const sc = Object.fromEntries((ec.competitors ?? []).map((x) => [x.homeAway, x.score == null ? null : Number(x.score)]));
    const ours = { home: c.home?.score ?? null, away: c.away?.score ?? null };
    const espnState = ec.status?.type?.state; // pre | in | post
    if (espnState !== "pre" && (sc.home !== ours.home || sc.away !== ours.away)) problems.push(`${row.at} score differs from ESPN at the same pass (ours ${ours.away}-${ours.home}, ESPN ${sc.away}-${sc.home}; envelope fetched ${ev.fetchedAt})`);
    row.espn = `${espnState ?? "?"} ${sc.away ?? "—"}-${sc.home ?? "—"}`;
  }
  const key = `${row.state}|${row.phase}|${row.period}|${row.score}`;
  if (key !== last) timeline.push(row);
  last = key;

}
const gaps = [];
for (let i = 1; i < stamps.length; i++) {
  const d = (Date.parse(toIso(stamps[i])) - Date.parse(toIso(stamps[i - 1]))) / 1000;
  const start = lines.find((l) => l.name === "start");
  const expected = Date.parse(toIso(stamps[i - 1])) >= Date.parse(start?.until ?? "2100-01-01") ? 1800 : start?.interval ?? 300;
  if (d > expected * 2 + 120) gaps.push(`${toIso(stamps[i - 1])} → ${toIso(stamps[i])} (${Math.round(d / 60)} min; expected ${Math.round(expected / 60)})`);
}
const shots = lines.filter((l) => String(l.name).startsWith("shot-"));
const sett = lines.filter((l) => l.name === "settlement");
const firstSettled = sett.find((l) => l.state === "settled");
const firstServed = sett.find((l) => l.served === "yes");
const shotFails = shots.filter((s) => !s.ok).concat(lines.filter((l) => l.name === "screenshots" && l.ok === false));
const overflow = shots.filter((s) => s.ok && s.horizontalOverflowPx > 0);
const broken = shots.filter((s) => s.ok && s.images?.broken > 0);
const states = new Set(timeline.map((r) => r.state));
const missingStates = ["PRE", "LIVE", "FINAL_PENDING_SETTLEMENT"].filter((s) => !states.has(s) && !(s === "FINAL_PENDING_SETTLEMENT" && (states.has("FINAL") || states.has("SETTLED"))));
const out = [];
out.push(`# Live capture report — ESPN ${EV} (SEA @ DEN)`, "", `Captures: ${stamps.length} (${stamps[0] ? toIso(stamps[0]) : "—"} → ${stamps.at(-1) ? toIso(stamps.at(-1)) : "—"}). Screenshots: ${shots.filter((s) => s.ok).length} ok, ${shotFails.length} failed.`, "");
out.push("## Lifecycle timeline (one row per change of state, period or score)", "", "| First seen | State | Phase | Period | Clock | Score | ESPN at same pass | sourceUpdatedAt |", "|---|---|---|---|---|---|---|---|");
for (const r of timeline) out.push(`| ${r.at} | ${r.state} | ${r.phase ?? ""} | ${r.period ?? ""} | ${r.clock ?? ""} | ${r.score} | ${r.espn ?? ""} | ${r.sourceUpdatedAt ?? ""} |`);
out.push("", "## Checks", "",
  `- States observed: ${[...states].join(" → ") || "none"}${missingStates.length ? ` · **NOT OBSERVED: ${missingStates.join(", ")}**` : ""}`,
  `- Canonical settlement on main: ${firstSettled ? `first seen ${toIso(firstSettled.t)} (commit ${firstSettled.settlementCommit.slice(0, 10)})` : "**NOT OBSERVED**"} · served by Production: ${firstServed ? `from ${toIso(firstServed.t)} (deploy ${firstServed.deployed.slice(0, 10)})` : "**NOT OBSERVED**"}`,
  `- Player stat rows: max ${maxPlayers}${playersSeenAt ? `, first at ${playersSeenAt}` : " · **NONE CAPTURED**"}`,
  `- Frozen forecast fingerprint: ${frozen0 == null ? "**never captured**" : frozenChanges.length ? `**CHANGED at ${frozenChanges.join(", ")}**` : "identical at every capture"}`,
  `- Horizontal overflow: ${overflow.length ? `**${overflow.map((s) => `${s.name}@${toIso(s.t)} ${s.horizontalOverflowPx}px`).join("; ")}**` : "none"}`,
  `- Broken visible images (logos/portraits): ${broken.length ? `**${broken.map((s) => `${s.name}@${toIso(s.t)} ×${s.images.broken}`).join("; ")}**` : "none"}`,
  `- Headshots/logos rendered (max per shot): ${Math.max(0, ...shots.map((s) => s.images?.headshots ?? 0))} headshots, ${Math.max(0, ...shots.map((s) => s.images?.logos ?? 0))} logos`,
  "", "## Missing or incomplete evidence", "");
const all = [...problems, ...gaps.map((g) => `capture gap ${g}`), ...shotFails.map((s) => `${s.t ? toIso(s.t) : ""} ${s.name} failed ${s.err ?? ""}`), ...(lines.some((l) => l.name === "finished") ? [] : ["capture did not record a clean finish (still running, or interrupted)"]), ...(firstSettled ? [] : ["canonical settlement never observed on main inside the window"]), ...(firstServed ? [] : ["the settled state was never observed in a Production deploy inside the window"]), ...(sett.some((l) => l.state === "unreadable") ? ["settlement file unreadable at some captures"] : [])];
out.push(...(all.length ? all.map((p) => `- ${p}`) : ["- none"]));
console.log(out.join("\n"));
