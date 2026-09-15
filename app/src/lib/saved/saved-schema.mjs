/**
 * SAVED FORECASTS — the schema and the pure rules (P310). No react, no browser: the store hook wraps these.
 *
 * A saved forecast is an IMMUTABLE SNAPSHOT of what the reader saw when they saved it — the forecast, the model's
 * public state, the artifact's own stamp — so a later model change, pause or regeneration never rewrites what was
 * saved. "Saved then" stays; "current now" is looked up beside it, never merged into it. It is an analytics item,
 * not a wager: no stake, no odds, no return.
 *
 *   key        gtp.saved.v1          versioned; parseStore() migrates or refuses (never guesses)
 *   cap        SAVED_MAX (60)        a shortlist a reader can actually revisit
 *   identity   `id` = the card id (mlb-<gamePk>, nfl-<providerEventId>, epl-<eventId>, ufc-<boutId>) — one save per event
 */

export const SAVED_STORAGE_KEY = "gtp.saved.v1";
export const SAVED_SCHEMA_VERSION = 1;
export const SAVED_MAX = 60;
export const SAVED_CHANNEL = "gtp:saved";

const isStr = (v) => typeof v === "string" && v.length > 0;

/** The settlement key a saved forecast carries so a later result can be joined fail-closed (results.mjs). */
export function isSettlementKey(k) {
  if (!k || typeof k !== "object") return false;
  switch (k.kind) {
    case "mlb-game": return Number.isInteger(k.gamePk) && isStr(k.family);
    case "nfl-event": return isStr(k.providerEventId) && isStr(k.family);
    case "epl-event": return isStr(k.eventId) && isStr(k.family);
    case "ufc-bout": return isStr(k.date) && isStr(k.red) && isStr(k.blue);
    default: return false;
  }
}

/** A saved forecast as stored. Every field is a plain value; nothing here is recomputed later. */
export function isSavedForecast(x) {
  return !!x && typeof x === "object"
    && isStr(x.id) && isStr(x.sport) && isStr(x.href) && isStr(x.matchup)
    && isStr(x.family) && isStr(x.value)
    && isStr(x.modelState) && isStr(x.savedAt)
    && (x.startUtc == null || isStr(x.startUtc))
    && (x.updatedAt == null || isStr(x.updatedAt))
    && isSettlementKey(x.settlement);
}

/** Build the snapshot from a card (lib/command-center/contract PredictionCardModel) at save time. */
export function snapshotFromCard(card, { savedAt, sourceRoute }) {
  const signal = card.signal?.kind === "SIM_STRENGTH" ? `Simulation strength: ${String(card.signal.label).toLowerCase()}`
    : card.signal?.kind === "PROBABILITY" ? `${Math.round(card.signal.probability * 100)}% chance · ${card.signal.of}`
      : card.signal?.kind === "RANGE" ? `${card.signal.low}–${card.signal.high} ${card.signal.unit} · ${card.signal.coverage}`
        : null;
  return {
    schemaVersion: SAVED_SCHEMA_VERSION,
    id: card.id,
    sport: card.sport,
    href: card.href,
    startUtc: card.startUtc ?? null,
    matchup: `${card.away.name} ${card.sport === "epl" ? "v" : card.sport === "ufc" ? "vs" : "@"} ${card.home.name}`,
    context: card.context ?? null,
    family: card.forecast.label,
    value: card.forecast.value,
    sub: card.forecast.sub ?? null,
    signal,
    modelState: card.status?.state ?? "UNKNOWN",
    modelFamily: card.status?.family ?? null,
    updatedAt: card.freshness?.updatedAt ?? null,
    settlement: card.settlement,
    savedAt,
    sourceRoute,
  };
}

/** Parse whatever is in storage into a clean list. Unknown versions and malformed items are dropped, never guessed. */
export function parseStore(raw) {
  if (!raw) return [];
  let doc;
  try { doc = JSON.parse(raw); } catch { return []; }
  if (!doc || typeof doc !== "object" || doc.version !== SAVED_SCHEMA_VERSION || !Array.isArray(doc.items)) return [];
  const seen = new Set();
  const out = [];
  for (const it of doc.items) {
    if (!isSavedForecast(it) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out.slice(0, SAVED_MAX);
}

export function serializeStore(items) {
  return JSON.stringify({ version: SAVED_SCHEMA_VERSION, items: items.slice(0, SAVED_MAX) });
}

/** Save: one per id; a second save of the same event is a no-op (the ORIGINAL snapshot stands). Newest first. */
export function upsert(items, snapshot) {
  if (!isSavedForecast(snapshot)) return items;
  if (items.some((i) => i.id === snapshot.id)) return items;
  return [snapshot, ...items].slice(0, SAVED_MAX);
}

export function remove(items, id) {
  return items.filter((i) => i.id !== id);
}
