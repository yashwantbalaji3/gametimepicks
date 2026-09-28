/**
 * WHERE A GAME CARD'S FEATURED ROWS COME FROM — server only (the hub roster builder).
 *
 * The live-props producer freezes a game's predictions at its first capture, walking the frozen board
 * as `board.players × LIVE_FAMILIES`, skipping a player with no canonical ESPN id and a family with no
 * slot. Before any capture there is no artifact, so the card must select from the board itself — and
 * the two paths must select the SAME five, or membership would change at kickoff.
 *
 * So there is one precedence, and the board path mirrors the producer's own iteration exactly:
 *
 *   1. a committed live-props artifact with rows → its FROZEN rows. Once a record is frozen it is the
 *      truth, even where the board now carries something the frozen record does not (every touchdown
 *      row frozen on 2026-09-27 lacks the probability its board carries — and must stay without it).
 *   2. otherwise → rows derived from the frozen board, in the shape the producer would freeze.
 *
 * Verified on the 2026-09-27 slate: for all nine captured games, board-derived rows equal the
 * artifact's rows in membership AND order (`featured-source.test.mjs` keeps that true).
 */
import { LIVE_FAMILIES, espnAthleteId } from "../sports/nfl/live-prop-state.mjs";

/** The producer's frozen record for one slot, built the way `buildLiveRows` builds `fresh`. */
function frozenFromSlot(slot, player, board) {
  return {
    projection: {
      median: slot.median ?? null,
      p10: slot.p10 ?? null,
      p90: slot.p90 ?? null,
      probability: slot.probability ?? null,
    },
    market: slot.market ?? null,
    pricingState: slot.pricingState ?? null,
    participation: player.participation ?? null,
    forecastGeneratedAt: board.generatedAt ?? null,
  };
}

/** Rows as the producer would first freeze them — same ids, same order, same frozen fields. */
export function featuredRowsFromBoard(board, providerEventId = board?.providerEventId) {
  const rows = [];
  if (!board || providerEventId === undefined || providerEventId === null) return rows;
  for (const p of board.players ?? []) {
    if (!espnAthleteId(p?.playerId)) continue;
    for (const family of LIVE_FAMILIES) {
      const slot = p.markets?.[family];
      if (!slot) continue;
      rows.push({
        predictionId: `${providerEventId}:${p.playerId}:${family}`,
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        family,
        familyState: board.families?.[family]?.state ?? null,
        frozen: frozenFromSlot(slot, p, board),
        live: null,
      });
    }
  }
  return rows;
}

/** The rows a card selects from, and which owner supplied them. */
export function featuredSelectionRows({ board = null, artifact = null } = {}) {
  if (Array.isArray(artifact?.rows) && artifact.rows.length > 0) return { rows: artifact.rows, source: "live-props" };
  return { rows: featuredRowsFromBoard(board), source: "board" };
}
