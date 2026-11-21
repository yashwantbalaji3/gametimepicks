/**
 * MEASUREMENT_NOT_PUBLISHED — who on a frozen v0.1 slate is an active rotation player with NO player projection, and why.
 * NBA REGULAR SEASON — RESEARCH · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 *   node scripts/nba/research/measure-nba-projection-coverage.mjs --dates 2026-10-20,2026-10-21 [--out-dir <dir outside the repo>]
 *
 * Inputs are exactly the receipts' (docs/nba/NBA_PROJECTION_COVERAGE_GAP_2026-10-22.md §1):
 *   rosters / injuries = the git blobs of data/internal/research/{nba/rosters,injuries/nba}/latest.json whose sha256 equal the
 *                        receipt's; every v0.1 game must re-derive its committed payloadSha256 from them, or this REFUSES;
 *   history            = the corpus box scores (v0.1's whole universe, dataRule corpus-v1);
 *   rookie role signal = the fetched 2026-27 PRESEASON box scores captured at or before the freeze (knowable pre-tip;
 *                        v0.1 never reads them).
 * No outcome of 2026-10-20/21 is read: "active rotation" is defined from pre-freeze facts only (ROTATION_RULES below).
 * The v0.3 rows are a DESCRIPTIVE replay (no v0.3 receipt exists for either date), and so are the rows of the unarmed
 * v0.4 candidate (CANDIDATE_FAMILIES) — never forward evidence, never a sample.
 *
 * Writes only to stdout, or a JSON file in --out-dir, which must be outside the repository. Read-only on git history.
 * No network. Changes nothing any family reads.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact, FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { stampReceipt, canonicalJson } from "../../../src/lib/sports/nba/forecast-receipt.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { rosterForTeam } from "../../../src/lib/sports/nba/roster-contract.mjs";
import { availabilityFromInjuries } from "../../../src/lib/sports/nba/minutes-model.mjs";
import { inPopulation } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const DATES = (arg("--dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
const OUT = arg("--out-dir") ? path.resolve(arg("--out-dir")) : null;
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
if (!DATES.length) refuse("--dates YYYY-MM-DD[,YYYY-MM-DD] required");
if (OUT && (OUT === ROOT || OUT.startsWith(ROOT + path.sep))) refuse(`--out-dir ${OUT} is inside the repository`);

/** The pilot report's 11 priced players with no official projection (names only; no odds data is read here). */
const PILOT_NAMES = ["Cameron Boozer", "Keaton Wagler", "Darius Acuff Jr.", "Yaxel Lendeborg", "Darryn Peterson", "Caleb Wilson", "Mikel Brown Jr.", "Kyrie Irving", "Fred VanVleet", "Damian Lillard", "Tyrese Haliburton"];

/**
 * Pre-tip "active rotation" rules. A rostered player not ruled Out is ROTATION when
 *   history:  his most recent corpus REGULAR season (phase 2 + cup final, any team) with >= minApps appearances
 *             averaged >= minMpg per appearance (lastSeasonOnly: that season must be 2025-26), OR
 *   rookie:   (usePreseason) he has no such season and his 2026-27 preseason box scores captured before the freeze
 *             show >= 2 appearances averaging >= minMpg.
 * PRIMARY = { minMpg 15, minApps 10, usePreseason true, lastSeasonOnly false }. The others are the sensitivity grid.
 */
const ROTATION_RULES = [
  { id: "PRIMARY mpg>=15 apps>=10 +preseason", minMpg: 15, minApps: 10, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=10 apps>=10 +preseason", minMpg: 10, minApps: 10, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=20 apps>=10 +preseason", minMpg: 20, minApps: 10, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=25 apps>=10 +preseason", minMpg: 25, minApps: 10, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=15 apps>=20 +preseason", minMpg: 15, minApps: 20, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=15 apps>=5 +preseason", minMpg: 15, minApps: 5, usePreseason: true, lastSeasonOnly: false },
  { id: "mpg>=15 apps>=10 history-only", minMpg: 15, minApps: 10, usePreseason: false, lastSeasonOnly: false },
  { id: "mpg>=15 apps>=10 2025-26-only +preseason", minMpg: 15, minApps: 10, usePreseason: true, lastSeasonOnly: true },
  { id: "every rostered non-Out player", all: true },
];
const PRIOR_SEASON = 2026; // the corpus label of 2025-26, the season v0.1's window reads (seasonUsed on every side)

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f))) : []);
const fileSha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function blob(rel, want) {
  const commits = execFileSync("git", ["log", "--format=%H", "-n", "400", "--", rel], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const c of commits) for (const ref of [c, `${c}^`]) {
    let buf;
    try { buf = execFileSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch { continue; }
    if (fileSha(buf) === want) return { ref: execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim(), text: buf.toString("utf8") };
  }
  return null;
}
const normName = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const r1 = (x) => (x == null ? null : Number(x.toFixed(1)));

const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));

