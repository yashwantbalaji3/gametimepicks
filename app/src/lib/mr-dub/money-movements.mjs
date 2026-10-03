/**
 * MONEY MOVEMENTS — every official Mr. Dub bankroll mutation, attributed to the card that caused it (Session 8 · A).
 *
 * A PROJECTION, never a second ledger. It is a pure function of the write-once owners that already exist:
 *
 *   · public/data/mr-dub/ledger.json         — the protected July-7 history (hash-locked by HISTORY_HASH)
 *   · public/data/mr-dub/settled/<date>.json — the official, write-once lane receipts the Rule S fold reads
 *   · public/data/mr-dub/portfolio.json      — the protected record (bankroll, crown, fold)
 *   · public/data/mr-dub/daily-summary.json  — the day chain (opening / closing)
 *
 * Persisting the movements would create a copy that could drift from those owners, so nothing here writes.
 * Append-only is inherited: the receipts are write-once and a restated folded day already fails the
 * protected invariant (protected-invariant.mjs); `reconcileMoney` re-proves the rest every time it runs.
 *
 * THE OFFICIAL ACCOUNTING IS NOT CHANGED HERE. Two eras, each under its own written rule:
 *
 *   PROTECTED_BASE (2026-06-09 → 07-07) — the ledger rows as booked: completed ladders banked their final
 *       value (that is how the $20,465.40 crown was reached on 06-24), lost July steps cost their $100 seed.
 *   RULE_S (2026-07-08 →) — founder, 2026-09-10: a lost step costs its seed (Bank Builder $100, Moonshot
 *       $25); a won step rolls and never moves the bankroll; void/push return the seed. A COMPLETED run banks
 *       its final settled value minus the seed, once (COMPLETION_BANKING_C1, founder, Session 9 — from
 *       2026-10-02; an earlier completion still halts the fold, nothing is restated).
 *
 * Each Rule S movement carries BOTH views, never conflated:
 *   stake / return / economicPnl — what the lane's ticket did (stake = the rolled lane balance at risk)
 *   bankrollDelta                — what the protected bankroll did under Rule S
 * e.g. Bank Builder A step 4, 2026-09-30: stake $1,435.47 lost → economicPnl −$1,435.47, bankrollDelta −$100.
 */
import { COMPLETION_POLICY, PROTECTED_BASE, SEED, completesLadder, foldReceipts, nextStepAfterWin } from "./protected-fold.mjs";

export const MONEY_MOVEMENTS_VERSION = "money-movements@2"; // @2: completion banking C1
export const ERA = Object.freeze({ BASE: "PROTECTED_BASE", RULE_S: "RULE_S" });

const PLACED = new Set(["active", "won", "lost", "void", "push"]);
const DECIDED = new Set(["won", "lost", "void", "push"]);
const RESULT = Object.freeze({ won: "WIN", win: "WIN", lost: "LOSS", loss: "LOSS", push: "PUSH", void: "VOID" });
const round2 = (n) => Math.round(n * 100) / 100;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const isPlaced = (l) => (l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(String(l.result ?? "pending")));
const laneOf = (e) => (e.laneId ? String(e.laneId).replace(/^lane-/, "").toUpperCase() : null);

/** The July-7 history, as booked. Ledger order is not date order, so sort stably by date. */
function baseMovements(ledgerEvents) {
  return (ledgerEvents ?? [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e?.category !== "protected_fold" && e?.date && e.date <= PROTECTED_BASE.asOf)
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i)
    .map(({ e }) => ({
      movementId: e.eventId,
      era: ERA.BASE,
      date: e.date,
      product: "bank-builder",
      lane: e.laneId === "crown-ladder" ? "crown" : laneOf(e),
      step: e.step ?? null,
      kind: e.type,
      stake: round2(Number(e.paperStake) || 0),
      return: round2(Number(e.paperReturn) || 0),
      settledDecimal: Number(e.paperStake) > 0 && Number(e.paperReturn) > 0 ? round2(e.paperReturn / e.paperStake) : null,
      result: RESULT[String(e.result ?? "").toLowerCase()] ?? (Number(e.paperProfit) < 0 ? "LOSS" : "WIN"),
      bankrollDelta: round2(Number(e.paperProfit) || 0),
      economicPnl: null, // the July rows were booked as bankroll moves; their per-ticket P/L is the ledger's own
      settledAt: e.timestamp ?? null,
      legs: (e.legs ?? []).map((g) => ({ selection: g.selection ?? null, result: g.result ?? null })),
      source: { productReceipt: `mr-dub/ledger.json#${e.eventId}`, settlement: e.settlementSource ?? null },
    }));
}

