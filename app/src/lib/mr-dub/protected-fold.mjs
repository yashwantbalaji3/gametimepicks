/**
 * THE PROTECTED-ERA FOLD — Rule S, the protected record's own rule (P256 · Task 9).
 *
 * The protected Mr. Dub record (public/data/mr-dub/portfolio.json) stood still from 2026-07-07: its
 * builder ran only from the retired World Cup script, and automation deliberately never committed it.
 * The founder chose on 2026-09-10 to fold everything since into it under Rule S
 * (docs/PROTECTED_LEDGER_RECONCILIATION_PROPOSAL.md):
 *
 *   · a lost step costs the lane its seed — Bank Builder $100, Moonshot $25;
 *   · a won step rolls and never moves the bankroll;
 *   · Moonshot's money is now inside the core bankroll, its record kept on its own line;
 *   · wins the frozen-rung defect never carried are DISCLOSED, not credited;
 *   · (Session 9, founder C1) a COMPLETED run banks its final settled value − the seed, once, from
 *     2026-10-02 — see COMPLETION_POLICY below and docs/MR_DUB_MONEY_LEDGER.md §5.
 *
 * Pure. The base is the July-7 record, frozen here. A day folds only when every lane PLACED that day is
 * decided, and days fold contiguously — an open day halts the fold, so a later day can never be folded
 * past an earlier one that might still change. Rows with no placement status that are still pending are
 * the frozen-portfolio artifacts of 2026-08-18 → 09-05 (cards nobody played) and are skipped.
 */

export const FOLD_RULE = "S";
export const SEED = Object.freeze({ "bank-builder": 100, moonshot: 25 });

/** The July-7 protected record the fold starts from. Never recomputed. */
export const PROTECTED_BASE = Object.freeze({
  asOf: "2026-07-07",
  startingBankroll: 100,
  currentBankroll: 19065.4,
  crownBankroll: 20465.4,
  highWaterMark: 20465.4,
  maxDrawdown: 1400,
  record: Object.freeze({ wins: 19, losses: 14, voids: 0, pending: 0 }),
});

/** sha256 of the immutable history keys as of 2026-07-07 — completed ladders, cards, identity, crown. */
export const HISTORY_KEYS = Object.freeze(["portfolioId", "displayName", "paperOnly", "disclaimer", "startingDate", "startingBankroll", "crownBankroll", "completedLadders", "completedCards"]);
export const HISTORY_HASH = "d12cc425db2ccd9214e06ea1e6887d4520bb21819d4c8c17a6b100be21de0a59";

const PLACED = new Set(["active", "won", "lost", "void", "push"]);
const DECIDED = new Set(["won", "lost", "void", "push"]);
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * THE FINAL RUNG per product (Bank Builder's live ladder is five rungs, Moonshot's three — pinned against
 * BANK_BUILDER_STEP_COUNT / MOONSHOT_STEP_COUNT by money-movements.test.mjs), and each ladder's rung goals
 * (pinned against BANK_BUILDER_LADDER / MOONSHOT_LADDER the same way). A won final rung COMPLETES a run —
 * and so does a won earlier rung whose real payout already clears the final goal, exactly as the lane
 * machine (products/ladder-position.mjs) restarts the lane. One predicate, `completesLadder`, for both.
 */
export const FINAL_STEP = Object.freeze({ "bank-builder": 5, moonshot: 3 });
export const LADDER_GOALS = Object.freeze({
  "bank-builder": Object.freeze([200, 700, 1400, 3500, 10000]),
  moonshot: Object.freeze([100, 400, 1000]),
});

/**
 * COMPLETION BANKING — founder decision C1 (Session 9, 2026-10-02). Rule S said nothing about a completed
 * run: a lost step costs its seed, a won step rolls. C1 closes it symmetrically:
 *
 *     banked = final settled value of the completed card − the lane's original seed
 *
 * The seed was never deducted when the run started, so it is not profit; the payout above it is. Rejected:
 * C2 (bank the full final value — overstates by the seed, the June precedent) and C3 (forfeit the run).
 *
 * PROSPECTIVE ONLY. The policy covers completions settled on or after `effectiveFrom`, the first day the
 * fold had not yet taken in when it was adopted (the record was folded through 2026-10-01). No folded day is
 * restated: there was no completion between 07-08 and 10-01, and a completion dated before `effectiveFrom`
 * would still HALT the fold (operator-gated) rather than be banked retroactively.
 */
