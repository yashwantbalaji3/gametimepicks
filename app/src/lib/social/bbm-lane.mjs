/**
 * BANK BUILDER & MOONSHOT CHALLENGE LANES V2, the social side's reader (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §1-§4).
 * PURE: no I/O, no clock, no network.
 *
 * Graphics read the same file the website reads: the engine's public lane projection `gtp.challenge-lane.public@1`
 * (betting-engine, claude/bbm-v2-lanes @ 109a70ffe0, docs/CHALLENGE_LANES_V2.md §3). A file that does not verify is
 * refused. This module turns one projection and one ET posting date into what that day's graphic prints: STEP k OF N,
 * the ladder rungs, start / tracked / goal bankroll, the day's frozen card and its leg results. Prices are withheld in
 * the projection (P1), so no payout ever comes from here; a sample payout is a separately labelled fixture.
 */
import { createHash } from "node:crypto";

export const LANE_PROJECTION_SCHEMA = "gtp.challenge-lane.public@1";
export const BBM_LANES = Object.freeze({
  "bb-a": Object.freeze({ laneId: "bb-a", product: "bank-builder", letter: "A", baseCents: 10000, targetCents: 1000000, steps: 3, packageId: (d) => `bb-${d}` }),
  "bb-b": Object.freeze({ laneId: "bb-b", product: "bank-builder", letter: "B", baseCents: 10000, targetCents: 1000000, steps: 3, packageId: (d) => `bb-${d}` }),
  "ms-a": Object.freeze({ laneId: "ms-a", product: "moonshot", letter: "A", baseCents: 2500, targetCents: 100000, steps: 5, packageId: (d) => `ms-a-${d}` }),
  "ms-b": Object.freeze({ laneId: "ms-b", product: "moonshot", letter: "B", baseCents: 2500, targetCents: 100000, steps: 5, packageId: (d) => `ms-b-${d}` }),
});
/** What the graphic draws for the day. CARD = the day's frozen card; NO_ELIGIBLE_CARD, BUSTED and COMPLETE are status graphics. */
export const VIEW = Object.freeze({ CARD: "CARD", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", BUSTED: "BUSTED", COMPLETE: "COMPLETE", IN_PLAY: "IN_PLAY" });
/** Rung states on the ladder meter. */
export const RUNG = Object.freeze({ COMPLETED: "completed", ACTIVE: "active", FAILED: "failed", UPCOMING: "upcoming" });
/** Founder blocker P1 (SPEC §6): no permitted price source, so no price-derived number reaches an exported graphic. */
export const P1_PRICE_SOURCE_DECIDED = false;
/** Day statuses that show the day's frozen card. */
const CARD_DAY = new Set(["READY", "UNPRICED", "IN_PLAY"]);

/** The engine's canonical JSON (challenge-lanes/chain.mjs): keys sorted recursively, no whitespace, undefined dropped. */
export function canonical(x) {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`;
  return JSON.stringify(x);
}
const shaOf = (s) => createHash("sha256").update(s).digest("hex");
/** Seal a projection the way the engine does (verifyLaneProjection's rule); fixtures and tests. */
export const sealProjection = (doc) => { const { contentSha256: _c, ...rest } = doc; return { ...rest, contentSha256: shaOf(canonical(rest)) }; };

/** [] when the file is a sealed projection of a known lane with that lane's fixed terms and prices withheld. */
export function projectionViolations(doc) {
  if (doc?.schema !== LANE_PROJECTION_SCHEMA) return [`schema ${doc?.schema}`];
  const v = [];
  const { contentSha256, ...rest } = doc;
  if (contentSha256 !== shaOf(canonical(rest))) v.push("contentSha256 does not match the file (verifyLaneProjection)");
  const L = BBM_LANES[doc.laneId];
  if (!L) return [...v, `unknown lane ${doc.laneId}`];
  for (const k of ["product", "baseCents", "targetCents", "steps"]) if (doc[k] !== L[k]) v.push(`${k} ${doc[k]} is not ${L[k]} for ${L.laneId}`);
  if (doc.slot !== L.letter) v.push(`slot ${doc.slot} is not ${L.letter}`);
  if (doc.prices?.state !== "WITHHELD_P1") v.push(`prices ${doc.prices?.state}: a public projection withholds prices`);
  if (!Array.isArray(doc.runs) || !doc.runs.length) v.push("no runs");
  return v;
}

/**
 * The graphic's view of one lane on one ET posting date (the run holding that date, its days up to that date). Throws
 * on a file that does not verify; `view: null` with a reason when there is nothing to draw.
 */
export function laneView(doc, date) {
  const bad = projectionViolations(doc);
  if (bad.length) throw new Error(`lane projection refused:\n  - ${bad.join("\n  - ")}`);
  const L = BBM_LANES[doc.laneId];
  const base = { laneId: doc.laneId, product: doc.product, letter: L.letter, date, baseCents: doc.baseCents, targetCents: doc.targetCents, steps: doc.steps, payout: null };
  const run = [...doc.runs].reverse().find((r) => r.days.some((d) => d.date === date));
  if (!run) return { ...base, view: null, reason: `no day ${date} in ${doc.laneId}` };
  const days = run.days.filter((d) => d.date <= date);
  const today = days.find((d) => d.date === date);
  const wins = days.filter((d) => d.stepOutcome === "WIN");
  const lost = days.find((d) => d.stepOutcome === "LOSS") ?? null;
  const step = lost ? lost.step : Math.min(today.step, doc.steps);
  const rungs = Array.from({ length: doc.steps }, (_, i) => {
    const k = i + 1;
    if (wins.some((d) => d.step === k)) return { step: k, state: RUNG.COMPLETED };
    if (lost?.step === k) return { step: k, state: RUNG.FAILED };
    return { step: k, state: k === step && !lost ? RUNG.ACTIVE : RUNG.UPCOMING };
  });
  // Public bankroll: the base until a step settles. After a win it is price-derived: the engine withholds it (P1), and
  // only an unwithheld run total for the run's latest day can print.
  const latest = run.days.at(-1).date === date;
  const bankrollCents = lost ? 0 : !wins.length ? doc.baseCents : latest && run.trackedBankrollWithheld == null && Number.isInteger(run.trackedBankrollCents) ? run.trackedBankrollCents : null;
  const v = { ...base, runId: run.runId, step, rungs, cleared: wins.length, bankrollCents, staked: today.staked === true, dayStatus: today.status, reason: today.reason ?? null };
  if (lost) return { ...v, view: VIEW.BUSTED, bustedAt: { step: lost.step, date: lost.date }, card: lost.card, legResults: lost.legResults, eventSha256: lost.cardEventSha256 };
  if (bankrollCents == null) return { ...v, view: null, reason: "the tracked bankroll is withheld (P1) once a priced step has won; no graphic until P1" };
  if (today.status === "COMPLETE") return { ...v, view: VIEW.COMPLETE, card: null, eventSha256: null };
  if (today.card && CARD_DAY.has(today.status)) return { ...v, view: VIEW.CARD, card: today.card, eventSha256: today.cardEventSha256 };
  if (today.status === "NO_ELIGIBLE_CARD") {
    const open = days.find((d) => d.date < date && d.staked && !d.stepOutcome);
    if (open) return { ...v, view: VIEW.IN_PLAY, card: open.card, reason: `step ${open.step} from ${open.date} has not settled` };
    const ev = [...run.events].reverse().find((e) => e.type === "STATUS" && e.date === date && e.status === "NO_ELIGIBLE_CARD");
    return { ...v, view: VIEW.NO_ELIGIBLE_CARD, card: null, eventSha256: ev?.sha256 ?? null };
  }
  return { ...v, view: null, card: null, reason: `${today.status}: ${today.reason ?? "no graphic for this status"}` };
}