/** Corpus history per athlete (every phase), the only history v0.1 can see. */
const hist = new Map();
const nameToIds = new Map();
for (const d of corpusBox) {
  if (!d?.boxscoreAvailable) continue;
  for (const p of d.players ?? []) {
    if (p?.providerAthleteId == null) continue;
    const id = String(p.providerAthleteId);
    let h = hist.get(id);
    if (!h) { h = { id, name: p.name ?? null, rows: 0, played: 0, regBySeason: {}, anyBySeason: {}, dnpBySeason: {}, lastTeamBySeason: {} }; hist.set(id, h); }
    h.rows += 1;
    const key = normName(p.name); if (key) { if (!nameToIds.has(key)) nameToIds.set(key, new Set()); nameToIds.get(key).add(id); }
    if (p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes <= 0) { if (d.phase !== 1) h.dnpBySeason[d.season] = (h.dnpBySeason[d.season] ?? 0) + 1; continue; }
    h.played += 1;
    if (d.phase !== 1) { h.anyBySeason[d.season] = (h.anyBySeason[d.season] ?? 0) + 1; h.lastTeamBySeason[d.season] = String(p.providerTeamId); }
    if (inPopulation(d.phase, "regular")) { const s = (h.regBySeason[d.season] ??= { apps: 0, minutes: 0 }); s.apps += 1; s.minutes += p.minutes; }
  }
}

function preseasonAt(now) {
  const t = Date.parse(now);
  const m = new Map();
  for (const d of fetchedBox) {
    if (d?.phase !== 1 || !d.boxscoreAvailable || !(Date.parse(d.capturedAt ?? "") <= t) || !(Date.parse(d.dateUtc) < t)) continue;
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes <= 0) continue;
      const s = (m.get(String(p.providerAthleteId)) ?? { apps: 0, minutes: 0, starts: 0, teams: new Set() });
      s.apps += 1; s.minutes += p.minutes; s.starts += p.starter ? 1 : 0; s.teams.add(String(p.providerTeamId)); m.set(String(p.providerAthleteId), s);
    }
  }
  return m;
}

function roleFacts(id, pre) {
  const h = hist.get(id);
  const seasons = Object.keys(h?.regBySeason ?? {}).map(Number).sort((a, b) => b - a);
  const ps = pre.get(id) ?? null;
  return {
    seasons: seasons.map((s) => ({ season: s, apps: h.regBySeason[s].apps, mpg: r1(h.regBySeason[s].minutes / h.regBySeason[s].apps) })),
    preseason: ps ? { apps: ps.apps, mpg: r1(ps.minutes / ps.apps), starts: ps.starts } : null,
  };
}
function isRotation(rule, facts) {
  if (rule.all) return true;
  const qual = facts.seasons.find((s) => s.apps >= rule.minApps);
  if (qual && (!rule.lastSeasonOnly || qual.season === PRIOR_SEASON)) return qual.mpg >= rule.minMpg;
  if (qual && rule.lastSeasonOnly) return false;
  if (!rule.usePreseason) return false;
  return !!facts.preseason && facts.preseason.apps >= 2 && facts.preseason.mpg >= rule.minMpg;
}

/**
 * Cause of a missing v0.1 projection for a rostered, not-Out player (doc §2 gives the file:line of each).
 *   a-rookie                 no corpus box-score row with minutes in any phase, roster experienceYears 0
 *                            (a corpus PRESEASON exhibition row, e.g. an overseas club's player, is not NBA history)
 *   b-returner               corpus minutes in 2023-24/2024-25 but none in 2025-26 (the season v0.1's window reads)
 *   c-no-corpus-veteran      no corpus minutes, but the roster lists NBA experience: a two-way / G League player or an id
 *                            the corpus does not hold — not separable from committed data (two-way is not captured)
 *   c-mapping                minutes in 2025-26 exist for this id, or a same-name corpus athlete exists under another id
 *   c-zero-minutes           modelled at 0 expected minutes (prepareRoster drops expectedMinutes <= 0)
 */
