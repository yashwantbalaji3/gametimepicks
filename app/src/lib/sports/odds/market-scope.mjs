/**
 * Per-sport market scope + three-way/pointed no-vig (Program 167 · Release C).
 *
 * Extends the Program-164 snapshot contract WITHOUT touching v1 semantics (v1 stays the guard
 * for existing artifacts): this module owns WHICH markets each sport may capture and the no-vig
 * math for shapes v1 refuses. The rules the whole lane lives by:
 *
 *   - Model probability and market probability stay distinguishable everywhere — no-vig output
 *     is a MARKET read, never model truth.
 *   - EPL match result is THREE-way; the draw is a real outcome and is never folded into a
 *     binary market. A missing side refuses; it is never synthesized.
 *   - Spreads/totals de-vig two ways only when BOTH sides quote the SAME point — a mismatched
 *     point pair is two different markets, and de-vigging across them fabricates a probability.
 *   - Implied sums are recorded pre-normalization so the vig stays visible (Sprint-046 lesson).
 */
import { noVigTwoWay } from "./snapshot-contract.mjs";

export const MARKET_SCOPE_VERSION = 1;

/** The only market keys each sport's capture may request or normalize. Provider keys (the-odds-api). */
export const MARKET_SCOPE = Object.freeze({
  nfl: Object.freeze(["h2h", "spreads", "totals"]),
  nba: Object.freeze(["h2h", "spreads", "totals"]),
  ufc: Object.freeze(["h2h"]),
  epl: Object.freeze(["h2h", "totals"]), // h2h is THREE-way for soccer (home/draw/away)
});

/** Sports whose h2h market is three-way (draw is a first-class outcome). */
export const THREE_WAY_H2H = Object.freeze(new Set(["epl"]));

const imp = (price) => {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  if (price >= 100) return 100 / (price + 100); // american positive
  if (price <= -100) return -price / (-price + 100); // american negative
  if (price > 1) return 1 / price; // decimal
  return null;
};

/**
 * De-vig a three-way market (soccer 1X2). Requires exactly three distinct outcomes, all priced;
 * refuses degenerate sums. The draw survives normalization by construction.
 */
export function noVigThreeWay(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length !== 3) {
    return { ok: false, reason: `expected exactly three outcomes (home/draw/away), got ${outcomes?.length ?? 0} — a soccer match market without its draw is a different market` };
  }
  const names = outcomes.map((o) => o?.name);
  if (new Set(names).size !== 3) return { ok: false, reason: "duplicate outcome names in a three-way market — corrupt, quarantined" };
  const probs = outcomes.map((o) => imp(o.price));
  if (probs.some((p) => p == null)) return { ok: false, reason: "unparseable price in three-way market — never guessed" };
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum <= 1.0 || sum > 1.3) {
    return { ok: false, reason: `implied sum ${sum.toFixed(4)} outside the three-way sane band (1.0, 1.3] — stale, inverted, or corrupt` };
  }
  return {
    ok: true,
    impliedSum: Number(sum.toFixed(6)),
    noVig: outcomes.map((o, i) => ({ name: o.name, prob: Number((probs[i] / sum).toFixed(6)) })),
  };
}

/**
 * De-vig a pointed two-way market (spreads: team±point · totals: Over/Under point). Both sides
 * must quote the SAME absolute point; spreads must be mirrored (+p / −p), totals identical.
 */
export function noVigPointedTwoWay(outcomes, marketKey) {
  if (!Array.isArray(outcomes) || outcomes.length !== 2) {
    return { ok: false, reason: `expected exactly two pointed outcomes, got ${outcomes?.length ?? 0}` };
  }
  const [a, b] = outcomes;
  if (typeof a?.point !== "number" || typeof b?.point !== "number") {
    return { ok: false, reason: `${marketKey} outcome missing its point — a pointed market without the point is unjoinable to any line` };
  }
  if (marketKey === "spreads" ? a.point !== -b.point : a.point !== b.point) {
    return { ok: false, reason: `${marketKey} points disagree (${a.point} vs ${b.point}) — two different lines, refusing to de-vig across them` };
  }
  const base = noVigTwoWay([{ name: a.name, price: a.price }, { name: b.name, price: b.price }]);
  if (!base.ok) return base;
  return { ...base, point: Math.abs(a.point) };
}

/**
 * Normalize one provider event under the per-sport scope. v1's h2h path is reused verbatim for
 * two-way sports; three-way h2h and pointed markets get their own validators. Out-of-scope
 * markets quarantine with the scope named — recorded, never guessed into rows.
 */
export function normalizeScopedOddsEvent(raw, { sport, capturedAt, requestId }) {
  const scope = MARKET_SCOPE[sport];
  if (!scope) return { rows: [], quarantined: [{ reason: `sport ${sport} has no market scope — refusing`, providerEventId: raw?.id ?? null }] };
  const rows = [];
  const quarantined = [];
  if (!raw?.id || !raw?.commence_time || !raw?.home_team || !raw?.away_team) {
    return { rows, quarantined: [{ reason: "event missing id/commence_time/participants — unjoinable, quarantined whole", providerEventId: raw?.id ?? null }] };
  }
  for (const bk of raw.bookmakers ?? []) {
    for (const mkt of bk.markets ?? []) {
      if (!scope.includes(mkt.key)) {
        quarantined.push({ providerEventId: raw.id, bookmaker: bk.key, reason: `market ${mkt.key} outside ${sport} scope [${scope.join(", ")}] — recorded, never guessed into a row` });
        continue;
      }
      let nv;
      let marketShape;
      if (mkt.key === "h2h" && THREE_WAY_H2H.has(sport)) {
        nv = noVigThreeWay(mkt.outcomes ?? []);
        marketShape = "h2h_3way";
      } else if (mkt.key === "h2h") {
        nv = noVigTwoWay(mkt.outcomes ?? []);
        marketShape = "h2h_2way";
      } else {
        nv = noVigPointedTwoWay(mkt.outcomes ?? [], mkt.key);
        marketShape = mkt.key;
      }
      if (!nv.ok) {
        quarantined.push({ providerEventId: raw.id, bookmaker: bk.key, market: mkt.key, reason: nv.reason });
        continue;
      }
      rows.push({
        providerEventId: String(raw.id),
        sport,
        scheduledStartUtc: raw.commence_time,
        home: raw.home_team,
        away: raw.away_team,
        bookmaker: bk.key,
        marketType: mkt.key,
        marketShape,
        ...(nv.point != null ? { point: nv.point } : {}),
        outcomes: (mkt.outcomes ?? []).map((o) => ({ name: o.name, price: o.price, ...(o.point != null ? { point: o.point } : {}) })),
        impliedSum: nv.impliedSum,
        noVig: nv.noVig,
        capturedAt,
        sourceAsOf: bk.last_update ?? mkt.last_update ?? capturedAt,
        requestId,
      });
    }
  }
  return { rows, quarantined };
}