export const COMPLETION_POLICY = Object.freeze({
  id: "COMPLETION_BANKING_C1",
  rule: "a completed ladder banks its final settled value minus the lane's original seed, once",
  effectiveFrom: "2026-10-02",
  decidedBy: "founder, Session 9 (2026-10-02) — C1; C2 (bank the full value) and C3 (forfeit the run) rejected",
});

export const HALT = Object.freeze({
  OPEN_DAY: "OPEN_PLACED_LANE",
  COMPLETION: "LADDER_COMPLETION_OPERATOR_GATED", // a completion the policy does not cover (dated before C1)
  COMPLETION_VALUE_MISSING: "LADDER_COMPLETION_VALUE_MISSING", // a won final card with no real settled value: never guessed
  UNKNOWN_PRODUCT: "UNKNOWN_PRODUCT",
});

/** Does this won row complete its lane's ladder? (Same rule as ladder-position.mjs `positionFromReceipts`.) */
export function completesLadder(l) {
  if (String(l?.result) !== "won" || !(l?.product in FINAL_STEP)) return false;
  if (Number(l.step) >= FINAL_STEP[l.product]) return true;
  const payout = Number(l.potentialReturn);
  return Number.isFinite(payout) && payout >= LADDER_GOALS[l.product].at(-1);
}

/** The rung a won, non-completing row carries into: the first later rung its payout has not cleared. */
export function nextStepAfterWin(l) {
  const goals = LADDER_GOALS[l.product] ?? [];
  const payout = Number(l.potentialReturn);
  let n = Number(l.step) + 1;
  while (n <= goals.length && Number.isFinite(payout) && payout >= goals[n - 1]) n += 1;
  return n;
}

/** Why a day cannot fold (null = it can). Shared by the fold and its backlog disclosure. */
export function foldBlocker(placed, { date } = {}) {
  if (placed.some((l) => !(l.product in SEED))) return HALT.UNKNOWN_PRODUCT;
  if (placed.some((l) => !DECIDED.has(l.result))) return HALT.OPEN_DAY;
  const done = placed.filter(completesLadder);
  if (done.length && !(date && date >= COMPLETION_POLICY.effectiveFrom)) return HALT.COMPLETION;
  if (done.some((l) => !(Number(l.potentialReturn) > Number(l.stake)))) return HALT.COMPLETION_VALUE_MISSING;
  return null;
}

/**
 * Each lane's cycle number at every placed row (1-based; a new cycle after a loss or a completion — the
 * lane machine's own rule), keyed `date|product|lane`. Walks every receipt it is given, oldest first.
 */
function laneCycles(receipts) {
  const cycle = {}, at = new Map();
  for (const r of [...(receipts ?? [])].filter((x) => x?.date).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const l of r.lanes ?? []) {
      const res = String(l.result ?? "pending");
      if (!(l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(res))) continue;
      const k = `${l.product}:${l.lane}`;
      cycle[k] ??= 1;
      at.set(`${r.date}|${k}`, cycle[k]);
      if (res === "lost" || completesLadder({ ...l, result: res })) cycle[k] += 1;
    }
  }
  return at;
}

/** The completion receipt for one won-final row: everything needed to re-prove the banked amount. */
export function completionReceipt(r, l, idx, cycle) {
  const finalValue = round2(Number(l.potentialReturn));
  const seed = SEED[l.product];
  return {
    policy: COMPLETION_POLICY.id,
    effectiveFrom: COMPLETION_POLICY.effectiveFrom,
    product: l.product,
    lane: l.lane,
    cycle: cycle ?? null,
    step: Number(l.step),
    seed,
    finalValue,
    banked: round2(finalValue - seed),
    source: `mr-dub/settled/${r.date}.json#lanes[${idx}]`,
    settledAt: r.settledAt ?? null,
  };
}


