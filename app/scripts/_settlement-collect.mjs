/**
 * Shared soccer-settlement product collection — extracts every pending soccer product for a slate from the
 * committed artifacts (Mr. Dub daily-portfolio lanes + World Cup Specials + WC parlay cards) and normalizes
 * each leg into the engine's GradeableLeg shape. Pure read; no fetching, no fabrication, no writes. Used by
 * both the read-only runner and the (gated) persist step so they grade identical inputs.
 */
import fs from "node:fs";
import path from "node:path";

const normT = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Parse a daily-portfolio lane leg id. Supports both id formats:
 *   • numeric  "team:47:moneyline_90:away"                       — matchId 47, side "away"
 *   • WC-pool  "WORLD_CUP:<hash>:moneyline_90:Brazil"            — no numeric id; bind by matchup NAME and
 *                                                                  resolve moneyline side home/away by team.
 *  Side is resolved by MARKET (kind-agnostic), so the WC-team-pool "WORLD_CUP" kind grades correctly. */
export function parseLaneLeg(l) {
  const parts = String(l.id ?? "").split(":");
  const kind = parts[0], market = parts[2] ?? "", tail = parts.slice(3).join(":");
  const sel = String(l.selection ?? "");
  const numericId = Number(parts[1]);
  const matchId = Number.isFinite(numericId) ? numericId : (l.matchup ?? null); // hash id ⇒ bind by name
  const home = String(l.matchup ?? "").split(/\s+vs\s+/i)[0];
  let side = null;
  if (market === "moneyline_90") {
    if (tail === "home" || tail === "away") side = tail;                 // numeric-id format
    else { const team = tail || sel.replace(/\s+to win.*/i, ""); side = normT(team) === normT(home) ? "home" : "away"; }
  } else if (market === "match_total_goals") side = /under/i.test(sel) ? "under" : "over";
  else if (market === "btts") side = /\bno\b|:\s*no/i.test(sel) ? "no" : "yes";
  else if (market === "player_assists" || market === "player_shots_on_target" || market === "player_shots") side = "over";
  const pt = sel.match(/(\d+(?:\.\d+)?)/);
  return { id: String(l.id ?? ""), matchId, market, selection: sel, side, player: l.player ?? (kind === "player" ? tail : null),
    point: pt ? Number(pt[1]) : null, oddsAmerican: Number(l.odds ?? 0), matchup: l.matchup ?? null };
}

/** Parse a WC Specials / parlay leg (schema: kind/eventId/market/participant/side/line/odds). */
export function parseSpecialLeg(l) {
  const market = String(l.market ?? ""), fixture = String(l.fixture ?? "");
  const [home] = fixture.split(/\s+vs\s+/i);
  let side = null, player = null;
  if (l.kind === "team") {
    if (market === "moneyline_90") side = normT(l.participant) === normT(home) ? "home" : "away";
    else if (market === "match_total_goals") side = /under/i.test(String(l.side ?? l.participant)) ? "under" : "over";
    else if (market === "btts") side = /no/i.test(String(l.side ?? l.participant)) ? "no" : "yes";
  } else {
    player = l.participant ?? l.player ?? null;
    if (market === "player_assists" || market === "player_shots_on_target" || market === "player_shots") side = "over";
  }
  // eventId is the projection matchId — a NUMERIC id for some feeds but a HASH string for World Cup fixtures.
  // Number(hash) is NaN, which fails EVERY official join (team findMatch AND the player matchId scope) and
  // strands the card pending forever. Mirror parseLaneLeg: keep a finite numeric id, else bind by the hash id
  // / fixture NAME — the official bundle (fetch_official_soccer.py) keys each match under BOTH the projection
  // matchId AND the "Home vs Away" name, so either resolves. Never NaN.
  const rawEvent = l.eventId != null ? String(l.eventId).trim() : "";
  const numericEvent = Number(rawEvent);
  // Empty/absent eventId → bind by fixture NAME (never 0, which Number(null)/Number("") would yield). A
  // finite numeric id stays numeric; a hash id binds by the hash string. All three key the official bundle.
  const matchId = rawEvent === "" ? (fixture || null) : (Number.isFinite(numericEvent) ? numericEvent : rawEvent);
  return { id: l.legId ?? l.id ?? "", matchId, market,
    selection: `${l.participant ?? ""}${l.side ? " " + l.side : ""}`.trim(), side, player,
    point: typeof l.line === "number" ? l.line : null, oddsAmerican: Number(l.odds ?? 0), matchup: fixture };
}

export function collectForDate(dataDir, date) {
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, ...rel.split("/")), "utf8")); } catch { return null; } };
  const cards = [];
  const dp = read(`mr-dub/daily-portfolio.json`);
  if (dp && dp.date === date) {
    for (const lane of dp.lanes ?? []) {
      if (lane.status && lane.status !== "active") continue; // only PLACED lanes settle — awaiting/candidate carry no exposure
      const product = lane.product || (lane.stake >= 100 ? "bank-builder" : "moonshot");
      cards.push({ product, label: `${lane.lane === "A" ? "Lane A" : "Lane B"} (stake $${lane.stake})`, stake: Number(lane.stake ?? 0), legs: (lane.legs ?? []).map(parseLaneLeg) });
    }
  }
  const sp = read(`world-cup/world-cup-specials.json`);
  if (sp && sp.date === date) for (const c of sp.cards ?? []) cards.push({ product: "wc-specials", label: c.title ?? "WC Special", stake: Number(c.stakePreview ?? c.stake ?? 0), legs: (c.legs ?? []).map(parseSpecialLeg) });
  const pl = read(`world-cup/parlays/${date}.json`);
  if (pl) for (const c of pl.cards ?? []) cards.push({ product: "wc-parlay", label: c.title ?? c.name ?? "WC Parlay", stake: Number(c.stakePreview ?? c.stake ?? 0), legs: (c.legs ?? []).map(parseSpecialLeg) });
  return cards;
}
