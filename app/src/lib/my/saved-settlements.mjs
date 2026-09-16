/**
 * SAVED SETTLEMENTS — a compact PROJECTION of the Saved owner's canonical ledgers (v1.1.4). Pure.
 *
 * WHY IT EXISTS. "Saved forecast graded" needs the same answer /saved gives, and /saved reads four ledgers —
 * one of them the 900 KB MLB graded file. My GameTime must not download that to learn a yes/no. This module
 * keeps exactly the columns `resolveResult` (lib/saved/results.mjs) reads to decide a saved forecast's state
 * and outcome, and expands them back into rows of the SAME shape, so the Saved owner's own function is what
 * decides. Nothing here grades, and there is no second settlement rule: a test runs `resolveResult` over the
 * full ledgers and over this projection for every graded event and requires identical state + outcome.
 *
 *   mlb   { "<gamePk>": "<moneyline><total><run_line>" }   W = WIN · L = LOSS · P = PUSH · - = no row
 *   nfl   [[eventId, hit]]   market "Winner" rows only            (the only market resolveResult reads)
 *   epl   [[eventId, hit]]   market "Match result" rows only
 *   ufc   [[eventId, hit]]   market "Fight winner" rows only
 *
 * `actual` and `gradedAt` are not carried: My GameTime links to /saved for the result itself.
 */

const MLB_MARKETS = ["moneyline", "total", "run_line"];
const MLB_CODE = { WIN: "W", LOSS: "L", PUSH: "P" };
const MLB_OUTCOME = { W: "WIN", L: "LOSS", P: "PUSH" };
const WINNER_MARKET = { nfl: "winner", epl: "match result", ufc: "fight winner" };
const MARKET_LABEL = { nfl: "Winner", epl: "Match result", ufc: "Fight winner" };
const norm = (s) => String(s ?? "").toLowerCase().trim();

export const SAVED_SETTLEMENTS_ARTIFACT = "my-saved-settlements";

/**
 * Build side: full parsed ledgers (results.mjs parseLedger output) → compact document.
 * @param {{ mlbGames?: any[], nfl?: any[], epl?: any[], ufc?: any[] }} [ledgers]
 */
export function compactLedgers({ mlbGames = [], nfl = [], epl = [], ufc = [] } = {}) {
  const byGame = new Map();
  for (const r of mlbGames) {
    if (!Number.isInteger(r?.gamePk) || !MLB_MARKETS.includes(r.market)) continue;
    const g = byGame.get(r.gamePk) ?? {};
    // resolveResult takes the FIRST row for (gamePk, market); keep the first here too.
    if (!(r.market in g)) g[r.market] = MLB_CODE[r.outcome] ?? "P"; // resolveResult: neither WIN nor LOSS ⇒ VOID
    byGame.set(r.gamePk, g);
  }
  const mlb = {};
  for (const pk of [...byGame.keys()].sort((a, b) => a - b)) {
    const g = byGame.get(pk);
    mlb[String(pk)] = MLB_MARKETS.map((m) => g[m] ?? "-").join("");
  }
  const pairs = (rows, sport) => {
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      if (norm(r?.market) !== WINNER_MARKET[sport] || typeof r?.eventId !== "string") continue;
      if (seen.has(r.eventId)) continue; // resolveResult uses the first matching row
      seen.add(r.eventId);
      out.push([r.eventId, r.hit === true ? true : r.hit === false ? false : null]);
    }
    return out;
  };
  return { schemaVersion: 1, artifact: SAVED_SETTLEMENTS_ARTIFACT, mlb, nfl: pairs(nfl, "nfl"), epl: pairs(epl, "epl"), ufc: pairs(ufc, "ufc") };
}

/** Client side: compact document → ledgers in the exact row shape resolveResult reads. Malformed ⇒ null. */
export function expandLedgers(doc) {
  if (!doc || doc.schemaVersion !== 1 || doc.artifact !== SAVED_SETTLEMENTS_ARTIFACT) return null;
  if (!doc.mlb || typeof doc.mlb !== "object" || ![doc.nfl, doc.epl, doc.ufc].every(Array.isArray)) return null;
  const mlbGames = [];
  for (const [pk, codes] of Object.entries(doc.mlb)) {
    if (!/^\d+$/.test(pk) || typeof codes !== "string" || codes.length !== 3) continue;
    MLB_MARKETS.forEach((market, i) => {
      const o = MLB_OUTCOME[codes[i]];
      if (o) mlbGames.push({ gamePk: Number(pk), market, outcome: o, actual: null, gradedAt: null });
    });
  }
  const rows = (pairs, sport) => pairs
    .filter((p) => Array.isArray(p) && typeof p[0] === "string")
    .map(([eventId, hit]) => ({ eventId, market: MARKET_LABEL[sport], hit, actual: null, when: null }));
  return { mlbGames, nfl: rows(doc.nfl, "nfl"), epl: rows(doc.epl, "epl"), ufc: rows(doc.ufc, "ufc") };
}
