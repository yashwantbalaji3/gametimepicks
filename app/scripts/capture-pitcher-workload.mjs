/**
 * Forward-only pitcher workload/rest capture (Program 096-099 Lane F — capture only).
 *
 * Derives starting-pitcher workload features for a TARGET date's probable starters, using ONLY
 * games completed strictly before that date, from the free authoritative MLB StatsAPI. This is
 * research-corpus infrastructure: NO production model reads these fields (guard: the output
 * lives under data/internal/research/, which never enters the public export).
 *
 * Leakage safety:
 *   - sourceAsOf is stamped at capture; every source game is a completed game with an official
 *     date strictly before the target date (postgame knowledge of the target slate is impossible
 *     by construction).
 *   - Missingness is DATA: absent probables/logs are recorded as availabilityState, never imputed.
 *
 * Usage: npx tsx app/scripts/capture-pitcher-workload.mjs --date 2026-08-01 [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.resolve(APP, "../data/internal/research/pitcher-workload");
const FEATURE_VERSION = 1;

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]] : null)).filter(Boolean),
);
const DATE = typeof args.date === "string" ? args.date : null;
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("usage: capture-pitcher-workload.mjs --date YYYY-MM-DD [--write]");
  process.exit(1);
}

const API = "https://statsapi.mlb.com/api/v1";
const j = async (url) => (await fetch(url)).json();

const schedule = await j(`${API}/schedule?sportId=1&date=${DATE}&hydrate=probablePitcher`);
const games = (schedule.dates?.[0]?.games ?? []).filter((g) => g.gameType === "R");
const capturedAt = new Date().toISOString();
const rows = [];

for (const g of games) {
  for (const side of ["home", "away"]) {
    const team = g.teams?.[side];
    const pp = team?.probablePitcher;
    const base = {
      featureFamily: "pitcher_workload_rest",
      featureVersion: FEATURE_VERSION,
      eventId: null, // provider event id joins later at board time; gamePk is the canonical key
      gamePk: g.gamePk,
      scheduledStart: g.gameDate,
      side,
      teamId: team?.team?.id ?? null,
      capturedAt,
      sourceAsOf: capturedAt,
      source: "mlb_statsapi",
      pregameEligible: Date.parse(capturedAt) < Date.parse(g.gameDate),
    };
    if (!pp?.id) {
      rows.push({ ...base, pitcherId: null, availabilityState: "NO_PROBABLE_POSTED" });
      continue;
    }
    // Game log: completed appearances strictly before the target date.
    const season = DATE.slice(0, 4);
    const log = await j(`${API}/people/${pp.id}/stats?stats=gameLog&season=${season}&group=pitching`);
    const splits = (log.stats?.[0]?.splits ?? []).filter((s) => (s.date ?? "") < DATE);
    const recent = splits.slice(-3).reverse();
    const lastDate = recent[0]?.date ?? null;
    rows.push({
      ...base,
      pitcherId: pp.id,
      pitcherName: pp.fullName ?? null,
      availabilityState: recent.length ? "OK" : "NO_PRIOR_APPEARANCES",
      restDays: lastDate ? Math.round((Date.parse(DATE) - Date.parse(lastDate)) / 86_400_000) : null,
      last3: recent.map((s) => ({
        date: s.date,
        sourceGamePk: s.game?.gamePk ?? null,
        pitches: s.stat?.numberOfPitches ?? null,
        inningsPitched: s.stat?.inningsPitched ?? null,
        battersFaced: s.stat?.battersFaced ?? null,
      })),
      seasonAppearancesBefore: splits.length,
    });
  }
}

const artifact = {
  public: false,
  kind: "forward-research-pitcher-workload",
  schemaVersion: 1,
  forwardOnlyStart: "2026-08-01",
  date: DATE,
  capturedAt,
  source: "mlb_statsapi (free, official)",
  games: games.length,
  rows,
};

const counts = rows.reduce((m, r) => ((m[r.availabilityState] = (m[r.availabilityState] ?? 0) + 1), m), {});
console.log(`[pitcher-workload] ${DATE}: ${games.length} games · ${rows.length} starter slots · states ${JSON.stringify(counts)} · pregameEligible=${rows.every((r) => r.pregameEligible)}`);

if (args.write) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${DATE}.json`);
  fs.writeFileSync(out, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[pitcher-workload] wrote ${path.relative(path.resolve(APP, ".."), out)}`);
} else {
  console.log("[pitcher-workload] dry-run (pass --write to persist)");
}
