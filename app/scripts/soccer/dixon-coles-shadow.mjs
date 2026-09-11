#!/usr/bin/env node
/**
 * Dixon-Coles v2 forward shadow — PRIVATE forecasts and grades for LaLiga, Serie A and Bundesliga. $0, free sources.
 *
 *   node scripts/soccer/dixon-coles-shadow.mjs --now <ISO> [--leagues laliga,serie-a,bundesliga] [--dry-run]
 *   node scripts/soccer/dixon-coles-shadow.mjs --grade --now <ISO> [--leagues …] [--dry-run]
 *
 * Research only, under data/internal/research/soccer/preregistration-dixon-coles-v2.json. Nothing here is public:
 * no file under app/public/, no registry stage read or written, no promotion of any kind. Fixtures come from
 * ESPN's public scoreboard. The history the model is fit on, and the final scores it is graded against, are the
 * league's football-data.co.uk corpus — refresh it first (capture-football-data.mjs --leagues … --seasons 2627).
 *
 * FORECAST (default): refuses unless the registration, its pinned source files and the model parameters are
 * unaltered. Fits ONE Dixon-Coles state per league on corpus rows strictly before --now, then forecasts every
 * 2026-27 league fixture that is still pre-kickoff, kicks off after the registration's frozenAt, and falls inside
 * the registered horizon. A match that already has a forecast is skipped: append-only, the first forecast is the
 * forecast, and a re-run writes nothing.
 *   → data/internal/research/soccer/<league>/shadow-dc-v2/forecasts-<YYYY-MM-DD of --now>.json
 *
 * GRADE (--grade): joins every forecast to its corpus result through lib/sports/soccer/grading.mjs and writes the
 * sample state plus the preregistered decision state. A file is rewritten only when its content changed.
 *   → data/internal/research/soccer/<league>/shadow-dc-v2/graded.json
 *   → data/internal/research/soccer/shadow-dc-v2-summary.json   (pooled three-league figures, reported only)
 *
 * Exit 0 on success, "nothing new" included; exit 2 on usage; exit 3 if anything was refused (an altered
 * registration, ESPN unreachable, a club that does not map, a fit that did not converge) — after writing what was
 * valid, so a CI run shows the refusal instead of leaving a quiet gap in the sample.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DC_V2_MODEL_ID, DC_V2_PARAMS, forecastFixtures } from "../../src/lib/sports/soccer/dixon-coles.mjs";
import { footballDataClub } from "../../src/lib/sports/soccer/dixon-coles-aliases.mjs";
import {
  DC_V2_PREREGISTRATION, verifyPreregistration, seasonOf, pairingKey, newForecastsOnly, appendToDayFile,
  gradeShadow, decide, scoreGraded, drawEceNullQuantile, canonicalJson,
} from "../../src/lib/sports/soccer/dixon-coles-shadow-record.mjs";
import { fitEplStrength, scoreMatrix as v1ScoreMatrix } from "../../src/lib/sports/epl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const HOUR = 3_600_000, DAY = 86_400_000;
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const GRADE = argv.includes("--grade");
const DRY = argv.includes("--dry-run");
if (!Number.isFinite(Date.parse(arg("--now") ?? ""))) {
  console.error("usage: dixon-coles-shadow.mjs --now <ISO> [--grade] [--leagues laliga,serie-a,bundesliga] [--dry-run]");
  process.exit(2);
}
const nowMs = Date.parse(arg("--now"));
const nowIso = new Date(nowMs).toISOString();

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, obj) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + "\n");
  fs.renameSync(tmp, p); // a crash mid-write never leaves a half-written record
};
const R6 = (x) => Number(x.toFixed(6));
const R4 = (x) => Number(x.toFixed(4));

/* ── the registration must be intact before anything is written ─────────────────────────────────────────── */
const prereg = readJson(path.join(ROOT, DC_V2_PREREGISTRATION.path));
const sourceBytes = Object.fromEntries(Object.keys(prereg.sourceHashes ?? {}).map((p) => {
  try { return [p, fs.readFileSync(path.join(ROOT, p))]; } catch { return [p, null]; }
}));
const check = verifyPreregistration({ doc: prereg, sourceBytes, modelParams: DC_V2_PARAMS });
if (!check.ok) {
  console.error("REFUSED: the Dixon-Coles v2 registration is not intact — nothing forecast, nothing graded");
  for (const p of check.problems) console.error(`  ${p}`);
  process.exit(3);
}
if (!(nowMs >= Date.parse(prereg.frozenAt))) { console.error(`REFUSED: --now ${nowIso} is before the registration's frozenAt ${prereg.frozenAt}`); process.exit(3); }

