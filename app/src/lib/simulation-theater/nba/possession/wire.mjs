/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · THE ISLAND'S WIRE FORMAT. PURE and BROWSER-SAFE: its one import is
 * the import-free event codec.
 *
 * Page weight (PR 1167): the island's props travel in the RSC flight, and Next embeds the flight again inside the HTML,
 * escaped. The playback payload (payload.mjs buildPlaybackPayload — unchanged, still the loaders' contract) was ~286KB
 * of JSON per game, 97% of it the five stored event logs written as one object per event with every key repeated.
 * `packPlaybackPayload` (server, NbaPossessionSection) sends the same payload with each run's ONE event log as a
 * ledger (event-codec.mjs `nba-possession-events@1`: a column header, one compact row per event, player ids interned,
 * the fold's own running score / index / period left out), and a run's `rule` left out when it is the selection rule
 * for its kind (sent once, in `selection.rules`). `unpackPlaybackPayload` (browser, the island's useMemo) rebuilds the
 * payload, and the island then runs the unchanged playback / box / play-text code.
 * The pack REFUSES (throws, so the build fails) on anything it cannot rebuild: it unpacks its own output and compares
 * JSON.stringify of the two, so the page can never show a value that differs. Pinned by possession-wire.test.mjs.
 */
import { packEvents, unpackEvents } from "./event-codec.mjs";

export const PLAYBACK_WIRE_VERSION = 1;

/**
 * @param {object} payload  buildPlaybackPayload(game, panel)
 * @returns {object} the wire form (plain JSON)
 */
export function packPlaybackPayload(payload) {
  const rules = payload.selection?.rules ?? {};
  const wire = {
    ...payload,
    wire: PLAYBACK_WIRE_VERSION,
    runs: payload.runs.map(({ events, rule, ...r }) => ({ ...r, ...(rule === rules[r.kind] ? {} : { rule }), log: packEvents(events) })),
  };
  if (JSON.stringify(unpackPlaybackPayload(wire)) !== JSON.stringify(payload)) throw new Error("packPlaybackPayload: the wire does not rebuild the payload byte for byte");
  return wire;
}

/**
 * @param {object} wire  packPlaybackPayload(payload)
 * @returns {object} the payload, field for field and in payload.mjs key order
 */
export function unpackPlaybackPayload(wire) {
  const { wire: _v, runs, ...payload } = wire;
  const rules = payload.selection?.rules ?? {};
  return {
    ...payload,
    runs: runs.map(({ log, ...r }) => {
      const { kind, title, role, hypothetical, runIndex, rule = rules[kind], distance, final, periods, overtimePeriods, ...more } = r;
      return { kind, title, role, hypothetical, runIndex, rule, distance, final, periods, overtimePeriods, ...more, events: unpackEvents(log) };
    }),
  };
}
