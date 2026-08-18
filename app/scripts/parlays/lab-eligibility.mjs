/**
 * WHICH SPORTS THE PARLAY LAB MAY PUBLISH — decided from evidence, every run.
 *
 * ── Why a gate rather than four copies of MLB ───────────────────────────────────────────────────
 * "Replicate MLB for the other sports" is the right instinct and the wrong implementation. MLB's
 * Lab does not rest on a validated model — that model was demoted to market-context after failing
 * its bar three times, and this stream's own backtest showed model edge does not predict leg
 * outcomes at all (58.1% / 59.2% / 57.9% across the edge buckets). What MLB's Lab actually rests on
 * is narrower and portable: REAL POSTED PRICES it can quote, and an OFFICIAL SOURCE it can grade
 * against. Any sport with both can carry a Lab stream on the same honest footing; any sport without
 * them cannot, however good its model looks.
 *
 * So eligibility is computed from the artifacts on disk rather than declared in a list a human
 * maintains. A sport goes live when the evidence is there and closes itself when it is not — which
 * also means a stale feed silently downgrades the sport instead of quietly publishing yesterday's
 * prices under today's heading.
 *
 * ── The three requirements ──────────────────────────────────────────────────────────────────────
 *   PRICES     a current, dated capture of real posted odds
 *   SETTLEMENT a proven official grading path, with rows to show for it
 *   DEPTH      enough independently-priced legs to build a card without reusing a game
 *
 * Note what is NOT required: a model that beats the market. None of ours does, and requiring one
 * would close every stream including MLB's. The Lab quotes prices and grades them; that is the
 * whole claim, and it is the same claim in every sport.
 */
import fs from "node:fs";
import path from "node:path";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** How stale a price capture may be before the sport stops being publishable. */
const PRICE_MAX_AGE_DAYS = 3;
/**
 * Fewest DISTINCT PRICED GAMES a sport needs. Games, not selections — and the distinction is the
 * whole point.
 *
 * The first version of this counted priced selections and set the bar at six, which passed NFL on
 * 2 events × 5 consensus markets. But the ladder builds up to four cards whose legs never reuse a
 * game, so two games cannot fill it: the stream would publish one thin card and three "no card
 * today" boxes, which is worse than staying closed. Four games is the floor for two real cards.
 */
const MIN_GAMES = 4;

/**
 * Each sport declares only WHERE its evidence lives. Whether it is live is measured, never set.
 * Adding a sport is one entry — that is the replication the founder asked for, done once.
 */
const SOURCES = {
  mlb: {
    label: "MLB",
    prices: (root, date) => {
      const d = readJson(path.join(root, "mlb", "player-props", `${date}.json`));
      return { at: d?.generatedAt ?? null, games: new Set((d?.props ?? []).map((p) => p.gameId)).size };
    },
    settlement: (root) => {
      const dir = path.join(root, "mlb", "results");
      try { return { proven: fs.readdirSync(dir).length > 0, source: "MLB Stats API official box score" }; }
      catch { return { proven: false, source: null }; }
    },
  },
  nfl: {
    label: "NFL",
    prices: (root) => {
      const d = readJson(path.join(root, "nfl", "markets", "latest.json"));
      // One row per event, each carrying a consensus across several markets.
      const rows = d?.rows ?? [];
      return { at: d?.capturedAt ?? d?.generatedAt ?? null, games: new Set(rows.map((r) => r.canonicalEventId)).size };
    },
    settlement: (root) => {
      const d = readJson(path.join(root, "nfl", "results", "latest.json"));
      return { proven: (d?.rows ?? []).length > 0, source: "official NFL final scores" };
    },
  },
  ufc: {
    label: "UFC",
    prices: (root) => {
      const d = readJson(path.join(root, "ufc", "odds-latest.json"));
      // A bout is a fight card's "game" — two legs from one bout are the same event twice.
      return { at: d?.generatedAt ?? null, games: new Set((d?.bouts ?? []).map((b) => b.eventId)).size };
    },
    settlement: (root) => {
      const d = readJson(path.join(root, "ufc", "graded-moneylines-latest.json"));
      return { proven: (d?.graded ?? []).length > 0, source: "official UFC bout results" };
    },
  },
  epl: {
    label: "Premier League",
    prices: () => ({ at: null, games: 0 }),     // no odds feed is ingested for EPL at all
    settlement: () => ({ proven: false, source: null }),
  },
};

/**
 * @returns per-sport eligibility, plus the multi-sport stream which opens only when two or more
 *          single-sport streams are live — a "multi-sport" card drawn from one sport is just a card.
 */
export function labEligibility(root, date, now) {
  const out = [];
  for (const [id, src] of Object.entries(SOURCES)) {
    const prices = src.prices(root, date);
    const settle = src.settlement(root, date);
    const ageDays = prices.at ? daysBetween(prices.at, now) : null;

    const reasons = [];
    if (!prices.at) reasons.push("no odds capture is ingested for this sport");
    else if (ageDays > PRICE_MAX_AGE_DAYS) reasons.push(`the last price capture is ${ageDays.toFixed(1)} days old`);
    if (!settle.proven) reasons.push("no official settlement path has produced a graded result yet");
    if (prices.games < MIN_GAMES) reasons.push(`only ${prices.games} priced game${prices.games === 1 ? "" : "s"} — a four-tier ladder needs at least ${MIN_GAMES} to build cards that never reuse one`);

    out.push({
      id, label: src.label,
      live: reasons.length === 0,
      blocked: reasons.length ? reasons.join("; ") : undefined,
      evidence: {
        pricedGames: prices.games,
        pricesCapturedAt: prices.at,
        priceAgeDays: ageDays == null ? null : Number(ageDays.toFixed(2)),
        settlementSource: settle.source,
        settlementProven: settle.proven,
      },
    });
  }

  /*
   * IDS, not labels.
   *
   * `liveSports` is consumed as a KEY — the cross-sport builder looks each entry up in its ladder
   * table — so returning display labels ("MLB", "UFC") meant every lookup missed and the lane
   * reported "legs from 0 sports" with two fully-built ladders sitting on disk. The same shape as
   * the registry keying soccer as "soccer" against a gate keying it "epl": a mismatch between two
   * spellings of the same thing, silent because the miss looks like absence.
   *
   * Labels are kept separately for the sentence below, which is the only place a human reads them.
   */
  const live = out.filter((s) => s.live);
  const liveSports = live.map((s) => s.id);
  const liveLabels = live.map((s) => s.label);
  out.push({
    id: "multi", label: "Multi-sport",
    live: liveSports.length >= 2,
    blocked: liveSports.length >= 2 ? undefined
      : `a cross-sport card needs two live sports; ${liveLabels.length === 1 ? `only ${liveLabels[0]} is` : "none is"} cleared`,
    evidence: { liveSports, liveLabels },
  });
  return out;
}