/**
 * Every placed, decided lane row of every folded day. Throws on anything the fold itself would never
 * accept (an unknown product, a completed run, a pending row inside a folded day).
 */
function ruleSMovements(receipts, foldedThrough) {
  const out = [];
  if (!foldedThrough) return out;
  const ordered = [...(receipts ?? [])].filter((r) => r?.date > PROTECTED_BASE.asOf && r.date <= foldedThrough).sort((a, b) => a.date.localeCompare(b.date));
  // The fold's own completion receipts (cycle included) — one source for what a completion banked.
  const folded = new Map();
  for (const d of foldReceipts(receipts ?? [], {}).days) for (const c of d.completions ?? []) folded.set(c.source, c);
  for (const r of ordered) {
    (r.lanes ?? []).forEach((l, idx) => {
      if (!isPlaced(l)) return; // a candidate / awaiting row is not a placed card: no money, no exposure
      const res = String(l.result ?? "pending");
      if (!(l.product in SEED)) throw new Error(`money: ${r.date} lanes[${idx}] has product "${l.product}" — only official products move money`);
      if (!DECIDED.has(res)) throw new Error(`money: ${r.date} ${l.product} ${l.lane} is "${res}" inside a folded day`);
      const completed = completesLadder({ ...l, result: res });
      if (completed && r.date < COMPLETION_POLICY.effectiveFrom) throw new Error(`money: ${r.date} ${l.product} ${l.lane} completed its ladder before ${COMPLETION_POLICY.id} took effect (${COMPLETION_POLICY.effectiveFrom}) — operator-gated, never banked retroactively`);
      const completion = completed ? folded.get(`mr-dub/settled/${r.date}.json#lanes[${idx}]`) : null;
      if (completed && !completion) throw new Error(`money: ${r.date} ${l.product} ${l.lane} completed its ladder but the fold carries no completion receipt for it`);
      const stake = round2(Number(l.stake));
      const ret = res === "won" ? round2(Number(l.potentialReturn)) : res === "lost" ? 0 : stake;
      out.push({
        movementId: `rule-s:${r.date}:${l.product}:${l.lane}:${l.step}`,
        era: ERA.RULE_S,
        date: r.date,
        product: l.product,
        lane: l.lane,
        step: l.step,
        kind: completed ? "ladder_completed" : res === "won" ? "step_rolled" : res === "lost" ? "seed_lost" : "seed_returned",
        stake,
        return: ret,
        settledDecimal: stake > 0 && Number(l.potentialReturn) > 0 ? round2(l.potentialReturn / stake) : null,
        result: RESULT[res],
        bankrollDelta: res === "lost" ? -SEED[l.product] : completed ? completion.banked : 0,
        ...(completed ? { completion } : {}),
        economicPnl: round2(ret - stake),
        settledAt: r.settledAt ?? null,
        legs: (l.legs ?? []).map((g) => ({ id: g.id ?? null, matchup: g.matchup ?? null, selection: g.selection ?? null, official: g.official ?? null, result: g.result ?? null, gamePk: g.gamePk ?? null, eventId: g.eventId ?? null })),
        source: { productReceipt: `mr-dub/settled/${r.date}.json#lanes[${idx}]`, settlement: r.source ?? null },
      });
    });
  }
  return out;
}

