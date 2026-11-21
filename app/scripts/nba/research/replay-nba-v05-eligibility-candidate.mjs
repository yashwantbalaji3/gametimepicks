/**
 * REPLAY_NOT_PUBLISHED — the v0.5 eligibility-gate candidate on the exact as-of inputs of frozen v0.3 forward slates.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 * DESCRIPTIVE / IN-SAMPLE ONLY: v0.5 was designed after these slates' outcomes were seen. A replay is never forward
 * evidence, never a receipt, never a ledger row and never counts toward any preregistered sample.
 *
 *   npx tsx scripts/nba/research/replay-nba-v05-eligibility-candidate.mjs --dates 2026-10-22,2026-10-23 --out-dir <dir outside the repo> [--simulations N]
 *
 * For every freeze instant in data/internal/research/nba/experimental-v0.3/forecasts/<date>.json (receipt.generatedAt):
 *   rosters / injuries = the git blobs whose sha256 equal the receipt's (as replay-nba-v03-minutes-candidate.mjs);
 *   box scores         = corpus + the families' fetched box scores captured at or before the instant (foldBoxscores);
 *   v0.3               = rebuilt from those inputs; EVERY game must re-derive its committed v0.3 payloadSha256 or the
 *                        replay REFUSES (proof the inputs are the receipt's);
 *   v0.5               = the same inputs, family v0.5 (v0.3 + eligibility-gate-v05.mjs), written to --out-dir.
 * Writes ONLY to --out-dir, which must be outside the repository. Read-only on git history. No network.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact, FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { stampReceipt, canonicalJson } from "../../../src/lib/sports/nba/forecast-receipt.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const DATES = (arg("--dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
const OUT = arg("--out-dir") ? path.resolve(arg("--out-dir")) : null;
const SIMS = arg("--simulations") != null ? Number(arg("--simulations")) : null;
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
if (!DATES.length) refuse("--dates YYYY-MM-DD[,YYYY-MM-DD] required");
if (!OUT) refuse("--out-dir <dir> required (outside the repository)");
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) refuse(`--out-dir ${OUT} is inside the repository — a replay is never written where a build or a publisher could read it`);
if (SIMS != null && !(Number.isInteger(SIMS) && SIMS > 0)) refuse("--simulations must be a positive integer");

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

fs.mkdirSync(OUT, { recursive: true });
const summary = { marker: "REPLAY_NOT_PUBLISHED", evidence: "DESCRIPTIVE_IN_SAMPLE — designed after these outcomes; never forward evidence", dataClass: "PRIVATE_RESEARCH", productEligible: false, candidate: "v0.5", generatedFrom: "replay-nba-v05-eligibility-candidate.mjs", dates: {} };
for (const date of DATES) {
  const file = path.join(NBA, "experimental-v0.3", "forecasts", `${date}.json`);
  if (!fs.existsSync(file)) refuse(`${date}: no frozen v0.3 forecast file`);
  const doc = readJson(file);
  const byFreeze = new Map();
  for (const g of doc.games) { const k = g.receipt?.generatedAt; if (!k) refuse(`${date} ${g.providerEventId}: no receipt`); if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
  const freezes = [];
  for (const [now, games] of byFreeze) {
    const ri = games[0].receipt.inputs;
    if (games.some((g) => canonicalJson(g.receipt.inputs.rosters) !== canonicalJson(ri.rosters) || canonicalJson(g.receipt.inputs.injuries) !== canonicalJson(ri.injuries))) refuse(`${date} @ ${now}: games frozen at one instant carry different inputs`);
    const rb = blob("data/internal/research/nba/rosters/latest.json", ri.rosters.sha256);
    const ib = blob("data/internal/research/injuries/nba/latest.json", ri.injuries.sha256);
    if (!rb || !ib) refuse(`${date} @ ${now}: no git blob for the receipt's ${!rb ? "rosters" : "injuries"} sha256`);
    const rosters = JSON.parse(rb.text), injuries = JSON.parse(ib.text);
    const scheduleRows = games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: g.seasonType, neutralSite: g.neutralSite, venue: g.venue, home: { abbr: g.home.abbr, name: g.home.name, providerTeamId: g.home.providerTeamId }, away: { abbr: g.away.abbr, name: g.away.name, providerTeamId: g.away.providerTeamId } }));
    const fold = foldBoxscores(corpusBox, fetchedBox, { now });
    const common = { date, now, scheduleRows, corpusRows: corpus.rows, boxscores: fold.docs, injuries: injuries.entries ?? null, rosters, simulations: SIMS ?? games[0].forecast.simulations };
    let v03ReDerived = 0;
    if (SIMS == null) {
      const v03 = buildForecastArtifact({ ...common, family: "v0.3" }).artifact;
      for (const stored of games) {
        const g = v03.games.find((x) => x.providerEventId === stored.providerEventId);
        if (!g) refuse(`${date} ${stored.providerEventId}: v0.3 rebuild has no such game`);
        const st = stampReceipt(g, { family: "v0.3", modelVersion: v03.modelVersion, now, inputs: stored.receipt.inputs });
        if (st.receipt.payloadSha256 !== stored.receipt.payloadSha256) refuse(`${date} ${g.providerEventId}: v0.3 rebuild does not re-derive the committed payloadSha256 — the replay's inputs are not the receipt's`);
        v03ReDerived += 1;
      }
    }
    const v05 = buildForecastArtifact({ ...common, family: "v0.5" }).artifact;
    v05.marker = "REPLAY_NOT_PUBLISHED";
    v05.evidence = summary.evidence;
    const out = path.join(OUT, `v0.5-replay-${date}-${now.replace(/[:]/g, "")}.json`);
    fs.writeFileSync(out, JSON.stringify(v05));
    freezes.push({ now, games: games.length, v03PayloadsReDerived: v03ReDerived, rostersBlob: rb.ref, injuriesBlob: ib.ref, boxscoresFolded: fold.added, foldSkipped: fold.skipped, file: path.basename(out) });
  }
  summary.dates[date] = { freezes };
  console.log(`${date}: ${freezes.map((f) => `${f.now} games ${f.games} (v0.3 re-derived ${f.v03PayloadsReDerived}) folded ${f.boxscoresFolded}`).join(" · ")}`);
}
fs.writeFileSync(path.join(OUT, "v0.5-replay-summary.json"), JSON.stringify(summary, null, 1));
console.log(`wrote ${OUT} (REPLAY_NOT_PUBLISHED, descriptive in-sample)`);
