/**
 * LEDGER HEALTH — five records, kept separate, each made to add up.
 *
 * WHY
 * ---
 * The five ledgers this project keeps already exist as separate artifacts and had no shared
 * reconciler, so nothing could answer the two questions that matter about them at once:
 *
 *   1. DO THEY ADD UP? Each has its own internal identity — settled = win + loss + push, staked =
 *      settled cards at one unit each — and none of them was asserted anywhere. An identity that is
 *      true today and unchecked is a number waiting to drift.
 *
 *   2. ARE THEY STILL SEPARATE? This is the load-bearing one. The all-model-picks record is the
 *      whole published board, warts included; the suggested-card and signature-product records are
 *      curated selections from it. Blending them would flatter every one of them — a curated card
 *      record grafted onto the full board reads as the model doing better than it did, and the
 *      reverse reads as the products doing worse. The separation is the honesty, so it is asserted
 *      rather than assumed: the picks record carries no money fields at all, and no product's cards
 *      appear in another product's ledger.
 *
 * Pure. Every artifact is passed in, so the guards can drive corrupt shapes the real tree cannot
 * produce, and the reconciler never reaches for a file.
 */

/** The five records, in the order a reader meets them. */
export const LEDGERS = ["allPicks", "suggestedCards", "mixedCards", "bankBuilder", "moonshot"];

/** Money fields have no business in the all-picks record; finding one is a blend, not a feature. */
const MONEY_FIELDS = ["stake", "staked", "returned", "payout", "roi", "bankroll", "profit"];

const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * The all-model-picks record: every published read, graded, with no money attached.
 *
 * @param {object} bySport `{ mlb: gradedPicksArtifact, … }`
 */
export function reconcileAllPicks(bySport) {
  const contradictions = [];
  let graded = 0, hit = 0, miss = 0, pending = 0;
  const sports = {};

  for (const [sport, artifact] of Object.entries(bySport ?? {})) {
    if (!artifact || !Array.isArray(artifact.picks)) {
      contradictions.push(`allPicks/${sport}: no picks array — a missing ledger is not an empty one`);
      sports[sport] = { picks: null };
      continue;
    }
    const picks = artifact.picks;
    // `hit: null` is a real state — published, not yet gradeable. It is counted as pending, never
    // as a miss: a pick awaiting its result has not lost.
    const h = picks.filter((p) => p.hit === true).length;
    const m = picks.filter((p) => p.hit === false).length;
    const p = picks.length - h - m;
    graded += h + m; hit += h; miss += m; pending += p;
    sports[sport] = { picks: picks.length, hit: h, miss: m, pending: p };

    if (artifact.moneyClass && artifact.moneyClass !== "NON_MONEY") {
      contradictions.push(`allPicks/${sport}: moneyClass is ${artifact.moneyClass} — the board record carries no money`);
    }
    const leaked = MONEY_FIELDS.filter((f) => picks.some((row) => row && row[f] !== undefined));
    if (leaked.length) {
      contradictions.push(`allPicks/${sport}: rows carry money field(s) ${leaked.join(", ")} — product returns must not enter the board record`);
    }
  }

  return { kind: "allPicks", total: graded + pending, graded, hit, miss, pending, sports, contradictions };
}

/**
 * Suggested cards and mixed-sport cards, from the one artifact that holds both.
 *
 * `mixedCards` is the `multi` stream; it is reported as its own ledger because a cross-sport card
 * is a different product with a different compatibility rule, and folding it into per-sport totals
 * would let one stream's record hide inside another's.
 */
export function reconcileCards(labLedger) {
  const contradictions = [];
  const streams = Array.isArray(labLedger?.streams) ? labLedger.streams : null;
  if (!streams) {
    return { kind: "cards", suggested: null, mixed: null, contradictions: ["cards: no streams array"] };
  }

  const one = (st) => {
    const r = st.record ?? {};
    const wins = num(r.wins), losses = num(r.losses), pushes = num(r.pushes);
    const settled = wins + losses + pushes;
    // Each settled card stakes exactly one unit, so staked IS the settled count. Where it is not,
    // one of the two has been computed from a different population than the other.
    if (r.staked !== undefined && num(r.staked) !== settled) {
      contradictions.push(`cards/${st.id}: staked ${r.staked} but ${settled} settled card(s) — the two count different populations`);
    }
    if (settled > 0 && num(st.settledDays) === 0) {
      contradictions.push(`cards/${st.id}: ${settled} settled card(s) across zero settled days`);
    }
    // Tier records must partition the stream record, not overlap it or exceed it.
    const tiers = st.byTier && typeof st.byTier === "object" ? Object.values(st.byTier) : [];
    if (tiers.length) {
      const tw = tiers.reduce((a, t) => a + num(t.wins), 0);
      const tl = tiers.reduce((a, t) => a + num(t.losses), 0);
      const tp = tiers.reduce((a, t) => a + num(t.pushes), 0);
      if (tw + tl + tp !== settled) {
        contradictions.push(`cards/${st.id}: tiers sum to ${tw + tl + tp} settled but the stream says ${settled}`);
      }
    }
    return { id: st.id, live: st.live === true, settledDays: num(st.settledDays), wins, losses, pushes, settled, blocked: st.blocked ?? null };
  };

  const rows = streams.map(one);
  return {
    kind: "cards",
    suggested: rows.filter((r) => r.id !== "multi"),
    mixed: rows.find((r) => r.id === "multi") ?? null,
    contradictions,
  };
}

