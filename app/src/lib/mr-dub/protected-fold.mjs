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
 *   · wins the frozen-rung defect never carried are DISCLOSED, not credited.
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

/** Fold the receipts dated after the base, contiguously, under Rule S. */
export function foldReceipts(receipts, { after = PROTECTED_BASE.asOf } = {}) {
  const ordered = [...(receipts ?? [])].filter((r) => r?.date && r.date > after).sort((a, b) => a.date.localeCompare(b.date));
  const days = [];
  let haltedAt = null;
  for (const r of ordered) {
    const rows = (r.lanes ?? []).map((l) => ({ ...l, result: String(l.result ?? "pending") }));
    const placed = rows.filter((l) => (l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(l.result)));
    if (placed.some((l) => !DECIDED.has(l.result))) { haltedAt = r.date; break; }
    const tally = (p, res) => placed.filter((l) => l.product === p && l.result === res).length;
    const day = {
      date: r.date,
      bankBuilder: { won: tally("bank-builder", "won"), lost: tally("bank-builder", "lost") },
      moonshot: { won: tally("moonshot", "won"), lost: tally("moonshot", "lost") },
    };
    day.delta = round2(-(SEED["bank-builder"] * day.bankBuilder.lost + SEED.moonshot * day.moonshot.lost)) || 0; // no -0 in a money record
    days.push(day);
  }
  const sum = (f) => days.reduce((s, d) => s + f(d), 0);
  return {
    rule: FOLD_RULE,
    foldedThrough: days.length ? days[days.length - 1].date : null,
    haltedAt,
    days,
    bankrollDelta: round2(sum((d) => d.delta)) || 0,
    bankBuilder: { won: sum((d) => d.bankBuilder.won), lost: sum((d) => d.bankBuilder.lost) },
    moonshot: { won: sum((d) => d.moonshot.won), lost: sum((d) => d.moonshot.lost) },
  };
}

/** Wins the frozen-rung defect never carried: disclosed beside the record, never credited. */
export function uncarriedWins(receipts, { after = PROTECTED_BASE.asOf, through = null } = {}) {
  const lanes = {};
  for (const r of [...(receipts ?? [])].filter((x) => x?.date > after && (!through || x.date <= through)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const l of r.lanes ?? []) if (l.result === "won" || l.result === "lost") (lanes[`${l.product}:${l.lane}`] ??= []).push({ date: r.date, ...l });
  }
  const out = [];
  for (const rows of Object.values(lanes)) rows.forEach((r, i) => {
    if (r.result !== "won") return;
    const next = rows[i + 1];
    if (next && !(next.step === r.step + 1 && Math.abs(next.stake - r.potentialReturn) < 0.02)) {
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
  const hwm = Math.max(b.highWaterMark, current);
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
      maxDrawdown: round2(Math.max(b.maxDrawdown, drawdown)),
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
      notes: `Rule S: ${d.bankBuilder.lost} Bank Builder step(s) lost ($100 seed each), ${d.moonshot.lost} Moonshot lane(s) lost ($25 each); ${d.bankBuilder.won + d.moonshot.won} win(s) rolled without touching the bankroll`,
    };
    const was = priorEvent.get(d.date);
    if (was && (was.paperProfit !== fresh.paperProfit || JSON.stringify(was.bankBuilder) !== JSON.stringify(fresh.bankBuilder) || JSON.stringify(was.moonshot) !== JSON.stringify(fresh.moonshot)))
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
