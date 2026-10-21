/**
 * ONE POLICY FOR WHAT A PUBLIC PAYLOAD MAY CARRY ABOUT A SPORTSBOOK OFFER (eligible-operators@1).
 *
 * The render-time checks stop an ineligible book's name reaching the visible page, but a client component's
 * props are SERIALISED into the HTML (the RSC payload), and a `/data/...` JSON is served at its raw URL. Both
 * carried `"sportsbook":"betonlineag"` on /nfl/game/401872960 after the render fix (approval package O-6).
 *
 * So the check runs at the LOADER BOUNDARY: every reader that hands a player board, a Vault artifact or a
 * live-props record to a component (and therefore to the serialiser) passes it through here first. An offer
 * whose book is not eligible becomes `{ sportsbook: null, bookWithheld: "ineligible-operator" }` — its book,
 * line, odds and capture instant are dropped from the copy. Components render that state as "Price not shown".
 *
 * WHAT IS NEVER TOUCHED: projections (mean/median/p10/p90/probability), participation, live facts and
 * settlement records (including `settlement.line`, which is the graded record). Only the offer object is
 * replaced, and only in the in-memory or exported COPY — committed artifacts stay byte-identical. When
 * nothing is withheld the input object is returned as-is (same reference), so a clean artifact is unchanged.
 *
 * Pure and dependency-free apart from the allowlist, so it runs in the build, in a post-export step and in
 * the browser alike.
 */
import { isEligibleProvider } from "./eligible-operators.mjs";

export const BOOK_WITHHELD_INELIGIBLE = "ineligible-operator";

/** The one shape a withheld offer takes in any public payload. */
const withheld = () => ({ sportsbook: null, bookWithheld: BOOK_WITHHELD_INELIGIBLE });

/** True when an offer slot has been withheld by this policy. */
export function isWithheldOffer(offer) {
  return !!offer && typeof offer === "object" && offer.bookWithheld === BOOK_WITHHELD_INELIGIBLE;
}

/**
 * One captured offer → itself (eligible book) or the withheld shape (anything else, fail-closed: a missing,
 * empty or unknown book is not eligible). `null`/`undefined` pass through unchanged — an absent offer is a
 * typed absence elsewhere, not something to invent.
 */
export function sanitizeOffer(offer) {
  if (offer == null || typeof offer !== "object") return offer;
  if (isWithheldOffer(offer)) return offer.sportsbook === null && Object.keys(offer).length === 2 ? offer : withheld();
  return isEligibleProvider(offer.sportsbook) ? offer : withheld();
}

/** A player board (`nfl/player-board/<eventId>.json`): `players[].markets[family].market`. */
export function sanitizePlayerBoard(board) {
  if (!board || !Array.isArray(board.players)) return board;
  let n = 0;
  const players = board.players.map((p) => {
    if (!p || typeof p.markets !== "object" || p.markets === null) return p;
    let markets = null;
    for (const [k, e] of Object.entries(p.markets)) {
      if (!e || typeof e !== "object" || e.market == null) continue;
      const s = sanitizeOffer(e.market);
      if (s === e.market) continue;
      markets ??= { ...p.markets };
      markets[k] = { ...e, market: s };
      n += 1;
    }
    return markets ? { ...p, markets } : p;
  });
  return n ? { ...board, players } : board;
}

/** A live-props record (`nfl/live-props/<eventId>.json`): `rows[].frozen.market`. Settlement is not read. */
export function sanitizeLivePropsArtifact(artifact) {
  if (!artifact || !Array.isArray(artifact.rows)) return artifact;
  let n = 0;
  const rows = artifact.rows.map((r) => {
    const m = r?.frozen?.market;
    if (m == null) return r;
    const s = sanitizeOffer(m);
    if (s === m) return r;
    n += 1;
    return { ...r, frozen: { ...r.frozen, market: s } };
  });
  return n ? { ...artifact, rows } : artifact;
}

/** The Endzone Vault (`nfl/end-zone-vault/<date>.json`): `selections[]` and `watchlist[]` `.marketPrice`. */
export function sanitizeVaultArtifact(vault) {
  if (!vault || typeof vault !== "object") return vault;
  let n = 0;
  const side = (list) =>
    Array.isArray(list)
      ? list.map((c) => {
          const m = c?.marketPrice;
          if (m == null) return c;
          const s = sanitizeOffer(m);
          if (s === m) return c;
          n += 1;
          return { ...c, marketPrice: s };
        })
      : list;
  const selections = side(vault.selections);
  const watchlist = side(vault.watchlist);
  return n ? { ...vault, selections, watchlist } : vault;
}

/**
 * A live-props JSON file's TEXT → the text a public copy may carry. Returns the input string unchanged
 * (byte-identical) when nothing is withheld; otherwise the sanitised record in the producer's own format
 * (2-space indent, trailing newline). Used by the post-export step on out/data only.
 */
export function sanitizeLivePropsJsonText(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { text, withheld: 0 }; }
  const out = sanitizeLivePropsArtifact(parsed);
  if (out === parsed) return { text, withheld: 0 };
  const withheldCount = (out.rows ?? []).filter((r) => isWithheldOffer(r?.frozen?.market)).length;
  return { text: `${JSON.stringify(out, null, 2)}\n`, withheld: withheldCount };
}