/** Placed cards still open after the folded record: Rule S puts their SEED at risk, the lane its stake. */
export function openPositions(receipts, foldedThrough) {
  const out = [];
  for (const r of [...(receipts ?? [])].filter((x) => x?.date > (foldedThrough ?? PROTECTED_BASE.asOf)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const l of r.lanes ?? []) {
      if (!isPlaced(l) || DECIDED.has(String(l.result ?? "pending"))) continue;
      out.push({ date: r.date, product: l.product, lane: l.lane, step: l.step, stake: round2(Number(l.stake)), seedAtRisk: SEED[l.product] ?? null });
    }
  }
  return out;
}

/** The chain: every movement in order, with the bankroll before and after it. */
export function buildMoneyMovements({ portfolio, ledgerEvents, receipts }) {
  const foldedThrough = portfolio?.protectedFold?.foldedThrough ?? null;
  const rows = [...baseMovements(ledgerEvents), ...ruleSMovements(receipts, foldedThrough)];
  let bal = Number(portfolio?.startingBankroll ?? PROTECTED_BASE.startingBankroll);
  for (const m of rows) {
    m.bankrollBefore = round2(bal);
    bal = round2(bal + m.bankrollDelta);
    m.bankrollAfter = bal;
    m.reconciliationVersion = MONEY_MOVEMENTS_VERSION;
  }
  return rows;
}

/**
 * Prove the record from its movements. Fails closed with every reason; repairs nothing.
 * @returns {{ok:boolean, reasons:string[], movements:Array<any>, open:Array<any>, summary:{startingBankroll:number,
 *   currentBankroll:number, recomputedBankroll:number, peak:number, peakDate:string|null, storedCrown:number,
 *   deltaToPeak:number, foldedThrough:string|null, rows:number, rowsByEra:Record<string,number>,
 *   resultsByEra:Record<string,Record<string,number>>, openPositions:number, openSeedAtRisk:number, openLaneStake:number}}}
 */
