// Turns a capture folder into a lifecycle + gap report (Markdown on stdout). Read-only.
//   node report.mjs <captures-dir> [espnId,…]
// Events come from the capture's "start" line; the optional argument covers captures made before the kit took
// --events (the SEA@DEN 2026-10-15 capture), which is also inferred from its ESPN summaries when omitted.
//
// Tolerant by design: a captures.jsonl line that is not JSON is never a crash. The 2026-10-15 kit wrote
// `"http":000` for requests that got no response; such lines are REPAIRED for analysis and listed, and any line
// that still does not parse is listed verbatim (truncated).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("usage: node report.mjs <captures-dir> [espnId,…]"); process.exit(2); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OURS = ["slate", "event", "live-html", "game-html", "build-info"];
const REQS = [...OURS, "espn-summary"];

// ── lines ────────────────────────────────────────────────────────────────────────────────────────
const lines = [];
const malformed = [];
fs.readFileSync(path.join(dir, "captures.jsonl"), "utf8").split("\n").forEach((l, i) => {
  if (!l.trim()) return;
  try { lines.push(JSON.parse(l)); return; } catch { /* repaired below */ }
  const fixed = l.replace(/"(http|bytes)":0+(\d+)/g, '"$1":$2');
  try { const o = JSON.parse(fixed); lines.push({ ...o, repaired: true }); malformed.push({ line: i + 1, t: o.t, name: o.name, repaired: true }); }
  catch { malformed.push({ line: i + 1, repaired: false, text: l.slice(0, 140) }); }
});
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
const exists = (f) => fs.existsSync(path.join(dir, f));
const toIso = (t) => (/^\d{8}T\d{6}Z$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z` : t);
const ms = (t) => Date.parse(toIso(t));
const start = lines.find((l) => l.name === "start") ?? {};

// ── events ───────────────────────────────────────────────────────────────────────────────────────
let events = Array.isArray(start.events) ? start.events.map(String) : null;
if (!events && process.argv[3]) events = process.argv[3].split(",").filter(Boolean);
if (!events) {
  const f = fs.readdirSync(dir).find((x) => /-espn\.json$/.test(x));
  const id = f && readJson(f)?.header?.id;
  events = id ? [String(id)] : [];
}
if (!events.length) { console.error("no events: pass them as the second argument"); process.exit(2); }
const legacy = !Array.isArray(start.events); // one event, file names without the id
const fileFor = (t, kind, ev) => {
  const ext = kind === "frozen" ? "txt" : kind === "game" ? "html" : "json";
  const named = `${t}-${kind}-${ev}.${ext}`;
  return exists(named) || !legacy ? named : `${t}-${kind}.${ext}`;
};
const forEvent = (l, ev) => l.event === ev || (l.event == null && legacy);

// ── passes, connectivity and gaps ────────────────────────────────────────────────────────────────
const passLines = lines.filter((l) => l.name === "pass");
const passes = passLines.length
  ? passLines.map((p) => ({ t: p.t, phase: p.phase, active: p.active ?? [] }))
  : [...new Set(lines.filter((l) => l.name === "settlement").map((l) => l.t))].sort().map((t) => ({ t, phase: start.until && ms(t) >= Date.parse(start.until) ? "B" : "A", active: events }));
const reqsAt = new Map();
for (const l of lines) if (REQS.includes(l.name)) { if (!reqsAt.has(l.t)) reqsAt.set(l.t, []); reqsAt.get(l.t).push(l); }
const offline = passes.filter((p) => { const r = reqsAt.get(p.t) ?? []; return r.length > 0 && r.every((x) => !(x.http > 0)); }).map((p) => p.t);
const offlineSet = new Set(offline);
const gaps = [];
for (let i = 1; i < passes.length; i++) {
  const d = (ms(passes[i].t) - ms(passes[i - 1].t)) / 1000;
  const expected = passes[i - 1].phase === "B" ? start.phaseBInterval ?? 1800 : start.interval ?? 300;
  if (d > expected * 2 + 120) gaps.push(`${toIso(passes[i - 1].t)} → ${toIso(passes[i].t)} (${Math.round(d / 60)} min; expected ${Math.round(expected / 60)})`);
}
const longNaps = [];
for (let i = 1; i < passes.length; i++) {
  const d = (ms(passes[i].t) - ms(passes[i - 1].t)) / 1000;
  const expected = passes[i - 1].phase === "B" ? start.phaseBInterval ?? 1800 : start.interval ?? 300;
  if (d > expected * 1.2 + 60 && d <= expected * 2 + 120) longNaps.push(`${toIso(passes[i - 1].t)} → ${toIso(passes[i].t)} (${Math.round(d / 60)} min)`);
}

const problems = [];
const info = [];
if (malformed.length) {
  const rep = malformed.filter((m) => m.repaired);
  if (rep.length) problems.push(`${rep.length} malformed captures.jsonl line(s) — unquoted zero-padded \`"http":000\` (kit bug fixed 2026-10-16); repaired for this report: lines ${rep.map((m) => m.line).join(", ")}`);
  for (const m of malformed.filter((x) => !x.repaired)) problems.push(`captures.jsonl line ${m.line} unparseable, skipped: \`${m.text}\``);
}
if (offline.length) problems.push(`${offline.length} pass(es) got NO response from any host, ESPN included — local connectivity loss, not a site failure: ${offline.map(toIso).join(", ")}`);
const bad = lines.filter((l) => REQS.includes(l.name) && !offlineSet.has(l.t) && l.mitigated !== "challenge" && (l.http !== 200 || !(l.bytes > 0)));
for (const b of bad) problems.push(`${toIso(b.t)} ${b.name}${b.event && !legacy ? ` ${b.event}` : ""}: HTTP ${b.http}, ${b.bytes} bytes${b.error ? ` (${b.error})` : ""}`);
const challenged = lines.filter((l) => OURS.includes(l.name) && l.mitigated === "challenge");
if (challenged.length) problems.push(`${challenged.length} request(s) to our site met Vercel bot mitigation (x-vercel-mitigated: challenge) — VERCEL_BOT_CHALLENGE: absence of evidence for those passes, not a site failure (docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md); first ${toIso(challenged[0].t)}, last ${toIso(challenged.at(-1).t)}`);
const watchFails = lines.filter((l) => l.name === "settlement-watch" && l.ok === false);
if (watchFails.length) problems.push(`settlement watch failed on ${watchFails.length} pass(es) (see watch-errors.log): ${watchFails.map((l) => toIso(l.t)).join(", ")}`);

