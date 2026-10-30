/**
 * SYNTHETIC NBA line artifact — TEST / PREVIEW ONLY. Builds a `gtp.nba.line-comparisons@1` document for a REAL committed
 * lane (real players and medians) with OBVIOUSLY FAKE prices (+999 / −999) and invented lines, marked dataClass
 * SYNTHETIC_TEST_DATA (the renderer watermarks every card "TEST DATA — NOT LIVE ODDS"), and encrypts it under a THROWAWAY
 * key generated for the run into a temporary directory. It never touches data/odds-display/ or any real key.
 *
 * Shape: per game, the `perTeam` highest-minute players of each side × every family (threePm included, so the exclusion
 * of unqualified families is exercised). Lines: a fixed offset pattern (half-points) plus one exact-equality line per
 * game (a NEUTRAL row). The first player of each game's away side is quoted `staleAt` (still valid at the artifact's own
 * asOf, stale at a later export asOf) so the 6-hour exclusion is exercised.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../src/lib/odds/display-crypto.mjs";
import { nbaLinesAad } from "../../src/lib/sports/nba/public-line-records.mjs";
import { NBA_LINE_PUBLICATION_SCHEMA, NBA_LINES_DIR_ENV } from "../../src/lib/sports/nba/line-publication.mjs";
import { MARKET_KEYS, USER_SIDE } from "../../src/lib/sports/nba/line-comparison.mjs";

export const SYNTHETIC_DATA_CLASS = "SYNTHETIC_TEST_DATA";
export const FAKE_OVER = 999;
export const FAKE_UNDER = -999;
const OFFSETS = [-1.5, 1, -0.5, 2, -2.5, 0.5, -1, 1.5];
const r1 = (v) => Math.round(v * 10) / 10;
const COMBO = new Set(["pra", "ptsReb", "ptsAst"]);

/**
 * @param {{ lane: any, laneSha256: string, asOf: string, freshAt: string, staleAt: string, perTeam?: number }} o
 */
export function buildSyntheticLineArtifact({ lane, laneSha256, asOf, freshAt, staleAt, perTeam = 4 }) {
  const events = [];
  let n = 0;
  for (const g of lane.games) {
    const eventId = String(g.providerEventId);
    const rows = [];
    let neutralDone = false;
    for (const side of ["away", "home"]) {
      const players = [...(g.players?.[side] ?? [])].sort((a, b) => (b.expectedMinutes ?? 0) - (a.expectedMinutes ?? 0) || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId))).slice(0, perTeam);
      players.forEach((p, pi) => {
        for (const family of Object.keys(MARKET_KEYS)) {
          const projection = COMBO.has(family) ? p.comboMedians?.[family] : p.medians?.[family];
          if (typeof projection !== "number") continue;
          let line;
          if (!neutralDone && family === "reb" && side === "home") { line = projection; neutralDone = true; }
          else line = Math.max(0.5, Math.floor(projection + OFFSETS[n % OFFSETS.length]) + 0.5);
          n += 1;
          const exact = projection - line;
          const direction = exact > 0 ? "ABOVE" : exact < 0 ? "BELOW" : "EQUAL";
          const capturedAt = side === "away" && pi === 0 ? staleAt : freshAt;
          rows.push({
            eventId, athleteId: String(p.providerAthleteId), name: p.name, team: g[side].abbr, family, marketKey: MARKET_KEYS[family],
            projection, line, overPrice: FAKE_OVER, underPrice: FAKE_UNDER, prices: "TWO_SIDED", book: "draftkings", capturedAt,
            state: "COMPARED", direction, side: USER_SIDE[direction], difference: r1(exact),
            freshness: { rule: "captured before tip, within 6 h", ageMinutes: Math.round((Date.parse(asOf) - Date.parse(capturedAt)) / 60000) }, reason: null,
          });
        }
      });
    }
    events.push({ eventId, tipUtc: g.tipUtc, rows });
  }
  return {
    schemaVersion: NBA_LINE_PUBLICATION_SCHEMA,
    dataClass: SYNTHETIC_DATA_CLASS,
    rule: "nba-line-comparison@1",
    date: lane.date,
    asOf,
    display: { surface: "site", note: "SYNTHETIC TEST DATA: invented lines, fake prices (+999 / -999). Not live odds." },
    provenance: { lane: { path: `app/public/data/nba/experimental-public/${lane.date}.json`, sha256: laneSha256, generatedAt: lane.generatedAt ?? null }, capture: { provider: "SYNTHETIC", receipt: null, files: [] } },
    coverage: { events: lane.games.length, compared: events.reduce((a, e) => a + e.rows.length, 0) },
    events,
  };
}

/**
 * Write the synthetic artifact, encrypted under a fresh throwaway key, into a new temp directory. Returns the env
 * overrides for the reader (GTP_ODDS_DISPLAY_KEY = the throwaway key, GTP_NBA_LINES_DIR = the temp dir). The key exists
 * only in the returned object for this process; it is never written.
 */
export function writeSyntheticArtifact(artifact, { dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-synthetic-lines-")) } = {}) {
  const key = crypto.randomBytes(32);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${artifact.date}.json.enc`), encryptDisplayArtifact(`${JSON.stringify(artifact, null, 1)}\n`, key, nbaLinesAad(artifact.date)));
  return { dir, env: { [ODDS_DISPLAY_KEY_ENV]: key.toString("hex"), [NBA_LINES_DIR_ENV]: dir } };
}