function cause(id, rosterPlayer, gatedRow, historyBasis = null) {
  const h = hist.get(id);
  const sameNameOtherIds = [...(nameToIds.get(normName(rosterPlayer.displayName)) ?? [])].filter((x) => x !== id);
  if (gatedRow && gatedRow.minutesState === "MODELLED") return { cause: "c-zero-minutes", detail: `expectedMinutes ${gatedRow.expectedMinutes}` };
  if (sameNameOtherIds.length) return { cause: "c-mapping", detail: `same-name corpus athlete id(s) ${sameNameOtherIds.join(",")}` };
  const nbaSeasons = Object.keys(h?.anyBySeason ?? {}).map(Number);
  if (!nbaSeasons.length) {
    const pre = h?.played ? `; corpus preseason-only rows ${h.played}` : "";
    return (rosterPlayer.experienceYears ?? 0) === 0 ? { cause: "a-rookie", detail: `experienceYears ${rosterPlayer.experienceYears}${pre}` } : { cause: "c-no-corpus-veteran", detail: `experienceYears ${rosterPlayer.experienceYears}${pre}` };
  }
  if (!h.anyBySeason[PRIOR_SEASON]) {
    const last = Math.max(...nbaSeasons);
    return { cause: "b-returner", detail: `last corpus season ${last}, last team ${h.lastTeamBySeason[last]}; 2025-26 non-preseason rows: 0 played, ${h.dnpBySeason[PRIOR_SEASON] ?? 0} DNP; pool historyBasis ${historyBasis}` };
  }
  return { cause: "c-mapping", detail: `2025-26 appearances ${h.anyBySeason[PRIOR_SEASON]} under this id but no gated row` };
}

