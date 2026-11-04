/**
 * CHALLENGE LANES · card@2 FIELD SPLIT. PURE, dependency-free (safe for the projection and the site build).
 * The repo is public and a book line is price data: a classified (Level A/B) card's line, book, price, quote times and
 * line-dependent hit rates live only in the encrypted price display; the public projection keeps identity, side,
 * model projection and evidence class.
 */

/** Verbatim public text for the site and graphics (the site never derives one). */
export const EVIDENCE_LABEL = Object.freeze({ LEVEL_A: "Model-validated value", LEVEL_B: "Historical hit-rate research (experimental)" });
/** Lane specialization (founder ~19:55Z, proposed): lane A = NBA moneylines, lane B = NBA player props, both products. */
export const LANE_TYPE = Object.freeze({ NBA_MONEYLINE: "NBA_MONEYLINE", NBA_PLAYER_PROPS: "NBA_PLAYER_PROPS" });
export const LANE_TYPE_LABEL = Object.freeze({ NBA_MONEYLINE: "NBA MONEYLINES", NBA_PLAYER_PROPS: "NBA PLAYER PROPS" });
const LANE_ALIAS = { moneyline: "NBA_MONEYLINE", props: "NBA_PLAYER_PROPS", NBA_MONEYLINE: "NBA_MONEYLINE", NBA_PLAYER_PROPS: "NBA_PLAYER_PROPS" };
export const laneTypeOf = (x) => LANE_ALIAS[x] ?? null;
/** A leg's fit to a lane type: null when it fits (or the lane is untyped), else the refusal. */
export const laneTypeRefusal = (laneType, leg) => { const t = laneTypeOf(laneType); if (!t) return null; const ml = leg.family === "winner" || leg.market === "winner" || leg.market === "h2h"; return (t === "NBA_MONEYLINE") === ml ? null : `LANE_TYPE_MISMATCH ${leg.legId}: a ${ml ? "moneyline" : "player-prop"} leg on a ${LANE_TYPE_LABEL[t]} lane`; };
/** The combined-price label by pricing method (site prints it verbatim). */
export const COMBINED_LABEL = Object.freeze({ LEG_PRODUCT: "calculated leg product", CALCULATED_LEG_PRODUCT: "calculated leg product", BOOK_QUOTED_PARLAY: "book-quoted parlay" });

/** Founder 2026-11-04 ~19:40Z: the label on every DAILY RESEARCH SELECTION card, verbatim. */
export const SELECTION_LABEL = Object.freeze({ RESEARCH: "RESEARCH SELECTION — NO VALIDATED EDGE CLAIM", STRICT: null });
/** Disclosed-limitation flag codes (public: codes only; the full text carries line-dependent counts and stays encrypted). */
export const FLAG_CODES = Object.freeze(["B_ROLE_UNSTABLE", "B_MINUTES_VOLATILE", "B_MINUTES_DROP", "B_MINUTES_UNCERTAIN", "C_LINEUP_UNCERTAIN", "C_LINEUP_MEDIUM", "C_LINEUP_HIGH", "ML_SMALL_SAMPLE", "ML_ROSTER_TURNOVER", "ML_KEY_OUT", "ML_KEY_DTD", "ML_TOP5_OUT", "ML_KEY_UNCERTAIN", "ML_BACK_TO_BACK"]);
/** Flag strings ("CODE legId: text") → public [{ legId, code, level }]; the internal HIGH ranking weight is dropped. */
export function publicFlags(flags = []) {
  const out = [];
  for (const f of flags) {
    const [code, rawLeg] = String(f).split(" ");
    if (!FLAG_CODES.includes(code)) continue;
    const legId = String(rawLeg ?? "").replace(/:$/, "");
    out.push({ legId, code, level: code === "C_LINEUP_HIGH" ? "HIGH" : code === "C_LINEUP_MEDIUM" ? "MEDIUM" : null });
  }
  return out;
}

