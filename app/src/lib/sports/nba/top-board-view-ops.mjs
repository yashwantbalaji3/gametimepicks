/**
 * NBA Top Boards — view operations that run in the BROWSER (the private preview table): sort, filter and the control
 * options. Pure and dependency-free on purpose — top-board-rows.mjs (server) reaches receipt hashing (node:crypto)
 * through top-boards.mjs, which a client bundle cannot load. top-board-rows.mjs re-exports everything here unchanged.
 */
export const NO_AUTHORIZED_PRICE = "NO_AUTHORIZED_PRICE";
export const NO_PRICE_TEXT = "No authorized NBA price";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const compareStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const SORT_KEYS = Object.freeze(["projection", "game", "player", "market", "sportsbook", "edge"]);
export const SORT_LABELS = Object.freeze({ projection: "Projection", game: "Game", player: "Player", market: "Market", sportsbook: "Sportsbook", edge: "Edge / EV" });
const DEFAULT_DIR = { projection: "desc", edge: "desc", game: "asc", player: "asc", market: "asc", sportsbook: "asc" };

/** Deterministic sort; null keys always last; ties → rowId. */
export function sortRowViews(views, key = "projection", dir = DEFAULT_DIR[key] ?? "asc") {
  if (!SORT_KEYS.includes(key)) throw new Error(`sortRowViews: unknown key ${key}`);
  const s = dir === "desc" ? -1 : 1;
  return [...views].sort((a, b) => {
    const x = a.sortKeys[key]; const y = b.sortKeys[key];
    if (x == null && y == null) return compareStr(a.rowId, b.rowId);
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : compareStr(String(x), String(y));
    return c * s || compareStr(a.rowId, b.rowId);
  });
}

/**
 * Filters: { game, player, market, sportsbook, minProjection, minEdge } — "all"/""/null means no filter.
 * `player` matches the providerAthleteId exactly or a case-insensitive substring of the name.
 * A `minEdge` or `sportsbook` filter keeps only priced rows — so while nothing is priced it empties the table,
 * which is why the UI disables both (filterOptions).
 */
export function filterRowViews(views, f = {}) {
  const on = (v) => v != null && v !== "" && v !== "all";
  const q = on(f.player) ? String(f.player).trim().toLowerCase() : null;
  return views.filter((r) => {
    if (on(f.game) && r.game.eventId !== String(f.game)) return false;
    if (on(f.market) && r.market.key !== f.market) return false;
    if (q && r.player.providerAthleteId !== q && !(r.player.name ?? "").toLowerCase().includes(q)) return false;
    if (on(f.sportsbook) && r.price.sportsbook.value !== f.sportsbook) return false;
    if (isNum(f.minProjection) && !(isNum(r.projection.value) && r.projection.value >= f.minProjection)) return false;
    if (isNum(f.minEdge) && !(isNum(r.sortKeys.edge) && r.sortKeys.edge >= f.minEdge)) return false;
    return true;
  });
}

/** What the controls can offer, and why a control is disabled. */
export function filterOptions(model) {
  const games = new Map();
  for (const r of model?.rows ?? []) if (!games.has(r.game.eventId)) games.set(r.game.eventId, { value: r.game.eventId, tipoffUtc: r.game.tipoffUtc, label: `${r.game.homeAway === "home" ? `${r.game.opponent?.abbr ?? "?"} @ ${r.player.team?.abbr ?? "?"}` : `${r.player.team?.abbr ?? "?"} @ ${r.game.opponent?.abbr ?? "?"}`}` });
  const books = [...new Set((model?.rows ?? []).map((r) => r.price.sportsbook.value).filter((b) => typeof b === "string"))].sort();
  const anyEdge = (model?.rows ?? []).some((r) => isNum(r.sortKeys.edge));
  const disabledWhy = `Disabled — ${NO_PRICE_TEXT} (${NO_AUTHORIZED_PRICE}).`;
  return {
    games: [...games.values()].sort((a, b) => compareStr(`${a.tipoffUtc}|${a.value}`, `${b.tipoffUtc}|${b.value}`)),
    markets: (model?.markets ?? []).map((m) => ({ value: m.key, label: m.label, state: m.state, disabled: m.state !== "RANKED" })),
    sportsbooks: books,
    sportsbookEnabled: books.length > 0,
    sportsbookDisabledReason: books.length ? null : disabledWhy,
    edgeEnabled: anyEdge,
    edgeDisabledReason: anyEdge ? null : disabledWhy,
    sorts: SORT_KEYS.map((k) => ({ key: k, label: SORT_LABELS[k], disabled: (k === "edge" && !anyEdge) || (k === "sportsbook" && !books.length), disabledReason: (k === "edge" && !anyEdge) || (k === "sportsbook" && !books.length) ? disabledWhy : null })),
  };
}
