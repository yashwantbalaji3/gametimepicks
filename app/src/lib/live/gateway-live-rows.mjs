/**
 * SESSION 5 — THE /live HUB'S LIVE FACTS COME FROM THE GATEWAY, NOT FROM A PRODUCER THAT MAY NOT RUN.
 *
 * The documented split (Live Props Phase A): factual live state → the gateway (`/api/live`, ESPN public
 * box score, identity `nfl-athlete-<espnId>`, a blank cell never becomes 0); frozen pregame + settlement
 * → the producer artifact `public/data/nfl/live-props/<eventId>.json`.
 *
 * The V2D cards read BOTH halves from the producer artifact. The producer has been dispatch-only since
 * the 2026-09-27 paid-probe incident, so on 2026-10-01 PIT @ CLE the hub showed a live score and clock
 * from the gateway while every featured row said "Live tracking temporarily unavailable" — the file was
 * a 404 and the gateway held Warren 5 rush yds, Metcalf 2 rec · 22 yds at the same moment.
 *
 * This merges the two by the producer's OWN key (`${providerEventId}:${playerId}:${family}`):
 *   - a gateway measurement sets `live.statValue` / `live.observedAt` (the gateway's fetchedAt);
 *   - a producer row keeps its settlement and its frozen block; the gateway never writes a result;
 *   - a family the gateway does not carry (anytime TD, ESTIMATE passing) is left exactly as the producer
 *     wrote it — absent if the producer never ran, which the card states per row.
 *
 * Pure. No fetch, no clock.
 */

/** The families the NFL gateway adapter reads (espn-nfl.mjs MARKET_BY_GROUP_LABEL). */
export const GATEWAY_FAMILIES = Object.freeze(["player_rush_yds", "player_receptions", "player_reception_yds"]);

const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param {{ providerEventId: string, artifact: any|null, envelope: any|null }} p
 *   artifact — the producer's live-props record, or null when it could not be read
 *   envelope — the gateway response (`{ fetchedAt, event: { providerEventId, playerStats } }`), or null
 * @returns {{ artifact: any|null, gatewayIds: Set<string>, gatewayRead: boolean }} the merged record (null
 *   only when neither source was read), the predictionIds whose live value came from the gateway, and
 *   whether the gateway answered for THIS event at all
 */
export function mergeGatewayLiveRows({ providerEventId, artifact, envelope }) {
  const gatewayIds = new Set();
  const ev = envelope?.event;
  const usable = ev && String(ev.providerEventId ?? ev.eventId ?? "") === String(providerEventId) && Array.isArray(ev.playerStats);
  if (!usable) return { artifact: artifact ?? null, gatewayIds, gatewayRead: false };
  const observedAt = ev.fetchedAt ?? envelope.fetchedAt ?? null;
  const rows = new Map();
  for (const r of artifact?.rows ?? []) if (r?.predictionId) rows.set(r.predictionId, r);
  for (const s of ev.playerStats) {
    if (!GATEWAY_FAMILIES.includes(s?.market)) continue;
    const value = finite(s.value);
    if (value === null || !/^nfl-athlete-\d+$/.test(String(s.playerId ?? ""))) continue;
    const id = `${providerEventId}:${s.playerId}:${s.market}`;
    const prev = rows.get(id);
    /* The producer's own observation wins only when it is newer than the gateway's. */
    const prevAt = Date.parse(prev?.live?.observedAt ?? "");
    if (prev && Number.isFinite(prevAt) && prevAt > Date.parse(observedAt ?? "")) continue;
    rows.set(id, { ...(prev ?? { predictionId: id, playerId: s.playerId, family: s.market }), live: { ...(prev?.live ?? {}), statValue: value, observedAt } });
    gatewayIds.add(id);
  }
  const prevObserved = Date.parse(artifact?.observedAt ?? "");
  const newest = Number.isFinite(prevObserved) && prevObserved > Date.parse(observedAt ?? "") ? artifact.observedAt : observedAt;
  return {
    artifact: { ...(artifact ?? { providerEventId, source: "espn-public-gateway" }), observedAt: newest, rows: [...rows.values()] },
    gatewayIds,
    gatewayRead: true,
  };
}

/**
 * The feed a ROW is entitled to: a family the gateway carries is measured if either source was read; any
 * other family (anytime TD) only if the producer record was. `undefined` producer state = a caller that
 * predates the split (the fixture) — the card-level feed stands.
 */
export function rowFeedFor({ family, feed, producerFeed, gatewayRead }) {
  if (producerFeed === undefined) return feed;
  if (GATEWAY_FAMILIES.includes(family)) return gatewayRead || producerFeed === "OK" ? "OK" : "UNAVAILABLE";
  return producerFeed === "OK" ? "OK" : "UNAVAILABLE";
}