const out = { marker: "MEASUREMENT_NOT_PUBLISHED", dataClass: "PRIVATE_RESEARCH", productEligible: false, rules: ROTATION_RULES, dates: {} };
for (const date of DATES) {
  const doc = readJson(path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`));
  const byFreeze = new Map();
  for (const g of doc.games) { const k = g.receipt?.generatedAt; if (!k) refuse(`${date} ${g.providerEventId}: no receipt`); if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
  const players = [];
  const freezes = [];
  for (const [now, games] of byFreeze) {
    const ri = games[0].receipt.inputs;
    if (games.some((g) => canonicalJson(g.receipt.inputs.rosters) !== canonicalJson(ri.rosters) || canonicalJson(g.receipt.inputs.injuries) !== canonicalJson(ri.injuries))) refuse(`${date} @ ${now}: one instant, different inputs`);
    const rb = blob("data/internal/research/nba/rosters/latest.json", ri.rosters.sha256);
    const ib = blob("data/internal/research/injuries/nba/latest.json", ri.injuries.sha256);
    if (!rb || !ib) refuse(`${date} @ ${now}: no git blob for the receipt's ${!rb ? "rosters" : "injuries"} sha256`);
    const rosters = JSON.parse(rb.text), injuries = JSON.parse(ib.text).entries ?? null;
    const scheduleRows = games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: g.seasonType, neutralSite: g.neutralSite, venue: g.venue, home: { abbr: g.home.abbr, name: g.home.name, providerTeamId: g.home.providerTeamId }, away: { abbr: g.away.abbr, name: g.away.name, providerTeamId: g.away.providerTeamId } }));
    const common = { date, now, scheduleRows, corpusRows: corpus.rows, injuries, rosters, simulations: games[0].forecast.simulations };
    const v01 = buildForecastArtifact({ ...common, boxscores: corpusBox, family: "v0.1" }).artifact;
    for (const g of v01.games) {
      const stored = games.find((x) => x.providerEventId === g.providerEventId);
      const st = stampReceipt(g, { family: "v0.1", modelVersion: v01.modelVersion, now, inputs: stored.receipt.inputs });
      if (st.receipt.payloadSha256 !== stored.receipt.payloadSha256) refuse(`${date} ${g.providerEventId}: v0.1 rebuild does not re-derive the committed payloadSha256`);
    }
    const fold = foldBoxscores(corpusBox, fetchedBox, { now });
    const v03 = buildForecastArtifact({ ...common, boxscores: fold.docs, family: "v0.3" }).artifact;
    const v04 = buildForecastArtifact({ ...common, boxscores: fold.docs, family: "v0.4" }).artifact; // CANDIDATE, NOT ARMED: replay only
    const pre = preseasonAt(now);
    freezes.push({ now, games: games.length, v01PayloadsReDerived: games.length, rostersBlob: rb.ref, injuriesBlob: ib.ref, preseasonAthletesWithMinutes: pre.size });
    for (const stored of games) {
      const g3 = v03.games.find((x) => x.providerEventId === stored.providerEventId);
      const g4 = v04.games.find((x) => x.providerEventId === stored.providerEventId);
      for (const side of ["home", "away"]) {
        const teamId = String(stored[side].providerTeamId);
        const team = rosterForTeam(rosters, teamId);
        const projected1 = new Set(stored.forecast.players[side].map((p) => p.providerAthleteId));
        const projected3 = new Set((g3?.forecast.players[side] ?? []).map((p) => p.providerAthleteId));
        const by3 = new Map((g3?.forecast.players[side] ?? []).map((p) => [p.providerAthleteId, p]));
        const by4 = new Map((g4?.forecast.players[side] ?? []).map((p) => [p.providerAthleteId, p]));
        const lagged4 = new Set((g4?.[side]?.pool?.laggedPrior ?? []).map((x) => x.providerAthleteId));
        const pool1 = stored[side].pool;
        for (const rp of team.players) {
          const id = String(rp.providerAthleteId);
          const avail = availabilityFromInjuries(injuries, teamId, id);
          const facts = roleFacts(id, pre);
          const isOut = avail.availability === "out";
          const row = { date, freeze: now, eventId: stored.providerEventId, team: stored[side].abbr, providerAthleteId: id, name: rp.displayName, experienceYears: rp.experienceYears ?? null,
            injuryStatus: avail.injuryStatus, out: isOut, v01Projected: projected1.has(id), v03ReplayProjected: projected3.has(id), facts,
            v04ReplayProjected: by4.has(id), v04Lagged: lagged4.has(id), teamHasLagged: lagged4.size > 0,
            // the v0 draw model consumes one RNG stream per game (home, then away), so a changed pool on one side moves the other side's draws too
            gameHasLagged: ["home", "away"].some((sd) => (g4?.[sd]?.pool?.laggedPrior ?? []).length > 0),
            v03: by3.has(id) ? { expectedMinutes: by3.get(id).expectedMinutes, ptsP50: by3.get(id).pts?.p50 ?? null } : null,
            v04: by4.has(id) ? { expectedMinutes: by4.get(id).expectedMinutes, ptsP50: by4.get(id).pts?.p50 ?? null } : null,
            rotation: Object.fromEntries(ROTATION_RULES.map((r) => [r.id, isRotation(r, facts)])) };
          if (!isOut && !row.v01Projected) {
            const ins = (pool1.insufficientHistory ?? []).find((x) => x.providerAthleteId === id);
            const c = cause(id, rp, ins ? null : { minutesState: "MODELLED", expectedMinutes: 0 }, ins?.historyBasis ?? null);
            row.cause = c.cause; row.causeDetail = c.detail;
          } else if (isOut) row.cause = "d-out";
          if (!isOut && !row.v03ReplayProjected) row.v03Cause = cause(id, rp, (g3?.[side]?.pool?.insufficientHistory ?? []).some((x) => x.providerAthleteId === id) ? null : { minutesState: "MODELLED", expectedMinutes: 0 }).cause;
          players.push(row);
        }
      }
    }
  }
  const tally = {};
  for (const rule of ROTATION_RULES) {
    const pick = players.filter((p) => p.rotation[rule.id] || p.out);
    const rot = players.filter((p) => !p.out && p.rotation[rule.id]);
    const outRot = players.filter((p) => p.out && (rule.all || isRotation(rule, p.facts)));
    const by = (xs, k) => xs.reduce((m, p) => ((m[p[k] ?? "projected"] = (m[p[k] ?? "projected"] ?? 0) + 1), m), {});
    tally[rule.id] = { activeRotation: rot.length, v01Projected: rot.filter((p) => p.v01Projected).length, v01NoProjection: by(rot.filter((p) => !p.v01Projected), "cause"),
      v03ReplayNoProjection: by(rot.filter((p) => !p.v03ReplayProjected), "v03Cause"), v04ReplayNoProjection: by(rot.filter((p) => !p.v04ReplayProjected), "v03Cause"), outWouldBeRotation: outRot.length, considered: pick.length };
  }
  // v0.4 vs v0.3 on the projection side only (no outcome): the lagged athletes, and their teammates' minutes shift.
  const mates = players.filter((p) => p.teamHasLagged && !p.v04Lagged && p.v03 && p.v04).map((p) => p.v04.expectedMinutes - p.v03.expectedMinutes).sort((a, b) => a - b);
  const opp = players.filter((p) => p.gameHasLagged && !p.teamHasLagged && p.v03 && p.v04);
  const others = players.filter((p) => !p.gameHasLagged && p.v03 && p.v04);
  const v04Effect = {
    lagged: players.filter((p) => p.v04Lagged).map((p) => ({ team: p.team, name: p.name, out: p.out, v04: p.v04, primaryRotation: p.rotation[ROTATION_RULES[0].id] })),
    teammatesOfLagged: { n: mates.length, medianMinutesShift: mates.length ? r1(mates[Math.floor((mates.length - 1) / 2)]) : null, minShift: mates.length ? r1(mates[0]) : null },
    opponentsMinutesIdentical: opp.every((p) => p.v03.expectedMinutes === p.v04.expectedMinutes), opponentsPtsP50Changed: opp.filter((p) => p.v03.ptsP50 !== p.v04.ptsP50).length, opponentsN: opp.length,
    otherGamesIdentical: others.every((p) => p.v03.expectedMinutes === p.v04.expectedMinutes && p.v03.ptsP50 === p.v04.ptsP50), otherGamesN: others.length,
  };
  const all = { rostered: players.length, out: players.filter((p) => p.out).length, notOut: players.filter((p) => !p.out).length,
    v01Projected: players.filter((p) => p.v01Projected).length, v01NoProjectionNotOut: players.filter((p) => !p.out && !p.v01Projected).length,
    v03ReplayProjected: players.filter((p) => p.v03ReplayProjected).length };
  const pilot = date === "2026-10-21" ? PILOT_NAMES.map((n) => { const p = players.find((x) => normName(x.name) === normName(n)); return p ? { name: n, team: p.team, id: p.providerAthleteId, experienceYears: p.experienceYears, out: p.out, injuryStatus: p.injuryStatus, v01Projected: p.v01Projected, cause: p.cause ?? null, causeDetail: p.causeDetail ?? null, v03ReplayProjected: p.v03ReplayProjected, v03Cause: p.v03Cause ?? null, primaryRotation: p.rotation[ROTATION_RULES[0].id], facts: p.facts } : { name: n, notOnRoster: true }; }) : null;
  out.dates[date] = { freezes, all, tally, v04Effect, noProjection: players.filter((p) => !p.out && !p.v01Projected), pilot, players };
}