/** Fold the receipts dated after the base, contiguously, under Rule S + completion banking C1. */
export function foldReceipts(receipts, { after = PROTECTED_BASE.asOf } = {}) {
  const ordered = [...(receipts ?? [])].filter((r) => r?.date && r.date > after).sort((a, b) => a.date.localeCompare(b.date));
  const cycles = laneCycles(receipts);
  const days = [];
  let haltedAt = null, haltReason = null;
  for (const r of ordered) {
    const rows = (r.lanes ?? []).map((l, idx) => ({ ...l, idx, result: String(l.result ?? "pending") }));
    const placed = rows.filter((l) => (l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(l.result)));
    const blocker = foldBlocker(placed, { date: r.date });
    if (blocker) { haltedAt = r.date; haltReason = blocker; break; }
    const tally = (p, res) => placed.filter((l) => l.product === p && l.result === res).length;
    const day = {
      date: r.date,
      bankBuilder: { won: tally("bank-builder", "won"), lost: tally("bank-builder", "lost") },
      moonshot: { won: tally("moonshot", "won"), lost: tally("moonshot", "lost") },
    };
    const completions = placed.filter(completesLadder).map((l) => completionReceipt(r, l, l.idx, cycles.get(`${r.date}|${l.product}:${l.lane}`)));
    const banked = completions.reduce((s, c) => s + c.banked, 0);
    day.delta = round2(banked - (SEED["bank-builder"] * day.bankBuilder.lost + SEED.moonshot * day.moonshot.lost)) || 0; // no -0 in a money record
    // Only a day that completed a run carries the key, so every day folded before C1 stays byte-identical.
    if (completions.length) day.completions = completions;
    days.push(day);
  }
  const sum = (f) => days.reduce((s, d) => s + f(d), 0);
  return {
    rule: FOLD_RULE,
    foldedThrough: days.length ? days[days.length - 1].date : null,
    haltedAt,
    haltReason,
    days,
    bankrollDelta: round2(sum((d) => d.delta)) || 0,
    bankBuilder: { won: sum((d) => d.bankBuilder.won), lost: sum((d) => d.bankBuilder.lost) },
    moonshot: { won: sum((d) => d.moonshot.won), lost: sum((d) => d.moonshot.lost) },
  };
}

/**
 * WHAT THE FOLD HAS NOT TAKEN IN YET (Bank Builder V2 · G-2). Read-only disclosure beside the record — it credits
 * nothing and changes no money. `foldReceipts` halts at the first day with a placed lane still pending, so every
 * decided result after that day waits too; a surface printing the record must be able to say so, instead of
 * "0 pending" beside a record that stopped. Same PLACED / DECIDED rules as the fold, over receipts after `after`
 * (the fold's own `foldedThrough`).
 */
export function foldBacklog(receipts, { after }) {
  const ordered = [...(receipts ?? [])].filter((r) => r?.date && r.date > after).sort((a, b) => a.date.localeCompare(b.date));
  const decided = { "bank-builder": { won: 0, lost: 0 }, moonshot: { won: 0, lost: 0 } };
  let haltedAt = null, haltReason = null;
  const blocking = [];
  for (const r of ordered) {
    const rows = (r.lanes ?? []).map((l) => ({ ...l, result: String(l.result ?? "pending") }));
    const placed = rows.filter((l) => (l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(l.result)));
    const open = placed.filter((l) => !DECIDED.has(l.result));
    const blocker = foldBlocker(placed, { date: r.date });
    if (!haltedAt && blocker && blocker !== HALT.OPEN_DAY) { haltedAt = r.date; haltReason = blocker; }
    if (!haltedAt && open.length) {
      haltedAt = r.date; haltReason = HALT.OPEN_DAY;
      for (const l of open) blocking.push({ product: l.product ?? null, lane: l.lane ?? null,
        legs: (l.legs ?? []).filter((g) => String(g.result ?? "pending") === "pending").map((g) => ({ matchup: g.matchup ?? null, selection: g.selection ?? null })) });
    }
    for (const l of placed) if ((l.result === "won" || l.result === "lost") && decided[l.product]) decided[l.product][l.result] += 1;
  }
  return { after, haltedAt, haltReason, blocking, decided, days: ordered.map((r) => r.date) };
}

