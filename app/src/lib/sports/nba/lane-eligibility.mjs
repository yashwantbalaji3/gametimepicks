/**
 * NBA SITE ELIGIBILITY — the website's /nba/projections board and its Top Boards decide who may be featured with the SAME
 * function as the social cards (player-eligibility.mjs, founder 2026-11-11: one standard; PD 2026-11-12). PURE; no I/O.
 *
 * SWITCH: `GTP_NBA_SITE_SHARED_ELIGIBILITY=1` (default OFF). Off ⇒ nothing here runs and every page is byte-identical.
 *
 * INPUT: the committed per-slate eligibility file `app/public/data/nba/player-eligibility/<date>.json` (schema
 * PLAYER_ELIGIBILITY_SCHEMA), written by the NBA workflow from the repo's own roster and injury captures (producer:
 * bb-social). Its `players` map is player-eligibility.mjs's `elig` ({ id: { guard, status, hideAll, rowHide, hideCells } })
 * and `withheld` lists the model-review withholds ("<id>.<stat>"). The file is the #1323 post-freeze precedent: public,
 * facts only. Reasons never reach the page; they stay in the returned audit.
 *   no file      → basis MODEL_REVIEW_ONLY: only the model-review withhold applies (none without a file), labelled
 *   valid file   → basis ELIGIBILITY_FILE
 *   foreign or malformed file → basis MALFORMED: fail closed, every player UNKNOWN_NOT_ASSESSED (no row shown)
 *
 * WHAT IT CHANGES: which rows and which cells show, never a number.
 * - A stat cell is shown only when player-eligibility.mjs `exclusionReasons` is empty for that stat. A combo (PRA, P+R,
 *   P+A) needs every component eligible.
 * - A player with no eligible stat is left off the board. An ineligible cell carries null, the board's missing value.
 * Applied to a VIEW copy only: the lane snapshot itself (provenance, receipts, post-game actuals, "no projection" rows)
 * is never touched, so every consistency check still runs against the published file.
 */
import { exclusionReasons } from "./player-eligibility.mjs";
import { STATS, COMBO_STATS } from "./experimental-public-lane.mjs";

export const SITE_ELIGIBILITY_ENV = "GTP_NBA_SITE_SHARED_ELIGIBILITY";
export const PLAYER_ELIGIBILITY_SCHEMA = "gtp.nba.player-eligibility@1";
export const PLAYER_ELIGIBILITY_REL = (date) => `app/public/data/nba/player-eligibility/${date}.json`;
export const ELIGIBILITY_BASIS = Object.freeze({ FILE: "ELIGIBILITY_FILE", MODEL_REVIEW_ONLY: "MODEL_REVIEW_ONLY", MALFORMED: "MALFORMED" });
/** Combo → its components (game-sim.mjs COMBO_KEYS). */
export const COMBO_COMPONENTS = Object.freeze({ pra: ["pts", "reb", "ast"], ptsReb: ["pts", "reb"], ptsAst: ["pts", "ast"] });

/** @param {Record<string, string | undefined>} [env] */
export const siteEligibilityEnabled = (env = process.env) => env?.[SITE_ELIGIBILITY_ENV] === "1";

/**
 * The module inputs from one slate's eligibility document (null = no file).
 * @param {any} doc  @param {string | null} date
 */
export function eligibilityInputs(doc, date) {
  if (doc == null) return { basis: ELIGIBILITY_BASIS.MODEL_REVIEW_ONLY, elig: null, withheld: new Set() };
  const ok = doc.schema === PLAYER_ELIGIBILITY_SCHEMA && doc.sport === "nba" && doc.date === date
    && doc.players && typeof doc.players === "object" && !Array.isArray(doc.players) && Array.isArray(doc.withheld ?? []);
  if (!ok) return { basis: ELIGIBILITY_BASIS.MALFORMED, elig: {}, withheld: new Set() };
  return { basis: ELIGIBILITY_BASIS.FILE, elig: doc.players, withheld: new Set((doc.withheld ?? []).map(String)) };
}

/**
 * A VIEW of the lane snapshot with each player's ineligible cells nulled and fully ineligible players removed.
 * @param {any} snapshot  nba-experimental-public-snapshot@1
 * @param {{ basis: string, elig: any, withheld: Set<string> }} inputs  eligibilityInputs(...)
 * @returns {{ snapshot: any, basis: string, audit: { eventId: string, playerId: string, shown: string[], hidden: string[], reasons: string[] }[] }}
 */
export function eligibleLaneView(snapshot, inputs) {
  const { elig, withheld, basis } = inputs;
  const audit = [];
  const games = (snapshot?.games ?? []).map((g) => {
    const players = { ...g.players };
    for (const side of ["away", "home"]) {
      players[side] = (g.players?.[side] ?? []).flatMap((r) => {
        const id = String(r.providerAthleteId);
        const why = Object.fromEntries(STATS.map(([k]) => [k, exclusionReasons(id, k, { elig, withheld })]));
        const okBase = new Set(STATS.map(([k]) => k).filter((k) => !why[k].length));
        const okCombo = new Set(COMBO_STATS.map(([k]) => k).filter((k) => COMBO_COMPONENTS[k].every((c) => okBase.has(c))));
        const shown = [...okBase, ...okCombo];
        const hidden = [...STATS, ...COMBO_STATS].map(([k]) => k).filter((k) => !shown.includes(k));
        const reasons = [...new Set(Object.values(why).flat())];
        if (hidden.length) audit.push({ eventId: String(g.providerEventId), playerId: id, shown, hidden, reasons });
        if (!okBase.size) return [];
        if (!hidden.length) return [r];
        return [{
          ...r,
          medians: Object.fromEntries(Object.entries(r.medians ?? {}).map(([k, v]) => [k, okBase.has(k) ? v : null])),
          ...(r.comboMedians ? { comboMedians: Object.fromEntries(Object.entries(r.comboMedians).map(([k, v]) => [k, okCombo.has(k) ? v : null])) } : {}),
        }];
      });
    }
    return { ...g, players };
  });
  return { snapshot: snapshot ? { ...snapshot, games } : snapshot, basis, audit };
}

/**
 * GAME PAGE (the Theater's Default view, NbaPossessionGamePage → official-predictions.tsx): the official snapshot's player
 * rows through the same VIEW. A player off the view is dropped, a cell the view nulled is null; every other number is the
 * snapshot's own. The lane game passed to the page is the view's game, so combo cells follow the same rule.
 * @param {any} official  the page's official payload ({ eventId, players: [{ playerId, medians, ... }] })
 * @param {any} viewGame  eligibleLaneView(...).snapshot game for the same event (null → unchanged)
 */
export function eligibleOfficial(official, viewGame) {
  if (!official || !viewGame || String(viewGame.providerEventId) !== String(official.eventId)) return official;
  const rows = new Map([...(viewGame.players?.away ?? []), ...(viewGame.players?.home ?? [])].map((r) => [String(r.providerAthleteId), r]));
  const players = (official.players ?? []).flatMap((p) => {
    const r = rows.get(String(p.playerId));
    if (!r) return [];
    return [{ ...p, medians: Object.fromEntries(Object.entries(p.medians ?? {}).map(([k, v]) => [k, r.medians && k in r.medians && r.medians[k] === null ? null : v])) }];
  });
  return { ...official, players };
}