for (const [d, s] of Object.entries(out.dates)) {
  console.log(`\n=== ${d} · freezes ${s.freezes.map((f) => `${f.now} (${f.games} games, v0.1 re-derived ${f.v01PayloadsReDerived}, preseason athletes ${f.preseasonAthletesWithMinutes})`).join(" · ")}`);
  console.log(`all rostered: ${JSON.stringify(s.all)}`);
  for (const [k, t] of Object.entries(s.tally)) console.log(`  ${k.padEnd(44)} rotation ${String(t.activeRotation).padStart(3)} · v0.1 projected ${String(t.v01Projected).padStart(3)} · v0.1 none ${JSON.stringify(t.v01NoProjection)} · v0.3-replay none ${JSON.stringify(t.v03ReplayNoProjection)} · v0.4-replay none ${JSON.stringify(t.v04ReplayNoProjection)} · Out & would-be-rotation ${t.outWouldBeRotation}`);
  console.log(`  v0.4 replay (REPLAY_NOT_PUBLISHED, projection side only): ${JSON.stringify(s.v04Effect)}`);
  console.log(`  no-projection, not Out (${s.noProjection.length}):`);
  for (const p of s.noProjection) console.log(`    ${p.team.padEnd(4)} ${String(p.name).padEnd(26)} exp ${String(p.experienceYears).padStart(2)} ${String(p.cause).padEnd(20)} rot(primary) ${p.rotation[ROTATION_RULES[0].id] ? "Y" : "n"} v0.3 ${p.v03ReplayProjected ? "projected" : p.v03Cause} · ${p.causeDetail} · seasons ${JSON.stringify(p.facts.seasons)} · pre ${JSON.stringify(p.facts.preseason)}`);
  if (s.pilot) { console.log("  pilot 11:"); for (const p of s.pilot) console.log(`    ${JSON.stringify(p)}`); }
}
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "projection-coverage.json"), JSON.stringify(out, null, 1)); console.log(`\nwrote ${path.join(OUT, "projection-coverage.json")} (MEASUREMENT_NOT_PUBLISHED)`); }