/** Wins the frozen-rung defect never carried: disclosed beside the record, never credited. */
export function uncarriedWins(receipts, { after = PROTECTED_BASE.asOf, through = null } = {}) {
  const lanes = {};
  for (const r of [...(receipts ?? [])].filter((x) => x?.date > after && (!through || x.date <= through)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const l of r.lanes ?? []) if (l.result === "won" || l.result === "lost") (lanes[`${l.product}:${l.lane}`] ??= []).push({ date: r.date, ...l });
  }
  const out = [];
  for (const rows of Object.values(lanes)) rows.forEach((r, i) => {
    if (r.result !== "won" || completesLadder(r)) return; // a completed run is banked (C1), and its lane restarts
    const next = rows[i + 1];
    if (next && !(next.step === nextStepAfterWin(r) && Math.abs(next.stake - r.potentialReturn) < 0.02)) {
      out.push({ product: r.product, lane: r.lane, date: r.date, step: r.step, paid: r.potentialReturn, replacedBy: `${next.date} step ${next.step} $${next.stake}` });
    }
  });
  return out;
}

/**
 * The protected record with the fold applied. Only the bankroll and what the builder derives from it
 * move; every history key is untouched (the invariant checks it). Live exposure stays the daily
 * portfolio's job — this record is SETTLED money, as it always was.
 */
export function applyFold(portfolio, fold, { foldedAt, receipts = [] } = {}) {
  const b = PROTECTED_BASE;
  const current = round2(b.currentBankroll + fold.bankrollDelta);
  const record = { wins: b.record.wins + fold.bankBuilder.won, losses: b.record.losses + fold.bankBuilder.lost, voids: b.record.voids, pending: 0 };
  // The high-water mark and the worst drawdown come from the folded PATH (each day's close), not from today
  // alone: under C1 a completion can lift the bankroll above the June crown and a later loss can fall back.
  // The crown itself is the June era's history key and never moves; the HWM is the derived all-time peak.
  let close = b.currentBankroll, hwm = b.highWaterMark, worst = b.maxDrawdown;
  for (const d of fold.days) { close = round2(close + d.delta); hwm = Math.max(hwm, close); worst = Math.max(worst, round2(hwm - close)); }
  const drawdown = round2(hwm - current);
  const settledProfit = round2(current - b.startingBankroll);
  const legacyMoonshot = portfolio.moonshot?.legacy ?? portfolio.moonshot ?? null;
  return {
    ...portfolio,
    currentBankroll: current,
    settledProfit,
    roi: round2(settledProfit / b.startingBankroll),
    roiMultiple: round2(settledProfit / b.startingBankroll),
    record,
    highWaterMark: round2(hwm),
    drawdown,
    drawdownPct: hwm > 0 ? round4(drawdown / hwm) : 0,
    intelligence: {
      ...(portfolio.intelligence ?? {}),
      highWaterMark: round2(hwm),
      drawdown,
      drawdownPct: hwm > 0 ? round4(drawdown / hwm) : 0,
      maxDrawdown: round2(Math.max(worst, drawdown)),
      winRate: round2(record.wins / Math.max(1, record.wins + record.losses)),
    },
    moonshot: {
      lane: "Moonshot",
      paperOnly: true,
      separateFromCore: false,
      inBankrollSince: fold.days[0]?.date ?? null,
      record: { wins: fold.moonshot.won, losses: fold.moonshot.lost, voids: 0, pending: 0 },
      exposure: 0,
      note: "Since the 2026-09-10 reconciliation Moonshot's settled results move the core bankroll (a lost lane costs its $25 seed). Its record is kept on its own line; the earlier single-card lane is kept below as history.",
      legacy: legacyMoonshot,
    },
    protectedFold: {
      rule: FOLD_RULE,
      decidedBy: "founder, 2026-09-10 — Rule S (docs/PROTECTED_LEDGER_RECONCILIATION_PROPOSAL.md)",
      completionPolicy: COMPLETION_POLICY,
      base: { asOf: b.asOf, currentBankroll: b.currentBankroll, record: b.record },
      foldedAt: foldedAt ?? null,
      foldedThrough: fold.foldedThrough,
      bankrollDelta: fold.bankrollDelta,
      days: fold.days,
      uncarriedWins: uncarriedWins(receipts, { through: fold.foldedThrough }),
    },
  };
}

/**
 * The fold's rows in the two derived money files — one ledger event and one day-summary row per folded
 * day that settled a placed card — so the health gate's reconciliations (Σ ledger paperProfit ==
 * settledProfit; each day opens on the prior close; the last close == the bankroll) hold after a fold.
 *
 * NEVER RESTATES A FOLDED DAY: an existing row for a date is kept verbatim (its timestamp included); a
 * fresh derivation that disagrees with it throws rather than rewriting history.
 *
 * @param {object} fold        foldReceipts() output
 * @param {object} o
 * @param {string} o.foldedAt  timestamp for NEW rows only
 * @param {Array}  o.ledgerEvents  current ledger.json events
 * @param {Array}  o.summaryDays   current daily-summary.json days
 * @returns {{events: Array, days: Array, added: number}}
 */
