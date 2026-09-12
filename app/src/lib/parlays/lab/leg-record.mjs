/**
 * LEG RECORD (P268) — which kinds of leg our published cards have actually used, and how those legs
 * settled against official results.
 *
 * The card-level record already exists per risk tier and per price band. What a person building a
 * card could never see is the level they are actually choosing at: a leg. "Over 0.5 hits" and
 * "Over 1.5 hits" are not the same bet, and until now the site had no published answer to "how have
 * legs like this one gone?" — even though every graded card carries it.
 *
 * ── WHAT THIS RECORD IS, EXACTLY ────────────────────────────────────────────────────────────────
 * It is the settled history of the legs OUR OWN CARDS USED. It is NOT the history of the market:
 * the engine chose these legs, so the record describes its choices, not "Over 0.5 hits" in general.
 * Every surface that renders it has to say so, and the honesty test in this directory enforces it.
 *
 * ── ONE LEG IS ONE OBSERVATION ──────────────────────────────────────────────────────────────────
 * Eighteen cards a day share legs: across 74 graded days there were 4,024 leg slots but only 1,093
 * distinct legs. Counting slots would weight each leg by how many cards happened to use it — the
 * family's rate then reports the optimizer's repetition habits, and it moved by three points when
 * measured that way. So a leg counts ONCE per day, keyed by who and what and at which line, and the
 * number of card uses is reported separately as the fact it is.
 *
 * ── WHAT IS NEVER READ FROM THE GRADED FILE ─────────────────────────────────────────────────────
 * The graded artifacts carry `projection`, `edgePct` and `confidence`. None of them is read here.
 * Every modeled MLB prop market is demoted to market context, so a record built on the engine's own
 * claimed edge would be a claim about a claim. Only three facts go in: the price, the result, and
 * the official settlement that decided it.
 */

/** A decided leg. `void` is a scratch — it is neither a win nor a loss, and it never becomes zero. */
const DECIDED = new Set(["win", "loss"]);

/**
 * TWO PUBLISHED STREAMS, ONE RECORD.
 *
 * We publish cards from two producers, and both grade their legs:
 *   · `parlays/graded/<date>.json` → `slips[]` — the daily suggested-card set.
 *   · `parlays/optimizer-graded/<date>.json` → `publicRiskSections[tier].all[]` — the risk-band
 *     cards, the ones the Parlay Center leads with.
 * Reading only the first would have labelled a record "the legs inside our cards" on a page whose
 * whole point is that its cards are a DIFFERENT population — and it would have missed the family the
 * band cards use most. Both are flattened to one shape here and deduped by leg, so a leg that
 * appeared in both streams on the same day is still one observation.
 */
export function flattenGradedDoc(doc) {
  const date = String(doc?.date ?? "");
  const groups = [];
  for (const slip of doc?.slips ?? []) if (slip?.legs?.length) groups.push({ legs: slip.legs });
  const sections = doc?.publicRiskSections ?? {};
  for (const tier of Object.keys(sections)) {
    for (const slip of sections[tier]?.all ?? []) if (slip?.legs?.length) groups.push({ legs: slip.legs });
  }
  return { date, slips: groups };
}

const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedFromAmerican = (a) => (a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100));

/** Who, what, and at which line — on one day. Two cards using this leg are one observation. */
export const legIdentity = (date, leg) =>
  [date, leg.playerId ?? leg.playerName ?? "?", leg.market ?? "?", leg.side ?? "?", leg.line ?? "?"].join("|");

/** The family a leg belongs to. The line is part of it: Over 0.5 and Over 1.5 are different bets. */
export const familyKey = (leg) => [leg.market ?? "?", leg.side ?? "?", leg.line ?? "?"].join("|");

export const familyLabel = ({ marketLabel, market, side, line }) =>
  `${side ?? ""} ${line ?? ""} ${marketLabel || market || ""}`.replace(/\s+/g, " ").trim();

/**
 * How much weight this row can carry. Thresholds are on DISTINCT legs, and the caption travels with
 * the row so no surface can render a rate without it.
 */
export function sampleClass(decided) {
  if (decided < 100) return { id: "thin", text: "far too few to separate from chance" };
  if (decided < 250) return { id: "accumulating", text: "accumulating — read it as a direction, not a verdict" };
  return { id: "substantial", text: "a substantial sample" };
}

/**
 * @param {Array<{date?: string, slips?: Array<{legs?: Array<Record<string, any>>}>}>} docs graded card files
 * @param {{sport?: string, minDecided?: number}} [opts]
 */
