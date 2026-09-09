#!/usr/bin/env node
/**
 * P246 · §5 — THE canonical ranking owner for the NFL weekly top boards.
 *
 * One builder decides who appears on every weekly leaderboard; the hub renders its output
 * verbatim. Rules, each from the charter:
 *  - WEEK-SCOPED MEMBERSHIP: only events whose (seasonType, week) match the current forecast
 *    week qualify — never a clock window.
 *  - PROMOTION-GATED: a family ranks only if every constituent board carries the same state; a
 *    withheld family appears as a withheld BOARD carrying the exact bar it failed, never as numbers.
 *    P250-GD2: an ESTIMATE family ranks under that state, its failed bar and caveat riding along.
 *  - CONFIRMED OUT = EXCLUDED: an INACTIVE player never ranks on a default top board; his
 *    conditional numbers stay in the per-game board's explicit optional detail.
 *  - TOP-N ARE MAXIMUMS, NOT QUOTAS: fewer qualified rows publish fewer rows; nothing is
 *    padded in to fill a table.
 *  - SCOPE IS DECLARED: a board over the whole pregame week is FULL_WEEK; once any listed
 *    event has kicked off the board is REMAINING_EVENTS and says which events dropped out.
 *    (The frozen pregame week board is the per-run artifact written before first kickoff —
 *    boards are stamped, so the frozen-weekly edition is the last FULL_WEEK stamp.)
 *  - PRICING STATE, NEVER A PRICE CLAIM: NFL odds authorization is expired (P171); every row
 *    carries pricingState NOT_AUTHORIZED so a renderer cannot imply a current price exists.
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const BOARD_DIR = path.join(APP, "public/data/nfl/player-board");
const OUT_DIR = path.join(APP, "public/data/nfl/weekly-boards");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required (regen is always pinned)"); process.exit(1); }

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const weekOf = new Map(
  (forecasts.forecasts ?? []).map((f) => [String(f.providerEventId), { seasonType: f.seasonType, week: f.week }]),
);
// The current period is the earliest (seasonType, week) carrying an unplayed forecast — the
// same population rule the forecast builder uses (P244).
const pre = (forecasts.forecasts ?? []).filter((f) => Date.parse(f.kickoffUtc) > Date.parse(NOW));
const periodPool = pre.length ? pre : (forecasts.forecasts ?? []);
const period = periodPool
  .map((f) => ({ seasonType: f.seasonType, week: f.week }))
  .sort((a, b) => a.seasonType - b.seasonType || a.week - b.week)[0];
if (!period) {
  console.error("no forecast week — weekly boards not produced");
  process.exit(0);
}

const boards = fs
  .readdirSync(BOARD_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => read(path.join(BOARD_DIR, f)))
  .filter((b) => {
    const w = weekOf.get(String(b.providerEventId));
    return w && w.seasonType === period.seasonType && w.week === period.week;
  });

// Scope: the whole week pregame, or what remains once kickoffs pass.
const upcoming = boards.filter((b) => Date.parse(b.kickoffUtc) > Date.parse(NOW));
const played = boards.filter((b) => Date.parse(b.kickoffUtc) <= Date.parse(NOW));
const scoped = upcoming.length ? upcoming : boards;
const scope = played.length && upcoming.length
  ? { kind: "REMAINING_EVENTS", eventsIncluded: upcoming.length, eventsDroppedAfterKickoff: played.length }
  : { kind: "FULL_WEEK", eventsIncluded: scoped.length, eventsDroppedAfterKickoff: 0 };

// Family publication across the week: publish only if EVERY constituent board publishes it;
// otherwise carry the (identical) bar from the receipts.
const familyKeys = boards.length ? Object.keys(boards[0].families) : [];
const familyState = {};
for (const key of familyKeys) {
  const states = new Set(boards.map((b) => b.families[key]?.state));
  const first = boards[0].families[key];
  familyState[key] = states.size === 1 && states.has("PUBLISHED")
    ? { label: first.label, state: "PUBLISHED", basis: first.basis }
    : states.size === 1 && states.has("ESTIMATE")
      ? { label: first.label, state: "ESTIMATE", reason: first.reason, caveat: first.caveat }
      : { label: first.label, state: "WITHHELD", reason: first.reason ?? [...states].join("/") };
}

const opponentOf = (b, team) => {
  const [away, home] = String(b.matchup).split(" @ ").map((t) => t.trim());
  return team === away ? home : away;
};

function rankRows(family, metric, topN) {
  const rows = [];
  for (const b of scoped) {
    for (const p of b.players) {
      if (p.participation === "INACTIVE") continue; // confirmed out never ranks by default
      const m = p.markets[family];
      if (!m || m[metric] == null) continue;
      rows.push({
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        opponent: opponentOf(b, p.team),
        providerEventId: b.providerEventId,
        kickoffUtc: b.kickoffUtc,
        participation: p.participation,
        value: m[metric],
        // Distribution context rides along where the family has one. Yardage quantiles are
        // ROUNDED for display here (ranking still uses the precise value) — the per-game
        // boards print integers and a top board printing "64.06 yards" beside them reads as
        // false precision, not accuracy.
        ...(m.p10 != null ? { p10: Math.round(m.p10), median: Math.round(m.median), p90: Math.round(m.p90) } : {}),
        ...(m.probability != null ? { probability: m.probability } : {}),
        pricingState: "NOT_AUTHORIZED",
      });
    }
  }
  rows.sort((a, b) => b.value - a.value);
  return rows.slice(0, topN); // a MAXIMUM — fewer qualified rows publish fewer
}

const BOARD_SPECS = [
  { id: "top_td", family: "anytime_td", metric: "probability", topN: 5, title: "Top 5 · Anytime touchdown" },
  { id: "top_receptions", family: "player_receptions", metric: "median", topN: 10, title: "Top 10 · Receptions" },
  { id: "top_rush_yds", family: "player_rush_yds", metric: "median", topN: 10, title: "Top 10 · Rushing yards" },
  { id: "top_reception_yds", family: "player_reception_yds", metric: "median", topN: 10, title: "Top 10 · Receiving yards" },
  { id: "top_pass_yds", family: "player_pass_yds", metric: "median", topN: 10, title: "Top 10 · Passing yards" },
];

const out = {
  schemaVersion: 1,
  artifact: "nfl-weekly-boards",
  dataClass: "PUBLIC",
  generatedAt: NOW,
  period,
  scope,
  model: forecasts.model ?? null,
  participationBasis: boards[0]?.participationBasis ?? null,
  boards: BOARD_SPECS.map((spec) => {
    const fam = familyState[spec.family];
    if (!fam) return { ...spec, state: "WITHHELD", reason: "family absent from every per-game board" };
    /* P250-GD2: a family the per-game boards publish as an ESTIMATE ranks here under the SAME
       state — numbers with the failed bar and caveat carried on the board, never a bare top list. */
    if (fam.state === "ESTIMATE") return { ...spec, state: "ESTIMATE", reason: fam.reason, caveat: fam.caveat, rows: rankRows(spec.family, spec.metric, spec.topN) };
    if (fam.state !== "PUBLISHED") return { ...spec, state: "WITHHELD", reason: fam.reason };
    return { ...spec, state: "PUBLISHED", basis: fam.basis, rows: rankRows(spec.family, spec.metric, spec.topN) };
  }),
  disclaimer: boards[0]?.disclaimer ?? null,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const raw = JSON.stringify(out, null, 2);
for (const b of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
  if (raw.includes(b)) {
    console.error(`banned payload "${b}" in weekly boards`);
    process.exit(1);
  }
}
fs.writeFileSync(path.join(OUT_DIR, "latest.json"), raw + "\n");
fs.writeFileSync(path.join(OUT_DIR, `${period.seasonType}-${String(period.week).padStart(2, "0")}.json`), raw + "\n");
console.log(
  `weekly boards: ${scope.kind} over ${scoped.length} events · ` +
  out.boards.map((b) => `${b.id}=${b.state === "PUBLISHED" ? b.rows.length : b.state === "ESTIMATE" ? `${b.rows.length}est` : "withheld"}`).join(" "),
);
