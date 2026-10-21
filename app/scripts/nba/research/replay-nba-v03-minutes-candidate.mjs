/**
 * REPLAY_NOT_PUBLISHED — the v0.3 role-prior minutes candidate on the exact as-of inputs of frozen v0.1 slates.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 *   npx tsx scripts/nba/research/replay-nba-v03-minutes-candidate.mjs --dates 2026-10-20,2026-10-21 --out-dir <dir outside the repo>
 *
 * For every freeze instant in data/internal/research/nba/experimental-v0.1/forecasts/<date>.json (receipt.generatedAt):
 *   rosters   = the git blob of data/internal/research/nba/rosters/latest.json whose sha256 equals the receipt's;
 *   injuries  = the git blob of data/internal/research/injuries/nba/latest.json whose sha256 equals the receipt's;
 *   schedule  = the frozen games' own identity fields (event id, tip, seasonType, teams);
 *   v0.1      = rebuilt from those inputs and the corpus box scores; EVERY game must re-derive its committed
 *               payloadSha256 or the replay REFUSES (that is the proof the inputs are the receipt's);
 *   v0.3      = the same inputs, the box scores folded at the freeze (season-fold.mjs foldBoxscores: corpus + the
 *               families' fetched box scores captured at or before the instant), family v0.3.
 * Actuals: where a fetched regular-season box score for the event exists, expected vs actual minutes / points.
 *
 * Writes ONLY to --out-dir, which must be outside the repository: nothing here is a forecast of record, a receipt,
 * a ledger row or a published number. Read-only on git history. No network.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { stampReceipt, canonicalJson } from "../../../src/lib/sports/nba/forecast-receipt.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const DATES = (arg("--dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
const OUT = arg("--out-dir") ? path.resolve(arg("--out-dir")) : null;
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
if (!DATES.length) refuse("--dates YYYY-MM-DD[,YYYY-MM-DD] required");
if (!OUT) refuse("--out-dir <dir> required (outside the repository)");
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) refuse(`--out-dir ${OUT} is inside the repository — a replay is never written where a build or a publisher could read it`);

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

const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const actualByEvent = new Map(fetchedBox.filter((d) => d.phase === 2 && d.boxscoreAvailable).map((d) => [String(d.providerEventId), d]));

fs.mkdirSync(OUT, { recursive: true });
const summary = { marker: "REPLAY_NOT_PUBLISHED", dataClass: "PRIVATE_RESEARCH", productEligible: false, candidate: "v0.3", generatedFrom: "replay-nba-v03-minutes-candidate.mjs", dates: {} };
for (const date of DATES) {
  const doc = readJson(path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`));
  const byFreeze = new Map();
  for (const g of doc.games) { const k = g.receipt?.generatedAt; if (!k) refuse(`${date} ${g.providerEventId}: no receipt`); if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
  const rows = [];
  const freezes = [];
  for (const [now, games] of byFreeze) {
    const ri = games[0].receipt.inputs;
    if (games.some((g) => canonicalJson(g.receipt.inputs.rosters) !== canonicalJson(ri.rosters) || canonicalJson(g.receipt.inputs.injuries) !== canonicalJson(ri.injuries))) refuse(`${date} @ ${now}: games frozen at one instant carry different inputs`);
    const rb = blob("data/internal/research/nba/rosters/latest.json", ri.rosters.sha256);
    const ib = blob("data/internal/research/injuries/nba/latest.json", ri.injuries.sha256);
    if (!rb || !ib) refuse(`${date} @ ${now}: no git blob for the receipt's ${!rb ? "rosters" : "injuries"} sha256`);
    const rosters = JSON.parse(rb.text), injuries = JSON.parse(ib.text);
    const scheduleRows = games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: g.seasonType, neutralSite: g.neutralSite, venue: g.venue, home: { abbr: g.home.abbr, name: g.home.name, providerTeamId: g.home.providerTeamId }, away: { abbr: g.away.abbr, name: g.away.name, providerTeamId: g.away.providerTeamId } }));
    const common = { date, now, scheduleRows, corpusRows: corpus.rows, injuries: injuries.entries ?? null, rosters, simulations: games[0].forecast.simulations };
    const v01 = buildForecastArtifact({ ...common, boxscores: corpusBox, family: "v0.1" }).artifact;
    for (const g of v01.games) {
      const stored = games.find((x) => x.providerEventId === g.providerEventId);
      const st = stampReceipt(g, { family: "v0.1", modelVersion: v01.modelVersion, now, inputs: stored.receipt.inputs });
      if (st.receipt.payloadSha256 !== stored.receipt.payloadSha256) refuse(`${date} ${g.providerEventId}: v0.1 rebuild does not re-derive the committed payloadSha256 — the replay's inputs are not the receipt's`);
    }
    const fold = foldBoxscores(corpusBox, fetchedBox, { now });
    const v03 = buildForecastArtifact({ ...common, boxscores: fold.docs, family: "v0.3" }).artifact;
    v03.marker = "REPLAY_NOT_PUBLISHED";
    fs.writeFileSync(path.join(OUT, `v0.3-replay-${date}-${now.replace(/[:]/g, "")}.json`), JSON.stringify(v03, null, 1));
    freezes.push({ now, games: games.length, v01PayloadsReDerived: games.length, rostersBlob: rb.ref, injuriesBlob: ib.ref, boxscoresFolded: fold.added, foldSkipped: fold.skipped });
    for (const stored of games) {
      const c = v03.games.find((x) => x.providerEventId === stored.providerEventId);
      const actual = actualByEvent.get(stored.providerEventId) ?? null;
      for (const side of ["home", "away"]) {
        const a = stored.forecast.players[side];
        const b = new Map((c?.forecast.players[side] ?? []).map((p) => [p.providerAthleteId, p]));
        const top5 = new Set([...a].sort((x, y) => y.expectedMinutes - x.expectedMinutes || x.providerAthleteId.localeCompare(y.providerAthleteId)).slice(0, 5).map((p) => p.providerAthleteId));
        const ids = new Set([...a.map((p) => p.providerAthleteId), ...b.keys()]);
        for (const id of ids) {
          const p1 = a.find((p) => p.providerAthleteId === id) ?? null;
          const p3 = b.get(id) ?? null;
          const act = actual?.players.find((p) => String(p.providerAthleteId) === id && String(p.providerTeamId) === String(stored[side].providerTeamId)) ?? null;
          rows.push({
            eventId: stored.providerEventId, freeze: now, side, team: stored[side].abbr, providerAthleteId: id, name: p1?.name ?? p3?.name ?? null,
            v01ProjectedStarter: top5.has(id),
            v01: p1 ? { expectedMinutes: p1.expectedMinutes, basis: p1.basis, gamesUsed: p1.gamesUsed, pts: p1.pts.p50, reb: p1.reb.p50, ast: p1.ast.p50 } : null,
            v03: p3 ? { expectedMinutes: p3.expectedMinutes, basis: p3.basis, gamesUsed: p3.gamesUsed, playRate: p3.playRate ?? null, pts: p3.pts.p50, reb: p3.reb.p50, ast: p3.ast.p50 } : null,
            actual: act ? { played: !act.didNotPlay && Number.isInteger(act.minutes), starter: act.starter === true, minutes: act.didNotPlay ? null : act.minutes, pts: act.pts, reb: act.reb, ast: act.ast } : null,
          });
        }
        const m1 = stored.forecast.assumptions.minutes[side], m3 = c?.forecast.assumptions.minutes[side];
        freezes.at(-1)[`${stored.providerEventId}:${side}`] = { team: stored[side].abbr, v01: { rawPoolMinutes: m1.rawPoolMinutes, rescaleFactor: m1.rescaleFactor, poolSize: stored.forecast.assumptions.availability[side].poolSize }, v03: m3 ? { rawPoolMinutes: m3.rawPoolMinutes, playRateWeightedPoolMinutes: m3.playRateWeightedPoolMinutes, rescaleFactor: m3.rescaleFactor, expectedTeamMinutes: m3.expectedTeamMinutes, poolSize: c.forecast.assumptions.availability[side].poolSize } : null };
      }
    }
  }
  summary.dates[date] = { freezes, rows };
}
fs.writeFileSync(path.join(OUT, "v0.3-replay-summary.json"), JSON.stringify(summary, null, 1));
for (const [d, s] of Object.entries(summary.dates)) console.log(`${d}: ${s.freezes.map((f) => `${f.now} games ${f.games} (v0.1 re-derived ${f.v01PayloadsReDerived}) folded ${f.boxscoresFolded}`).join(" · ")} · rows ${s.rows.length}`);
console.log(`wrote ${OUT} (REPLAY_NOT_PUBLISHED)`);