export function buildLegRecord(docs, { sport = "mlb", minDecided = 30 } = {}) {
  /** date → identity, so the same leg on two different days is two observations. */
  const seen = new Set();
  const families = new Map();
  let slots = 0, distinct = 0, voided = 0, unresolved = 0;
  const days = new Set();

  for (const raw of docs ?? []) {
    const doc = flattenGradedDoc(raw);
    const date = doc.date;
    for (const slip of doc.slips) {
      for (const leg of slip?.legs ?? []) {
        if (sport && leg?.sport && leg.sport !== sport) continue;
        /* `void` is a scratch and `invalid` is a leg the settler could not resolve. Neither is a
           result, and neither may become a zero in a rate. */
        if (leg?.result === "void" || leg?.result === "invalid") { voided += 1; continue; }
        if (!DECIDED.has(leg?.result)) { unresolved += 1; continue; }
        slots += 1;
        const key = familyKey(leg);
        let f = families.get(key);
        if (!f) {
          f = {
            market: leg.market ?? null, marketLabel: leg.marketLabel ?? null, side: leg.side ?? null,
            line: leg.line ?? null, wins: 0, losses: 0, cardUses: 0, impliedSum: 0, returnSum: 0,
          };
          families.set(key, f);
        }
        f.cardUses += 1;
        const id = legIdentity(date, leg);
        if (seen.has(id)) continue;
        seen.add(id);
        distinct += 1;
        days.add(date);
        const won = leg.result === "win";
        if (won) f.wins += 1; else f.losses += 1;
        const price = Number(leg.oddsForSide);
        if (Number.isFinite(price) && price !== 0) {
          f.impliedSum += impliedFromAmerican(price);
          f.returnSum += won ? decimalFromAmerican(price) - 1 : -1;
        }
      }
    }
  }

  const rows = [...families.values()]
    .map((f) => {
      const decided = f.wins + f.losses;
      const hitRate = decided ? f.wins / decided : null;
      return {
        market: f.market, marketLabel: f.marketLabel, side: f.side, line: f.line,
        label: familyLabel(f),
        decided, wins: f.wins, losses: f.losses, cardUses: f.cardUses,
        hitRate,
        /** What the prices on those legs implied, averaged. It includes the sportsbook's margin. */
        impliedMean: decided ? f.impliedSum / decided : null,
        /** Flat stake, one unit per distinct leg: the completed past, never a projection. */
        flatReturn: decided ? f.returnSum / decided : null,
        /** ±1 standard error on the rate, so a thin row cannot read as a precise number. */
        standardError: decided && hitRate != null ? Math.sqrt((hitRate * (1 - hitRate)) / decided) : null,
        sample: sampleClass(decided),
      };
    })
    .filter((r) => r.decided >= minDecided)
    .sort((a, b) => b.decided - a.decided);

  const dates = [...days].sort();
  return {
    sport,
    since: dates[0] ?? null,
    until: dates[dates.length - 1] ?? null,
    days: dates.length,
    /** Distinct legs measured, and the number of card slots they filled. Both are facts; only the first is the sample. */
    distinct, slots, voided, unresolved,
    families: rows,
  };
}

/** "over 1.5" / "Over" / "o" all mean one thing; anything else means we do not know the side. */
export function normaliseSide(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (/^o(ver)?\b/.test(s) || s === "o") return "Over";
  if (/^u(nder)?\b/.test(s) || s === "u") return "Under";
  return null;
}

const normaliseLabel = (raw) => String(raw ?? "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

/**
 * The row for a leg a person is looking at, or null when that family has too little history.
 *
 * Two joins, in order of trust. Our own board carries the market KEY (`batter_hits`), so that match
 * is exact. A slip read off a screenshot carries only what the sportsbook printed ("Hits"), so the
 * fallback compares the family's own LABEL — whole-string after normalising, never a substring, and
 * the side and the line must still agree exactly. A join on the label alone would happily report the
 * record of Over 0.5 for a bet on Over 2.5, which is a different bet with a different history.
 */
export function recordForLeg(record, leg) {
  if (!record?.families?.length || !leg) return null;
  const market = leg.market ?? leg.marketKey ?? null;
  const side = normaliseSide(leg.side ?? (typeof leg.selection === "string" ? leg.selection : null));
  const line = leg.line ?? leg.point ?? null;
  if (side == null || line == null || !Number.isFinite(Number(line))) return null;
  const sameShape = (f) => normaliseSide(f.side) === side && Number(f.line) === Number(line);
  if (market) {
    const exact = record.families.find((f) => f.market === market && sameShape(f));
    if (exact) return exact;
  }
  /* A slip read may put the printed name in EITHER field, so both are tried as a label. A market key
     that failed the exact match above normalises to "batter hits" and will not equal "hits", so this
     cannot quietly turn a wrong key into a right-looking row. */
  const label = normaliseLabel(leg.marketLabel ?? leg.market);
  if (!label) return null;
  return record.families.find((f) => normaliseLabel(f.marketLabel) === label && sameShape(f)) ?? null;
}