const SEASON = prereg.season;
const LEAGUES = arg("--leagues") ? arg("--leagues").split(",") : Object.keys(prereg.leagues);
for (const k of LEAGUES) if (!prereg.leagues[k]) { console.error(`REFUSED: "${k}" is not a league in the registration`); process.exit(3); }

const leagueDir = (k) => path.join(ROOT, "data/internal/research/soccer", k);
const shadowDir = (k) => path.join(leagueDir(k), "shadow-dc-v2");
const corpusRows = (k) => readJson(path.join(leagueDir(k), "corpus-football-data-v1.json")).rows;
const dayFiles = (k) => {
  const d = shadowDir(k);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /^forecasts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => readJson(path.join(d, f)));
};
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
let refusals = 0;
const refuse = (msg) => { refusals += 1; console.error(`REFUSED ${msg}`); };

async function espnEvents(code, fromMs, toMs) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${ymd(fromMs)}-${ymd(toMs)}&limit=400`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  return (await res.json()).events ?? [];
}

/* ── forecast ─────────────────────────────────────────────────────────────────────────────────────────── */
async function forecastLeague(key) {
  const spec = prereg.leagues[key];
  const proto = prereg.forecastProtocol;
  const rows = corpusRows(key);
  let events;
  try { events = await espnEvents(spec.espn, nowMs - proto.corpusLagLookbackDays * DAY, nowMs + proto.horizonHours * HOUR); }
  catch (e) { refuse(`${key}: ${e.message} — nothing forecast`); return; }

  const frozenMs = Date.parse(prereg.frozenAt);
  const inCorpus = new Set(rows.filter((r) => r.season === SEASON).map((r) => pairingKey(r.season, r.home, r.away)));
  const fixtures = [], refused = [], lagMissing = [];
  for (const e of events) {
    const comp = e.competitions?.[0];
    const side = (ha) => comp?.competitors?.find((c) => c.homeAway === ha)?.team;
    const home = side("home"), away = side("away");
    const kickoffUtc = e.date ? new Date(e.date).toISOString() : null;
    if (!home || !away || !kickoffUtc) { refused.push({ providerEventId: String(e.id), reason: "fixture is missing a side or a kickoff time" }); continue; }
    const k0 = Date.parse(kickoffUtc);
    const h = footballDataClub(key, home), a = footballDataClub(key, away);
    /* The information set is the corpus as captured: count finals the corpus has not caught up with yet. */
    if (e.status?.type?.completed && k0 < nowMs) {
      if (h && a && !inCorpus.has(pairingKey(seasonOf(kickoffUtc), h, a))) lagMissing.push(`${h} v ${a}`);
      continue;
    }
    if (e.status?.type?.state !== "pre" || !(k0 > nowMs) || k0 > nowMs + proto.horizonHours * HOUR) continue; // pre-kickoff, inside the horizon
    if (!(k0 > frozenMs) || seasonOf(kickoffUtc) !== SEASON) continue; // forward population only
    if (!h || !a) {
      const miss = !h ? home : away;
      refused.push({ providerEventId: String(e.id), matchup: `${home.displayName} v ${away.displayName}`, reason: `ESPN club "${miss.displayName}" (id ${miss.id}) is not in dixon-coles-aliases.mjs — the table is pinned by the registration, so adding a club is a registration amendment, never a quiet edit` });
      continue;
    }
    fixtures.push({ pairingKey: pairingKey(SEASON, h, a), home: h, away: a, kickoffUtc, espnId: String(e.id), espnHome: home, espnAway: away });
  }
  for (const r of refused) refuse(`${key} ${r.matchup ?? r.providerEventId}: ${r.reason}`);

  const existing = dayFiles(key).flatMap((f) => f.rows ?? []);
  const { fresh, alreadyForecast } = newForecastsOnly(existing, fixtures);
  const lagNote = `corpus lag: ${lagMissing.length} ESPN final(s) in the last ${proto.corpusLagLookbackDays} days not yet in the corpus`;
  if (!fresh.length) {
    console.log(`[dc-v2 shadow] ${key}: 0 new forecasts · ${alreadyForecast.length} already forecast · ${refused.length} refused · ${lagNote}`);
    return;
  }

  const { state, forecasts } = forecastFixtures({ rows, cutoffIso: nowIso, fixtures: fresh.map((f) => ({ home: f.home, away: f.away, kickoffUtc: f.kickoffUtc })) });
  if (!state.converged) { refuse(`${key}: the Dixon-Coles fit did not converge in ${state.sweeps} sweeps — nothing forecast`); return; }

  /* Comparators, reported and never gating: the rejected v1 model and the empirical baseline at the same cutoff. */
  const v1 = fitEplStrength({ rows, cutoffIso: nowIso });
  const tally = { H: 0, D: 0, A: 0 };
  for (const r of rows) if (Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway) && Date.parse(r.dateUtc) < nowMs && r.result in tally) tally[r.result] += 1;
  const nT = tally.H + tally.D + tally.A;
  const empirical = { home: R6((tally.H + 1) / (nT + 3)), draw: R6((tally.D + 1) / (nT + 3)), away: R6((tally.A + 1) / (nT + 3)) };
  const fitted = (c) => (Object.prototype.hasOwnProperty.call(state.clubs, c) ? state.clubs[c].matches : 0);

  const newRows = fresh.map((f, i) => {
    const fc = forecasts[i];
    const v1p = v1ScoreMatrix(v1, f.home, f.away).oneXTwo;
    return {
      pairingKey: f.pairingKey, league: key, season: SEASON,
      eventId: `soccer:${key}:${f.espnId}`, providerEventId: f.espnId, kickoffUtc: f.kickoffUtc,
      matchup: `${f.espnHome.displayName} v ${f.espnAway.displayName}`, homeClub: f.espnHome.displayName, awayClub: f.espnAway.displayName,
      historyNames: { home: f.home, away: f.away }, espnTeamIds: { home: String(f.espnHome.id), away: String(f.espnAway.id) },
      modelId: DC_V2_MODEL_ID, forecastAt: nowIso,
      probs: { home: R6(fc.oneXTwo.home), draw: R6(fc.oneXTwo.draw), away: R6(fc.oneXTwo.away) },
      over25: R6(fc.over25), under25: R6(fc.under25),
      expectedGoals: { home: R4(fc.expectedGoals.home), away: R4(fc.expectedGoals.away) },
      lambdas: { home: R4(fc.lambdas.home), away: R4(fc.lambdas.away) },
      rho: R6(fc.rho), tauClamped: fc.tauClamped,
      coldStart: fc.coldStart, clubMatchesFitted: { home: fitted(f.home), away: fitted(f.away) },
      fit: { cutoffIso: nowIso, matchesFitted: state.matchesFitted, lastFoldedUtc: state.lastFoldedUtc, sweeps: state.sweeps, converged: state.converged },
      corpusLag: { espnFinalsLookbackDays: proto.corpusLagLookbackDays, espnFinalsMissingFromCorpus: lagMissing.length },
      comparators: { v1SplitPoisson: { home: v1p.home, draw: v1p.draw, away: v1p.away }, empirical },
    };
  });

  const file = path.join(shadowDir(key), `forecasts-${nowIso.slice(0, 10)}.json`);
  const header = {
    schemaVersion: 1, artifact: "soccer-dc-v2-shadow-forecasts", dataClass: "PRIVATE_RESEARCH", public: false,
    league: key, season: SEASON, date: nowIso.slice(0, 10), modelId: DC_V2_MODEL_ID,
    preregistration: DC_V2_PREREGISTRATION.path, preregistrationSha256: check.computed,
    rule: "one forecast per match, the first one written; never overwritten; scored only if the match kicked off after frozenAt",
  };
  const next = appendToDayFile(fs.existsSync(file) ? readJson(file) : null, newRows, { at: nowIso, header });
  if (!DRY) writeJson(file, next);
  console.log(`[dc-v2 shadow] ${key}: ${newRows.length} new forecasts${DRY ? " (dry run, not written)" : ` → ${path.relative(ROOT, file)}`} · ${alreadyForecast.length} already forecast · ${refused.length} refused · ρ ${R4(state.rho)} · fit ${state.matchesFitted} matches through ${state.lastFoldedUtc} · ${lagNote}`);
}

/* ── grade ────────────────────────────────────────────────────────────────────────────────────────────── */
const withoutStamp = (doc) => { if (!doc) return null; const { generatedAt: _g, ...rest } = doc; return rest; };

function gradeLeague(key) {
  const spec = prereg.leagues[key];
  const rows = corpusRows(key);
  const out = path.join(shadowDir(key), "graded.json");
  const prev = fs.existsSync(out) ? readJson(out) : null;
  const g = gradeShadow({ files: dayFiles(key), corpusRows: rows, frozenAt: prereg.frozenAt, season: SEASON, previous: prev?.matches ?? [] });
  const seasonRows = rows.filter((r) => r.season === SEASON).length;
  const deadline = prereg.acceptance.look.deadline;
  const due = seasonRows >= spec.seasonMatches || nowMs >= Date.parse(deadline);
  const decision = decide({ matches: g.matches, rules: prereg.acceptance.rules, due });
  const body = {
    schemaVersion: 1, artifact: "soccer-dc-v2-shadow-graded", dataClass: "PRIVATE_RESEARCH", public: false,
    league: key, season: SEASON, modelId: DC_V2_MODEL_ID,
    preregistration: DC_V2_PREREGISTRATION.path, preregistrationSha256: check.computed, frozenAt: prereg.frozenAt,
    rule: "each forward match graded once, against its single pre-kickoff shadow forecast, from the football-data.co.uk final score",
    sampleState: g.summary.sampleState,
    summary: g.summary,
    decision: { ...decision, due, look: { seasonRowsInCorpus: seasonRows, seasonMatches: spec.seasonMatches, deadline }, stageChanged: false },
    reportedNotGating: {
      v1SplitPoisson: scoreGraded(g.matches, (m) => m.comparators?.v1SplitPoisson),
      marketClose: scoreGraded(g.matches, (m) => m.comparators?.marketClose),
      rescheduled: g.matches.filter((m) => m.rescheduled).length,
    },
    population: { graded: g.matches.length, pendingResult: g.pending.length, excluded: g.excluded },
    matches: g.matches,
  };
  const changed = canonicalJson(body) !== canonicalJson(withoutStamp(prev));
  if (changed && !DRY) writeJson(out, { ...body, generatedAt: nowIso });
  console.log(`[dc-v2 grade] ${key}: ${g.added} newly graded · ${g.matches.length} total (${g.summary.sampleState}) · ${g.pending.length} awaiting a corpus result · ${g.excluded.length} excluded · decision ${decision.state}${changed ? "" : " · unchanged, not rewritten"}`);
  return g.matches;
}

function writePooled(byLeague) {
  const all = Object.values(byLeague).flat();
  const out = path.join(ROOT, "data/internal/research/soccer/shadow-dc-v2-summary.json");
  const prev = fs.existsSync(out) ? readJson(out) : null;
  const body = {
    schemaVersion: 1, artifact: "soccer-dc-v2-shadow-summary", dataClass: "PRIVATE_RESEARCH", public: false,
    preregistration: DC_V2_PREREGISTRATION.path, preregistrationSha256: check.computed,
    note: "pooled over the three leagues — REPORTED, NEVER GATING; each league is judged alone by its own graded.json",
    perLeague: Object.fromEntries(Object.entries(byLeague).map(([k, m]) => [k, m.length])),
    dixonColes: scoreGraded(all, (m) => m.probs),
    v1SplitPoisson: scoreGraded(all, (m) => m.comparators?.v1SplitPoisson),
    marketClose: scoreGraded(all, (m) => m.comparators?.marketClose),
    drawEceNullBound: drawEceNullQuantile(all, prereg.acceptance.rules.resampling),
  };
  const changed = canonicalJson(body) !== canonicalJson(withoutStamp(prev));
  if (changed && !DRY) writeJson(out, { ...body, generatedAt: nowIso });
  console.log(`[dc-v2 grade] pooled: ${all.length} graded${changed ? "" : " · unchanged, not rewritten"}`);
}

if (GRADE) {
  const byLeague = {};
  for (const k of LEAGUES) byLeague[k] = gradeLeague(k);
  if (Object.keys(prereg.leagues).every((k) => byLeague[k])) writePooled(byLeague);
  else console.log("[dc-v2 grade] pooled summary skipped — it is written only when every registered league was graded in the same run");
} else {
  for (const k of LEAGUES) await forecastLeague(k);
}
process.exit(refusals ? 3 : 0);