/** Bank Builder: one entry per settled slip, each carrying its own lane identity. */
export function reconcileBankBuilder(ledger) {
  const contradictions = [];
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : null;
  if (!entries) return { kind: "bankBuilder", settled: null, contradictions: ["bankBuilder: no entries array"] };

  const by = { win: 0, loss: 0, push: 0, void: 0, pending: 0, other: 0 };
  const ids = new Set();
  for (const e of entries) {
    const r = String(e?.result ?? "").toLowerCase();
    if (r in by) by[r] += 1; else by.other += 1;
    const id = e?.slipId;
    if (!id) contradictions.push(`bankBuilder: an entry on ${e?.date ?? "an unknown date"} has no slipId — an unidentifiable receipt cannot be reconciled`);
    else if (ids.has(id)) contradictions.push(`bankBuilder: duplicate slipId ${id} — one slip settled twice`);
    else ids.add(id);
  }
  if (by.other) contradictions.push(`bankBuilder: ${by.other} entr(ies) carry a result outside win/loss/push/void/pending`);

  return { kind: "bankBuilder", entries: entries.length, settled: by.win + by.loss + by.push + by.void, ...by, slipIds: [...ids], contradictions };
}

/** Moonshot: one result per card, its own progression, its own bankroll. */
export function reconcileMoonshot(ledger) {
  const contradictions = [];
  const results = Array.isArray(ledger?.results) ? ledger.results : null;
  if (!results) return { kind: "moonshot", settled: null, contradictions: ["moonshot: no results array"] };

  let won = 0, lost = 0, other = 0;
  for (const r of results) {
    const o = String(r?.outcome ?? "").toLowerCase();
    if (o === "won" || o === "win") won += 1;
    else if (o === "lost" || o === "loss") lost += 1;
    else other += 1;
    if (r?.productId && r.productId !== "moonshot") {
      contradictions.push(`moonshot: an entry claims productId ${r.productId} — another product's card in this ledger`);
    }
  }
  if (other) contradictions.push(`moonshot: ${other} result(s) carry an outcome outside won/lost`);

  return { kind: "moonshot", settled: won + lost, won, lost, contradictions };
}

/**
 * The separation proof. Everything above checks one ledger against itself; this checks them against
 * each other, which is the claim a reader actually relies on when they compare two records.
 */
export function proveSeparation({ allPicks, cards, bankBuilder, moonshot }) {
  const contradictions = [];

  // A slip settled by Bank Builder must not also be counted as a suggested card. They are different
  // products with different rules, and one card in both records is that card counted twice.
  const bbIds = new Set(bankBuilder?.slipIds ?? []);
  for (const stream of cards?.suggested ?? []) {
    if (bbIds.has(stream.id)) {
      contradictions.push(`separation: suggested-card stream "${stream.id}" shares an identity with a Bank Builder slip`);
    }
  }

  // The board record is money-free by construction; reconcileAllPicks proves the fields are absent,
  // and this states the consequence so a reader of the summary sees the claim, not just its inputs.
  if ((allPicks?.contradictions ?? []).some((c) => c.includes("money"))) {
    contradictions.push("separation: the all-picks board record has money attached — product returns have leaked into it");
  }

  // Every ledger reports its own settled count. Nothing here may sum them: a combined "settled"
  // figure across five different products with five different stakes is a number with no meaning,
  // and producing one is how blending starts.
  return { contradictions };
}

/** One health object for the admin surface and the guards. */
export function buildLedgerHealth({ gradedBySport, labLedger, bankBuilderLedger, moonshotLedger }) {
  const allPicks = reconcileAllPicks(gradedBySport);
  const cards = reconcileCards(labLedger);
  const bankBuilder = reconcileBankBuilder(bankBuilderLedger);
  const moonshot = reconcileMoonshot(moonshotLedger);
  const separation = proveSeparation({ allPicks, cards, bankBuilder, moonshot });

  const contradictions = [
    ...allPicks.contradictions,
    ...cards.contradictions,
    ...bankBuilder.contradictions,
    ...moonshot.contradictions,
    ...separation.contradictions,
  ];

  return {
    kind: "ledger-health",
    ledgers: { allPicks, cards, bankBuilder, moonshot },
    separation,
    contradictions,
    // WORST-OF, not a proportion. One contradiction in one ledger means the set does not reconcile;
    // "four of five healthy" is the shape of report that lets a real defect sit unread.
    state: contradictions.length ? "CONTRADICTED" : "RECONCILED",
  };
}