// ── ESPN-backed player-stat comparison (optional: needs the repo's live-prop-state module) ───────────
let statFor = null;
try { ({ statFor } = await import(pathToFileURL(path.resolve(process.env.GTP_REPO || path.resolve(HERE, "../../.."), "app/src/lib/sports/nfl/live-prop-state.mjs")).href)); } catch { /* reported below */ }

const shots = lines.filter((l) => String(l.name).startsWith("shot-"));
const shotFails = shots.filter((s) => !s.ok).concat(lines.filter((l) => l.name === "screenshots" && l.ok === false));
const overflow = shots.filter((s) => s.ok && s.horizontalOverflowPx > 0);
const broken = shots.filter((s) => s.ok && s.images?.broken > 0);

const out = [];
const title = legacy ? `ESPN ${events[0]}` : `${events.length} event(s): ${events.join(", ")}`;
out.push(`# Live capture report — ${title}`, "",
  `Passes: ${passes.length} (${passes[0] ? toIso(passes[0].t) : "—"} → ${passes.at(-1) ? toIso(passes.at(-1).t) : "—"}); with requests: ${passes.filter((p) => reqsAt.has(p.t)).length}; offline: ${offline.length}. Settle date (ET): ${start.settleDate ?? "—"}. Screenshots: ${shots.filter((s) => s.ok).length} ok, ${shotFails.length} failed.`, "");

