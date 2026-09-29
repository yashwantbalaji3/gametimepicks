#!/usr/bin/env node
/**
 * FROZEN DAILY TOP-5 BOARDS (Results V2 · B-4a). $0 — reads committed public boards, spends nothing.
 *
 *   node scripts/results/freeze-daily-top-boards.mjs --now <ISO> [--dry-run]
 *
 * For each ET day whose FIRST kickoff is still ahead (and at most 24h away), freeze that day's Top-5 per
 * PUBLISHED player-prop family into app/public/data/results/top-boards/<day>.json — ONCE:
 *   - WRITE-ONCE. An existing day file is never rewritten, whatever changed since. The commit that added it
 *     is the proof it predates every result (the workflow merges, never rebases, so that date survives).
 *   - NEVER RETROSPECTIVE. A day whose first kickoff has passed is never frozen late; it simply has no board.
 *   - ONLY PUBLIC OUTPUTS. A family ranks only when every one of that day's per-game boards PUBLISHES it
 *     (ESTIMATE / WITHHELD families are listed as ineligible with their reason, never ranked).
 *   - A MAXIMUM, NOT A QUOTA. Fewer than five qualifying players freeze fewer rows; none freezes none.
 *   - The ranking is the shared rule (lib/sports/nfl/board-ranking.mjs) the weekly boards use.
 *   - `line` is a captured book line or null with its typed pricing state — never invented.
 *
 * Sports: NFL is the only sport with a published player-prop family today. MLB props are market context
 * (every market demoted), EPL and UFC have no player-prop model — the Results page states that per sport
 * from the owners' own registries; this producer does not write "empty" files for them.
 */
import fs from "node:fs";
import path from "node:path";

import { BOARD_METRIC, familyStateAcross, rankFamily } from "../../src/lib/sports/nfl/board-ranking.mjs";
import { opponentIn } from "../../src/lib/sports/nfl/matchup.mjs";
import { buildPropPriceIndex } from "../../src/lib/sports/nfl/prop-price-lookup.mjs";

const APP = process.cwd();
const BOARD_DIR = path.join(APP, "public/data/nfl/player-board");
const OUT_DIR = path.join(APP, "public/data/results/top-boards");
const TOP_N = 5;
const WINDOW_MS = 24 * 3600 * 1000;

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso) => ET_DAY.format(new Date(Date.parse(iso)));

const propPrices = (() => {
  try { return buildPropPriceIndex(read(path.join(APP, "public/data/nfl/markets/latest.json"))); }
  catch { return buildPropPriceIndex(null); }
})();

/** Pure: the frozen board document for one day's per-game boards. Exported shape is pinned by tests. */
export function freezeDay(day, boards, frozenAt, prices = propPrices) {
  const families = Object.keys(BOARD_METRIC);
  const boardsOut = [];
  const ineligible = [];
  for (const family of families) {
    const st = familyStateAcross(boards, family);
    if (!st) { ineligible.push({ sport: "nfl", propFamily: family, state: "ABSENT", reason: "not on this day's boards" }); continue; }
    if (st.state !== "PUBLISHED") { ineligible.push({ sport: "nfl", propFamily: family, label: st.label, state: st.state, reason: st.reason ?? null }); continue; }
    const metric = BOARD_METRIC[family];
    const rows = rankFamily(boards, family, metric).slice(0, TOP_N).map(({ board: b, player: p, market: m }, i) => {
      const slot = prices.slotFor(b.providerEventId, p.playerId, family, p.name);
      return {
        rank: i + 1,
        forecastId: `${b.providerEventId}:${p.playerId}:${family}`,
        playerId: p.playerId,
        name: p.name,
        teamId: null, // the public board carries the club abbreviation only — no id is invented
        team: p.team,
        opponent: opponentIn(b.matchup, p.team),
        providerEventId: String(b.providerEventId),
        kickoffUtc: b.kickoffUtc,
        participation: p.participation ?? null,
        line: slot.market?.line ?? null,
        ...(slot.market ? { market: slot.market } : { pricingState: slot.pricingState ?? null }),
        projection: metric === "probability"
          ? { probability: m.probability }
          : { median: Math.round(m.median), p10: m.p10 != null ? Math.round(m.p10) : null, p90: m.p90 != null ? Math.round(m.p90) : null },
        boardGeneratedAt: b.generatedAt ?? null,
      };
    });
    boardsOut.push({ sport: "nfl", propFamily: family, label: st.label, metric, model: st.model, modelVersion: null, rows });
  }
  return {
    schemaVersion: 1,
    artifact: "results-top-boards",
    dataClass: "PUBLIC",
    date: day,
    publishedAt: frozenAt,
    firstKickoffUtc: boards.map((b) => b.kickoffUtc).sort()[0],
    events: boards.map((b) => String(b.providerEventId)).sort(),
    rule: "Frozen once, before the day's first kickoff. Top 5 per published family (a maximum, not a quota), ranked by the model's median (touchdowns: probability); ties by the model's mean. Never revised.",
    boards: boardsOut,
    ineligible,
  };
}

function main() {
  const NOW = arg("--now");
  const DRY = process.argv.includes("--dry-run");
  if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
  const nowMs = Date.parse(NOW);
  const boards = fs.existsSync(BOARD_DIR)
    ? fs.readdirSync(BOARD_DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(path.join(BOARD_DIR, f))).filter((b) => b?.kickoffUtc && Number.isFinite(Date.parse(b.kickoffUtc)))
    : [];
  const byDay = new Map();
  for (const b of boards) { const d = etDay(b.kickoffUtc); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(b); }
  let wrote = 0;
  for (const [day, dayBoards] of [...byDay.entries()].sort()) {
    const first = Math.min(...dayBoards.map((b) => Date.parse(b.kickoffUtc)));
    if (!(nowMs < first && first - nowMs <= WINDOW_MS)) continue;
    const file = path.join(OUT_DIR, `${day}.json`);
    if (fs.existsSync(file)) { console.log(`${day}: already frozen — write-once, left untouched`); continue; }
    const doc = freezeDay(day, dayBoards, NOW);
    const raw = JSON.stringify(doc, null, 2) + "\n";
    for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
      if (raw.includes(banned)) { console.error(`REFUSED: banned payload "${banned}" in ${day}`); process.exit(1); }
    }
    const summary = doc.boards.map((x) => `${x.propFamily}=${x.rows.length}`).join(" ") || "no published family";
    if (DRY) { console.log(`[dry-run] ${day}: would freeze over ${dayBoards.length} events · ${summary}`); continue; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, raw, { flag: "wx" }); // wx: fails rather than overwrite, even in a race
    wrote += 1;
    console.log(`${day}: frozen over ${dayBoards.length} events · ${summary}`);
  }
  if (!wrote && !DRY) console.log("nothing to freeze (no ET day with its first kickoff inside the next 24h, or already frozen)");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