export function reconcileMoney({ portfolio, ledgerEvents, summaryDays, receipts }) {
  const reasons = [];
  let movements = [];
  try { movements = buildMoneyMovements({ portfolio, ledgerEvents, receipts }); }
  catch (e) { reasons.push(e.message); }
  const start = Number(portfolio?.startingBankroll ?? PROTECTED_BASE.startingBankroll);

  // 1 · identity: starting bankroll + Σ movements = current bankroll
  const end = movements.length ? movements.at(-1).bankrollAfter : start;
  if (!near(end, portfolio?.currentBankroll)) reasons.push(`starting $${start} + Σ movements = $${end} ≠ current bankroll $${portfolio?.currentBankroll}`);

  // 2 · one movement per card
  const ids = new Map();
  for (const m of movements) ids.set(m.movementId, (ids.get(m.movementId) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) reasons.push(`duplicate settlement: ${id} applied ${n}×`);

  // 3 · the July era closes on the protected base
  const base = movements.filter((m) => m.era === ERA.BASE);
  const baseEnd = base.length ? base.at(-1).bankrollAfter : start;
  if (!near(baseEnd, PROTECTED_BASE.currentBankroll)) reasons.push(`the July-7 history closes at $${baseEnd}, not the protected base $${PROTECTED_BASE.currentBankroll}`);

  // 4 · Rule S per row, and per folded day against the record's own fold
  const ruleS = movements.filter((m) => m.era === ERA.RULE_S);
  for (const m of ruleS) {
    // C1: a completed run banks (final value − seed), re-derived here from the card itself, never trusted
    // from the receipt it rides on. Everything else is Rule S.
    const want = m.result === "LOSS" ? -SEED[m.product] : m.kind === "ladder_completed" ? round2(m.return - SEED[m.product]) : 0;
    if (m.bankrollDelta !== want) reasons.push(`${m.movementId}: ${m.result}${m.kind === "ladder_completed" ? " (completed ladder)" : ""} moved the bankroll ${m.bankrollDelta}, ${m.kind === "ladder_completed" ? COMPLETION_POLICY.id : "Rule S"} says ${want}`);
    if (m.kind === "ladder_completed" && (m.completion?.policy !== COMPLETION_POLICY.id || m.completion?.seed !== SEED[m.product] || m.completion?.finalValue !== m.return || m.completion?.banked !== want))
      reasons.push(`${m.movementId}: the completion receipt does not re-prove (policy ${m.completion?.policy}, seed ${m.completion?.seed}, final ${m.completion?.finalValue}, banked ${m.completion?.banked})`);
    if (m.result === "WIN" && !(m.return > m.stake)) reasons.push(`${m.movementId}: a win returned $${m.return} on $${m.stake}`);
  }
  const fold = portfolio?.protectedFold;
  if (fold) {
    const fresh = foldReceipts((receipts ?? []).filter((r) => r.date <= fold.foldedThrough));
    if (fresh.foldedThrough !== fold.foldedThrough) reasons.push(`receipts fold through ${fresh.foldedThrough}, the record claims ${fold.foldedThrough}`);
    for (const d of fold.days ?? []) {
      const sum = round2(ruleS.filter((m) => m.date === d.date).reduce((s, m) => s + m.bankrollDelta, 0)) || 0;
      if (!near(sum, d.delta)) reasons.push(`${d.date}: Σ card movements ${sum} ≠ folded day ${d.delta}`);
    }
  }

  // 5 · stake carry: a step-1 stake is the seed; every later stake is exactly the prior won step's return, on
  //     the rung that return carries into (a payout clearing a later goal skips to it — ladder-position.mjs).
  //     A completed run is never carried: its lane restarts at step 1. Catches a stake or a return edited after
  //     the fact. Uses every PLACED row, open ones included.
  const lanes = {};
  for (const r of [...(receipts ?? [])].filter((x) => x?.date > PROTECTED_BASE.asOf).sort((a, b) => a.date.localeCompare(b.date)))
    for (const l of r.lanes ?? []) if (isPlaced(l)) (lanes[`${l.product}:${l.lane}`] ??= []).push({ date: r.date, ...l, result: String(l.result ?? "pending") });
  for (const [k, rows] of Object.entries(lanes)) rows.forEach((row, i) => {
    const prev = rows[i - 1];
    // a push / void returns the stake: the lane plays the SAME rung with the SAME stake again (ladder-position.mjs)
    if (prev && (prev.result === "push" || prev.result === "void")) {
      if (Number(row.step) !== Number(prev.step) || !near(row.stake, prev.stake)) reasons.push(`${k} ${row.date} step ${row.step} stake $${row.stake} does not replay the ${prev.result} ${prev.date} step ${prev.step} at $${prev.stake}`);
      return;
    }
    if (Number(row.step) === 1) { if (!near(row.stake, SEED[row.product])) reasons.push(`${k} ${row.date} step 1 stake $${row.stake} ≠ seed $${SEED[row.product]}`); return; }
    if (!prev || prev.result !== "won" || completesLadder(prev) || nextStepAfterWin(prev) !== Number(row.step) || Math.abs(Number(prev.potentialReturn) - Number(row.stake)) >= 0.02)
      reasons.push(`${k} ${row.date} step ${row.step} stake $${row.stake} is not the carried return of a won step ${Number(row.step) - 1}${prev ? ` (prior: ${prev.date} step ${prev.step} ${prev.result} $${prev.potentialReturn})` : ""}`);
  });

  // 6 · the day chain (each opening = prior closing; each closing = opening + P/L) and its per-day totals
  const days = [...(summaryDays ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  days.forEach((d, i) => {
    if (i > 0 && !near(d.opening, days[i - 1].closing)) reasons.push(`${d.date}: balanceBefore $${d.opening} ≠ prior close $${days[i - 1].closing}`);
    if (!near(round2(d.opening + d.pl), d.closing)) reasons.push(`${d.date}: balanceAfter $${d.closing} ≠ $${d.opening} + ${d.pl}`);
    const sum = round2(movements.filter((m) => m.date === d.date).reduce((s, m) => s + m.bankrollDelta, 0)) || 0;
    if (!near(sum, d.pl)) reasons.push(`${d.date}: Σ movements ${sum} ≠ day P/L ${d.pl}`);
  });
  const movedDates = new Set(movements.filter((m) => m.bankrollDelta !== 0).map((m) => m.date));
  for (const date of movedDates) if (!days.some((d) => d.date === date)) reasons.push(`${date}: money moved but the day chain has no row`);
  if (days.length && !near(days.at(-1).closing, portfolio?.currentBankroll)) reasons.push(`the day chain closes at $${days.at(-1).closing}, not the bankroll $${portfolio?.currentBankroll}`);

  // 6b · the ledger's fold rows (ledger.json `protected_fold`): exactly one per date, each equal to Σ that
  //      day's card movements. A fold row applied twice moves Σ ledger without moving a single card.
  const foldRows = (ledgerEvents ?? []).filter((e) => e?.category === "protected_fold");
  const perDate = new Map();
  for (const e of foldRows) perDate.set(e.date, (perDate.get(e.date) ?? 0) + 1);
  for (const [date, n] of perDate) if (n > 1) reasons.push(`ledger: ${n} protected_fold rows for ${date} (a folded day applied ${n}×)`);
  for (const e of foldRows) {
    const sum = round2(ruleS.filter((m) => m.date === e.date).reduce((s, m) => s + m.bankrollDelta, 0)) || 0;
    if (!near(sum, e.paperProfit)) reasons.push(`ledger: ${e.date} fold row moves ${e.paperProfit}, its cards move ${sum}`);
  }

  // 7 · peak: derived, never stored-only. The July history peaks per booked row; the Rule S era at each folded
  //     day's CLOSE (the fold's granularity — a completion and a loss settled the same night are one close).
  //     peak = the stored high-water mark. The crown is the June era's peak, a frozen history key: it must
  //     equal the protected base's and can only sit at or below the all-time peak (C1 lets a run rise past it).
  let peak = start, peakDate = portfolio?.startingDate ?? null;
  movements.forEach((m, i) => {
    const dayClose = m.era === ERA.BASE || movements[i + 1]?.date !== m.date;
    if (dayClose && m.bankrollAfter > peak + 0.005) { peak = m.bankrollAfter; peakDate = m.date; }
  });
  if (!near(portfolio?.crownBankroll, PROTECTED_BASE.crownBankroll)) reasons.push(`stored crown $${portfolio?.crownBankroll} ≠ the June crown $${PROTECTED_BASE.crownBankroll} (a history key)`);
  if (Number(portfolio?.crownBankroll) > peak + 0.005) reasons.push(`the crown $${portfolio?.crownBankroll} sits above the recomputed peak $${peak}`);
  if (!near(peak, portfolio?.highWaterMark)) reasons.push(`recomputed peak $${peak} ≠ stored high-water mark $${portfolio?.highWaterMark}`);

  const open = openPositions(receipts, fold?.foldedThrough ?? null);
  const byResult = (era) => movements.filter((m) => m.era === era).reduce((a, m) => ((a[m.result] = (a[m.result] ?? 0) + 1), a), {});
  return {
    ok: reasons.length === 0,
    reasons,
    movements,
    open,
    summary: {
      startingBankroll: start,
      currentBankroll: portfolio?.currentBankroll ?? null,
      recomputedBankroll: end,
      peak: round2(peak),
      peakDate,
      storedCrown: portfolio?.crownBankroll ?? null,
      deltaToPeak: round2(Number(portfolio?.currentBankroll) - peak),
      foldedThrough: fold?.foldedThrough ?? null,
      rows: movements.length,
      rowsByEra: { [ERA.BASE]: base.length, [ERA.RULE_S]: ruleS.length },
      resultsByEra: { [ERA.BASE]: byResult(ERA.BASE), [ERA.RULE_S]: byResult(ERA.RULE_S) },
      openPositions: open.length,
      openSeedAtRisk: round2(open.reduce((s, o) => s + (o.seedAtRisk ?? 0), 0)),
      openLaneStake: round2(open.reduce((s, o) => s + o.stake, 0)),
      completionPolicy: { id: COMPLETION_POLICY.id, effectiveFrom: COMPLETION_POLICY.effectiveFrom },
      completions: ruleS.filter((m) => m.kind === "ladder_completed").length,
      completionsBanked: round2(ruleS.filter((m) => m.kind === "ladder_completed").reduce((s, m) => s + m.bankrollDelta, 0)),
    },
  };
}