/* ───────────────────────────── public / private split (the repo is public; a book line is price data) ───────────────────────────── */

/** Book-derived or line-dependent leg fields: never in a plain public file, only in the encrypted display. */
export const PRIVATE_LEG_FIELDS = Object.freeze(["line", "book", "price", "quotedAt", "fetchedAt", "hitRate", "quote", "flagText", "lineupContext", "evidenceLine"]);
/** The public view of a card@2 leg: identity, side, model projection and class; no line, price, book or hit rate. */
export const publicLeg = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => !PRIVATE_LEG_FIELDS.includes(k)));
/** The private (encrypted-display) view of a card@2 leg: everything computed against the line. Hit rates as {window, k, n}. */
export const privateLeg = (l, { maxQuoteAgeMs = 90 * 60 * 1000 } = {}) => ({
  legId: l.legId, line: l.line ?? null, side: l.side, book: l.book ?? null, american: l.price ?? null, quotedAt: l.quotedAt ?? null, fetchedAt: l.fetchedAt ?? null,
  staleAfter: l.fetchedAt ? new Date(Date.parse(l.fetchedAt) + maxQuoteAgeMs).toISOString() : null,
  hitRates: (l.hitRate?.windows ?? []).map((w) => ({ window: w.window, k: w.hits, n: w.n })), lineBasis: l.hitRate?.lineBasis ?? null,
  evidenceLine: evidenceLine(l), flagText: l.flagText ?? [], lineup: l.lineupContext ?? null,
});

/**
 * The one evidence line for a graphic or caption: "Hit 8/10 L10 · 14/20 L20", from a card@2 leg's hitRate windows
 * (`last10`, `last20`) or a price-display legDetails' hitRates. Counts only, never a percentage; null when a window is
 * missing (the renderer then refuses the leg rather than inventing one).
 */
export function evidenceLine(leg, windows = ["last10", "last20"]) {
  if (leg?.family === "winner") return moneylineEvidenceLine(leg);
  const rows = leg?.hitRate?.windows?.map((w) => ({ window: w.window, k: w.hits, n: w.n })) ?? leg?.hitRates ?? [];
  const parts = windows.map((name) => { const w = rows.find((x) => x.window === name); return w && Number.isInteger(w.k) && Number.isInteger(w.n) ? `${w.k}/${w.n} L${name.replace(/^last/, "")}` : null; });
  return parts.every(Boolean) ? `Hit ${parts.join(" · ")}` : null;
}

/**
 * Moneyline research line (no probability): "Model side DET · market favourite DET · W-L L5 4-1 · L10 6-1 · season 6-1 ·
 * home 2-0 · key out/DTD: …". Null unless the model side, the market favourite and the L5/L10 W-L windows are present.
 */
export function moneylineEvidenceLine(leg) {
  const w = (name) => leg?.hitRate?.windows?.find((x) => x.window === name || x.window?.startsWith(`${name}-`));
  const wl = (x) => (x ? `${x.hits}-${x.n - x.hits}` : null);
  const nv = leg?.hitRate?.shrunk?.marketNoVig;
  if (!leg?.eloSide || typeof nv !== "number" || !w("last5") || !w("last10")) return null;
  const team = leg.team ?? leg.teamAbbr ?? "?";
  const venue = w(leg.side === "home" ? "home" : "away");
  const keys = (leg.injury?.keyPlayers ?? []).map((p) => `${p.name} ${p.status}`);
  return [`Model side ${leg.eloSide === leg.side ? team : "opponent"}`, `market favourite ${nv > 0.5 ? team : "opponent"}`, `W-L L5 ${wl(w("last5"))}`, `L10 ${wl(w("last10"))}`, ...(w("season") ? [`season ${wl(w("season"))}`] : []), ...(venue ? [`${leg.side} ${wl(venue)}`] : []), ...(keys.length ? [`key out/DTD: ${keys.join(", ")}`] : [])].join(" · ");
}
