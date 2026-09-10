/**
 * LADDER POSITION — where each paper lane stands, derived from the official nightly receipts.
 *
 * Bank Builder and Moonshot are ladders: every leg of a step's card wins → the whole payout carries
 * to the next rung; any leg loses → the lane restarts at its seed. Until 2026-09-10 the daily
 * generator never applied that rule. It read each lane's rung from the dual-ladder card store, which
 * stopped moving on 2026-08-17, so every morning both Bank Builder lanes were dealt a fresh Step 1 at
 * $100 — including the four mornings after a lane had won (A on 09-06 and 09-08, B on 09-07 and
 * 09-09) — and Moonshot was a fresh $25 ticket every day with no ladder at all.
 *
 * The nightly settler already writes the one record that knows: `mr-dub/settled/<date>.json`,
 * write-once, graded from the official StatsAPI box score and linescore. Each lane row carries its
 * product, lane, step, stake, result and potential return — everything a ladder needs. Deriving the
 * position from it means the rung can never disagree with the grade.
 *
 * RULES
 *   · won          → the next rung, carrying the card's REAL payout (not the rung's nominal goal). A
 *                    payout that already clears a later rung's goal skips to the first rung it has not
 *                    cleared; one that clears the final goal completes the run, and the lane starts a
 *                    new cycle at its seed.
 *   · lost         → restart at Step 1 with the seed.
 *   · void / push  → the same step with the same stake (the stake came back).
 *   · pending on a PLACED card → HELD: the lane has an open card and gets no new one. Dealing a card
 *                    on top of an unsettled one would stake a balance nobody knows yet.
 *   · a row that was never placed (candidate / awaiting) is not a step at all and is skipped.
 *
 * LEGACY ROWS. Receipts written before this module did not record whether a lane was placed, so a
 * pending legacy row is ambiguous (placed and ungraded, or never placed). Those are skipped: every
 * legacy day that matters is decided, and the settler now writes `status` on every row.
 *
 * Paper only. Nothing here reads or writes protected money; the receipts are the settler's output.
 */
import fs from "node:fs";
import path from "node:path";

export const RECEIPTS_REL = ["mr-dub", "settled"];

const PLACED = new Set(["active", "won", "lost", "void", "push"]);
const DECIDED = new Set(["won", "lost", "void", "push"]);
const round2 = (n) => Math.round(n * 100) / 100;

/** Every PLACED step one lane has played, oldest first. */
export function laneSteps(receipts, product, lane) {
  const want = String(lane).toUpperCase();
  const rows = [];
  const ordered = [...(receipts ?? [])].filter((r) => r && r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const r of ordered) {
    for (const l of r.lanes ?? []) {
      if (l?.product !== product || String(l?.lane ?? "").toUpperCase() !== want) continue;
      const result = String(l.result ?? "pending");
      const placed = l.status != null ? PLACED.has(String(l.status)) : DECIDED.has(result);
      if (!placed) continue;
      rows.push({ date: r.date, step: Number(l.step) || 1, stake: Number(l.stake), result, payout: Number(l.potentialReturn) });
    }
  }
  return rows;
}

/**
 * The rung a lane plays next, in the LaneRung shape the selectors take
 * ({ lane, nextStep, clearedSteps, rolledStake, targetReturn, targetMultiplier }), plus
 * `state` ("ready" | "held"), `cycle`, `basis` (the step it was derived from) and a plain `why`.
 */
export function positionFromReceipts({ receipts, product, lane, ladder, seed }) {
  if (!Array.isArray(ladder) || !ladder.length) throw new Error("positionFromReceipts: ladder required");
  const rungAt = (s) => ladder.find((r) => r.step === s) ?? null;
  const first = ladder[0];
  const L = String(lane).toUpperCase();
  const fresh = (cycle, basis, why) => ({
    lane: L, state: "ready", nextStep: first.step, clearedSteps: 0, rolledStake: seed,
    targetReturn: first.goal, targetMultiplier: first.goal / seed, cycle, basis, why,
  });
  const at = (step, stake, cycle, basis, why) => {
    const rung = rungAt(step);
    return { lane: L, state: "ready", nextStep: step, clearedSteps: step - 1, rolledStake: round2(stake), targetReturn: rung.goal, targetMultiplier: rung.goal / stake, cycle, basis, why };
  };

  let pos = fresh(1, null, `no placed card yet — the ladder starts at Step 1 with $${seed}`);
  for (const s of laneSteps(receipts, product, L)) {
    const basis = { date: s.date, step: s.step, result: s.result, stake: s.stake, payout: Number.isFinite(s.payout) ? s.payout : null };
    if (s.result === "pending") {
      pos = { ...pos, state: "held", basis, why: `the ${s.date} Step ${s.step} card is still open — no new card until it settles` };
    } else if (s.result === "won") {
      const payout = Number.isFinite(s.payout) && s.payout > 0 ? s.payout : (rungAt(s.step)?.goal ?? seed);
      let n = s.step + 1;
      while (rungAt(n) && payout >= rungAt(n).goal) n += 1;
      pos = rungAt(n)
        ? at(n, payout, pos.cycle, basis, `won Step ${s.step} on ${s.date} — $${round2(payout)} carries to Step ${n}`)
        : fresh(pos.cycle + 1, { ...basis, completed: true }, `completed the ladder on ${s.date} — a new cycle starts at $${seed}`);
    } else if (s.result === "lost") {
      pos = fresh(pos.cycle + 1, basis, `lost Step ${s.step} on ${s.date} — the lane restarts at Step 1 with $${seed}`);
    } else {
      // void / push: the stake came back; the same rung is played again with the same balance.
      pos = rungAt(s.step) && Number.isFinite(s.stake) && s.stake > 0
        ? at(s.step, s.stake, pos.cycle, basis, `Step ${s.step} on ${s.date} was ${s.result} — the same rung is played again`)
        : pos;
    }
  }
  return pos;
}

/**
 * The steps of the lane's CURRENT run: the won rows since its last restart (a loss or a completed
 * ladder), oldest first. What a board draws as cleared rungs — and only these, so a win from a run
 * that later lost can never be drawn beneath today's rung.
 */
export function currentRunSteps(receipts, product, lane, ladder) {
  const finalStep = Array.isArray(ladder) && ladder.length ? ladder[ladder.length - 1].step : Infinity;
  let run = [];
  for (const s of laneSteps(receipts, product, lane)) {
    if (s.result === "won") run = s.step >= finalStep ? [] : [...run, s];
    else if (s.result === "lost") run = [];
  }
  return run;
}

/** Read every receipt dated strictly BEFORE `beforeDate` — a generation never sees its own day. */
export function readReceipts(root, beforeDate) {
  const dir = path.join(root, ...RECEIPTS_REL);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return []; }
  const out = [];
  for (const f of files.sort()) {
    const date = f.slice(0, 10);
    if (beforeDate && date >= beforeDate) continue;
    try { out.push({ date, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), date }); } catch { /* unreadable receipt: skipped, never guessed */ }
  }
  return out;
}

/** Both lanes' positions for one product. */
export function receiptPositions({ root, date, product, ladder, seed }) {
  const receipts = readReceipts(root, date);
  return {
    laneA: positionFromReceipts({ receipts, product, lane: "A", ladder, seed }),
    laneB: positionFromReceipts({ receipts, product, lane: "B", ladder, seed }),
  };
}