export function foldLedgerRows(fold, { foldedAt, ledgerEvents = [], summaryDays = [] } = {}) {
  const b = PROTECTED_BASE;
  const keepEvents = ledgerEvents.filter((e) => e?.category !== "protected_fold");
  const keepDays = summaryDays.filter((d) => !d?.protectedFold);
  const priorEvent = new Map(ledgerEvents.filter((e) => e?.category === "protected_fold").map((e) => [e.date, e]));
  const priorDay = new Map(summaryDays.filter((d) => d?.protectedFold).map((d) => [d.date, d]));
  const lastBase = [...keepDays].sort((x, y) => x.date.localeCompare(y.date)).at(-1);
  if (lastBase && Math.abs(Number(lastBase.closing) - b.currentBankroll) > 0.005)
    throw new Error(`foldLedgerRows: the pre-fold summary closes at ${lastBase.closing}, not the July base ${b.currentBankroll}`);

  let close = b.currentBankroll, added = 0;
  const events = [], days = [];
  for (const d of fold.days) {
    const settledSeeds = SEED["bank-builder"] * (d.bankBuilder.won + d.bankBuilder.lost) + SEED.moonshot * (d.moonshot.won + d.moonshot.lost);
    if (settledSeeds === 0) continue; // nothing placed settled that day — no money row
    const opening = close;
    close = round2(opening + d.delta);
    const fresh = {
      eventId: `mrdub-rule-s-${d.date}`, timestamp: foldedAt, portfolio: "mr-dub-paper",
      category: "protected_fold", type: "folded_day", date: d.date,
      paperStake: settledSeeds, paperReturn: round2(settledSeeds + d.delta), paperProfit: d.delta,
      rolled: d.bankBuilder.won + d.moonshot.won > 0, status: "settled", result: d.delta < 0 ? "lost" : "won",
      officialResultConfirmed: true, publicBankBuilderVisible: false,
      bankBuilder: d.bankBuilder, moonshot: d.moonshot, legs: [],
      notes: `Rule S: ${d.bankBuilder.lost} Bank Builder step(s) lost ($100 seed each), ${d.moonshot.lost} Moonshot lane(s) lost ($25 each); ${d.bankBuilder.won + d.moonshot.won - (d.completions?.length ?? 0)} win(s) rolled without touching the bankroll`
        + (d.completions?.length ? `; ${d.completions.map((c) => `${c.product} ${c.lane} completed its ladder at $${c.finalValue} → banked $${c.banked} (${c.policy}: final value − $${c.seed} seed)`).join("; ")}` : ""),
      ...(d.completions?.length ? { completions: d.completions } : {}),
    };
    const was = priorEvent.get(d.date);
    if (was && (was.paperProfit !== fresh.paperProfit || JSON.stringify(was.bankBuilder) !== JSON.stringify(fresh.bankBuilder) || JSON.stringify(was.moonshot) !== JSON.stringify(fresh.moonshot)
      || JSON.stringify(was.completions ?? null) !== JSON.stringify(fresh.completions ?? null)))
      throw new Error(`foldLedgerRows: refusing to restate folded day ${d.date} (${was.paperProfit} → ${fresh.paperProfit})`);
    const ev = was ?? fresh;
    const row = priorDay.get(d.date) ?? {
      date: d.date, staked: settledSeeds, returned: fresh.paperReturn, pl: d.delta,
      wins: d.bankBuilder.won, losses: d.bankBuilder.lost, voids: 0, pending: 0,
      moonshot: d.moonshot, events: [ev], opening, closing: close, protectedFold: true,
    };
    if (Math.abs(row.opening - opening) > 0.005 || Math.abs(row.closing - close) > 0.005)
      throw new Error(`foldLedgerRows: refusing to restate folded day ${d.date} (summary chain moved)`);
    if (!was) added += 1;
    events.push(ev); days.push(row);
  }
  return { events: [...keepEvents, ...events], days: [...keepDays, ...days], added };
}