for (const ev of events) {
  const evProblems = [];
  const timeline = [];
  let last = null;
  let frozen0 = null, forecast0 = null, forecastGoneAt = null;
  const frozenChanges = [], forecastChanges = [];
  let receipts0 = null;
  const preRevisions = { forecast: 0, board: 0 };
  let postKickoffPasses = 0;
  const newReceipts = new Set();
  let kickoffMs = null;
  let maxPlayers = 0, playersSeenAt = null, statPasses = 0, statCompared = 0, statMismatch = 0;
  const finalMismatch = [];
  const lp = [];
  const evPasses = passes.filter((p) => (p.active ?? []).map(String).includes(ev) && reqsAt.has(p.t) && !offlineSet.has(p.t));
  for (const { t } of evPasses) {
    const espn = readJson(fileFor(t, "espn", ev));
    const ec = espn?.header?.competitions?.[0];
    if (ec?.date && kickoffMs == null) kickoffMs = Date.parse(String(ec.date).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
    // frozen fingerprint
    const fzFile = fileFor(t, "frozen", ev);
    const fzLines = exists(fzFile) ? fs.readFileSync(path.join(dir, fzFile), "utf8").split("\n").filter(Boolean) : null;
    if (fzLines) {
      const fc = fzLines.find((l) => l.startsWith("forecast ")) ?? "forecast UNREADABLE";
      const boards = fzLines.filter((l) => l.startsWith("board ")).join("\n");
      const rc = fzLines.filter((l) => l.startsWith("receipt ")).map((l) => l.slice(8));
      const lpl = fzLines.find((l) => l.startsWith("liveprops "));
      if (lpl && lpl !== "liveprops none") { try { lp.push({ t, ...JSON.parse(lpl.slice(10)) }); } catch { /* ignore */ } }
      // Before kickoff the forecast may still be revised: the baseline ROLLS until the first pass at/after kickoff,
      // and only a change after that is a finding. A kickoff we cannot read counts every pass as post-kickoff.
      const pre = kickoffMs != null && ms(t) < kickoffMs;
      if (!pre) postKickoffPasses++;
      if (/UNREADABLE/.test(fc)) evProblems.push(`${toIso(t)} forecast fingerprint UNREADABLE`);
      else if (/ABSENT/.test(fc)) {
        if (forecast0 && !pre) forecastGoneAt ??= toIso(t);
        else if (!forecast0) evProblems.push(`${toIso(t)} forecast ABSENT from forecasts/latest.json before it was ever seen`);
      } else if (forecast0 == null || pre) { if (forecast0 != null && fc !== forecast0) preRevisions.forecast++; forecast0 = fc; }
      else if (fc !== forecast0) forecastChanges.push(toIso(t));
      if (frozen0 == null || pre) { if (frozen0 != null && boards !== frozen0) preRevisions.board++; frozen0 = boards; }
      else if (boards !== frozen0) frozenChanges.push(toIso(t));
      if (receipts0 == null || pre) receipts0 = new Set(rc);
      else for (const r of rc) if (!receipts0.has(r)) newReceipts.add(r);
    } else evProblems.push(`${toIso(t)} frozen fingerprint missing`);

    const envelope = readJson(fileFor(t, "event", ev));
    const e = envelope?.event ?? null;
    if (!e) {
      if (!lines.some((l) => l.t === t && l.name === "event" && forEvent(l, ev) && l.mitigated === "challenge")) evProblems.push(`${toIso(t)} event envelope unreadable`);
      continue;
    }
    const sl = (readJson(`${t}-slate.json`)?.events ?? []).find((x) => String(x.providerEventId) === ev) ?? null;
    if (!sl) evProblems.push(`${toIso(t)} event absent from the slate envelope`);
    const c = e.competitors ?? {};
    const row = { at: toIso(t), state: e.state, phase: e.period?.phase ?? null, period: e.period?.number ?? null, clock: e.period?.clock ?? null, score: `${c.away?.abbr ?? "?"} ${c.away?.score ?? "—"} – ${c.home?.abbr ?? "?"} ${c.home?.score ?? "—"}`, sourceUpdatedAt: e.sourceUpdatedAt, fetchedAt: e.fetchedAt };
    if (sl && (sl.state !== e.state || JSON.stringify(sl.competitors) !== JSON.stringify(e.competitors))) evProblems.push(`${row.at} slate and event envelopes disagree (${sl.state} vs ${e.state})`);
    if (e.state === "PRE" && (c.away?.score != null || c.home?.score != null)) evProblems.push(`${row.at} a score is present before the game started`);
    const espnState = ec?.status?.type?.state; // pre | in | post
    if (ec) {
      const sc = Object.fromEntries((ec.competitors ?? []).map((x) => [x.homeAway, x.score == null || x.score === "" ? null : Number(x.score)]));
      const ours = { home: c.home?.score ?? null, away: c.away?.score ?? null };
      if (espnState !== "pre" && (sc.home !== ours.home || sc.away !== ours.away)) evProblems.push(`${row.at} score differs from ESPN at the same pass (ours ${ours.away}-${ours.home}, ESPN ${sc.away}-${sc.home}; envelope fetched ${e.fetchedAt})`);
      row.espn = `${espnState ?? "?"} ${sc.away ?? "—"}-${sc.home ?? "—"}`;
    }
    // envelope-level player stats (players=1) against ESPN's box score at the same pass
    const ps = Array.isArray(e.playerStats) ? e.playerStats : [];
    if (ps.length) {
      statPasses++;
      if (ps.length > maxPlayers) { maxPlayers = ps.length; playersSeenAt ??= row.at; }
      if (statFor && espn) {
        for (const s of ps) {
          const id = String(s.playerId ?? "").replace(/^nfl-athlete-/, "");
          if (!id || !s.market) continue;
          const truth = statFor(espn, id, s.market);
          statCompared++;
          if (truth !== (typeof s.value === "number" ? s.value : null)) {
            statMismatch++;
            if (e.state !== "LIVE" && espnState === "post") finalMismatch.push(`${row.at} ${s.playerId} ${s.market}: ours ${s.value}, ESPN ${truth}`);
          }
        }
      }
    }
    const key = `${row.state}|${row.phase}|${row.period}|${row.score}`;
    if (key !== last) timeline.push(row);
    last = key;
  }

  // settlement lines (new: per event objects; legacy: state/served strings)
  const sett = lines.filter((l) => l.name === "settlement" && forEvent(l, ev));
  const first = (pred) => sett.find(pred);
  const lastS = sett.at(-1) ?? null;
  const states = new Set(timeline.map((r) => r.state));
  const missingStates = ["PRE", "LIVE", "FINAL_PENDING_SETTLEMENT"].filter((s) => !states.has(s) && !(s === "FINAL_PENDING_SETTLEMENT" && (states.has("FINAL") || states.has("SETTLED"))));
  const lpHashes = [...new Set(lp.map((x) => x.frozenHash))];
  const evShots = shots.filter((s) => s.event === ev || (legacy && String(s.name).startsWith("shot-game")));

  out.push(`## ${legacy ? "" : `${ev} · `}${timeline[0]?.score?.replace(/ —/g, "") ?? ev}`, "", "### Lifecycle timeline (one row per change of state, period or score)", "",
    "| First seen | State | Phase | Period | Clock | Score | ESPN at same pass | sourceUpdatedAt |", "|---|---|---|---|---|---|---|---|");
  for (const r of timeline) out.push(`| ${r.at} | ${r.state} | ${r.phase ?? ""} | ${r.period ?? ""} | ${r.clock ?? ""} | ${r.score} | ${r.espn ?? ""} | ${r.sourceUpdatedAt ?? ""} |`);
  out.push("", "### Checks", "",
    `- Passes covering this event: ${evPasses.length}`,
    `- States observed: ${[...states].join(" → ") || "none"}${missingStates.length ? ` · **NOT OBSERVED: ${missingStates.join(", ")}**` : ""}`,
    `- Envelope player stats (players=1): ${maxPlayers ? `max ${maxPlayers} rows, first at ${playersSeenAt}, on ${statPasses} pass(es)` : "**NONE CAPTURED**"}${statFor ? (statCompared ? ` · vs ESPN box at the same pass: ${statCompared - statMismatch}/${statCompared} equal (in-game differences are timing — gateway cache vs ESPN fetch — and informational; final-state differences are listed as problems)` : "") : " · ESPN comparison unavailable (live-prop-state module not importable)"}`,
    `- Passes at/after kickoff: ${postKickoffPasses}${postKickoffPasses ? "" : " — the frozen checks below have nothing to compare yet"}`,
    `- Frozen forecast (forecasts/latest.json): ${forecast0 == null ? "**never captured**" : forecastChanges.length ? `**CHANGED at ${forecastChanges.join(", ")}**` : "unchanged from kickoff while present"}${preRevisions.forecast ? ` (${preRevisions.forecast} pre-kickoff revision(s) seen, expected)` : ""}${forecastGoneAt ? ` · rolled off latest.json at ${forecastGoneAt} (after kickoff; the record stays in the receipts and the board)` : ""}`,
    `- Player board hash: ${frozen0 == null ? "**never captured**" : frozenChanges.length ? `**CHANGED at ${frozenChanges.join(", ")}**` : "identical at every pass from kickoff"}${preRevisions.board ? ` (${preRevisions.board} pre-kickoff revision(s))` : ""} · receipts added after kickoff: ${newReceipts.size ? `**${[...newReceipts].join(", ")}**` : "none"}`,
    `- Live-props artifact (git): ${lp.length ? `first ${toIso(lp[0].t)} · phases ${[...new Set(lp.map((x) => x.phase))].join(" → ")} · finality ${[...new Set(lp.map((x) => x.finality))].join(" → ")} · last row states ${JSON.stringify(lp.at(-1).settlement)} · frozen values ${lpHashes.length === 1 ? "unchanged across all passes" : `**CHANGED (${lpHashes.length} distinct)**`}` : "**never on main during the window**"}`);
  if (sett.length && sett[0].market !== undefined) {
    const prov = first((l) => l.provisionalCommit), canon = first((l) => l.canonicalCommit);
    const sp = first((l) => l.servedProvisional), sc = first((l) => l.servedCanonical);
    out.push(
      `- Provisional final on main: ${prov ? `first seen ${toIso(prov.t)} (commit ${prov.provisionalCommit.slice(0, 10)})` : "**NOT OBSERVED**"} · served: ${sp ? `build-info at ${toIso(sp.t)}` : "build-info never"}${lastS?.ghServedProvisional ? ` · GitHub Production deployment ${lastS.ghServedProvisional.id} READY ${lastS.ghServedProvisional.at} (±60 s)` : ""}`,
      `- Canonical settlement on main: ${canon ? `first seen ${toIso(canon.t)} (commit ${canon.canonicalCommit.slice(0, 10)})` : "**NOT OBSERVED**"} · served: ${sc ? `build-info at ${toIso(sc.t)}` : "build-info never"}${lastS?.ghServedCanonical ? ` · GitHub Production deployment ${lastS.ghServedCanonical.id} READY ${lastS.ghServedCanonical.at} (±60 s)` : ""}`,
      `- Prop-settlement ledger (last pass): ${lastS?.ledger ? `${lastS.ledger.rows} rows · ${lastS.ledger.canonical} canonical / ${lastS.ledger.provisional} provisional · ${lastS.ledger.observed} observed / ${lastS.ledger.noMeasurement} no-measurement${lastS.ledger.noMeasurementWithValue ? ` · **${lastS.ledger.noMeasurementWithValue} no-measurement row(s) carry a value**` : ""} · ${lastS.ledger.decided} decided` : "file not on main"}`,
      `- Market paper record (settlement/<date>.json): ${lastS?.market ?? "—"}${String(lastS?.market).includes("NO_TARGETS") ? " — no market targets were pinned (odds credit ceiling since 2026-10-11), so this record cannot settle this event" : ""}`);
    if (!canon) evProblems.push("canonical settlement never observed on main inside the window");
    else if (!sc && !lastS?.ghServedCanonical) evProblems.push("the canonical settlement was never observed served by Production inside the window");
    if (lastS?.ledger?.noMeasurementWithValue) evProblems.push("a NO_MEASUREMENT ledger row carries a value — an unavailable stat must never be stored as a number");
  } else {
    const firstSettled = sett.find((l) => l.state === "settled");
    const firstServed = sett.find((l) => l.served === "yes");
    out.push(`- Market paper record (legacy watch): ${firstSettled ? `settled at ${toIso(firstSettled.t)}` : `**never settled** (last: ${lastS?.state ?? "—"})`} · served: ${firstServed ? toIso(firstServed.t) : "**NOT OBSERVED**"} — the legacy watch read only the market paper record, not the prop settlement`);
    if (!firstServed) evProblems.push("legacy settlement watch never saw a served settlement (it watched the market paper record only)");
  }
  out.push(`- Game-page screenshots: ${evShots.filter((s) => s.ok).length} ok, ${evShots.filter((s) => !s.ok).length} failed`, "");
  for (const m of finalMismatch) evProblems.push(`final player stat differs from ESPN: ${m}`);
  if (forecastChanges.length) evProblems.push("frozen forecast changed during the window — investigate before any acceptance");
  if (frozenChanges.length) evProblems.push("player board changed during the window — investigate before any acceptance");
  if (lpHashes.length > 1) evProblems.push("frozen player-prop values changed during the window — investigate before any acceptance");
  if (!lp.length) info.push(`${ev}: no live-props artifact on main during the window (in-game player progress rests on the gateway envelopes)`);
  out.push("### Missing or incomplete evidence (this event)", "", ...(evProblems.length ? evProblems.map((p) => `- ${p}`) : ["- none"]), "");
}

out.push("## Site-wide checks", "",
  `- Horizontal overflow: ${overflow.length ? `**${overflow.map((s) => `${s.name}${s.event ? `/${s.event}` : ""}@${toIso(s.t)} ${s.horizontalOverflowPx}px`).join("; ")}**` : "none"}`,
  `- Broken visible images (logos/portraits): ${broken.length ? `**${broken.map((s) => `${s.name}${s.event ? `/${s.event}` : ""}@${toIso(s.t)} ×${s.images.broken}`).join("; ")}**` : "none"}`,
  `- Headshots/logos rendered (max per shot): ${Math.max(0, ...shots.map((s) => s.images?.headshots ?? 0))} headshots, ${Math.max(0, ...shots.map((s) => s.images?.logos ?? 0))} logos`,
  "", "## Missing or incomplete evidence (capture-wide)", "");
const stoppedLine = lines.find((l) => l.name === "stopped");
const finished = lines.some((l) => l.name === "finished");
const lastPass = passes.at(-1);
const ending = finished ? [] : stoppedLine
  ? [`capture stopped by SIG${stoppedLine.signal} at ${stoppedLine.t} after ${stoppedLine.captures} pass(es)`]
  : [`capture did not record a finish or a signal — still running, or ended by SIGKILL / sleep / shutdown; last pass ${lastPass ? toIso(lastPass.t) : "—"}${start.settleUntil ? ` (planned settle watch until ${start.settleUntil})` : ""}`];
const all = [...problems, ...gaps.map((g) => `capture gap ${g}`), ...longNaps.map((g) => `late pass ${g} (machine sleep or slow requests; not a gap)`), ...shotFails.map((s) => `${s.t ? toIso(s.t) : ""} ${s.name}${s.event ? `/${s.event}` : ""} failed${offlineSet.has(s.t) ? " (offline pass)" : ""} ${String(s.err ?? "").split("\n")[0]}`), ...ending];
out.push(...(all.length ? all.map((p) => `- ${p}`) : ["- none"]));
if (info.length) out.push("", "## Notes", "", ...info.map((p) => `- ${p}`));
console.log(out.join("\n"));
