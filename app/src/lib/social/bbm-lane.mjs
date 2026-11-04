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
/** SPEC revision 2 §1: four lanes, five steps each; Bank Builder takes at most two legs. §5: two posts a day, A then B. */
export const BBM_LANES = Object.freeze({
  "bb-a": Object.freeze({ laneId: "bb-a", product: "bank-builder", letter: "A", baseCents: 10000, targetCents: 1000000, steps: 5, maxLegs: 2, packageId: (d) => `bb-${d}` }),
  "bb-b": Object.freeze({ laneId: "bb-b", product: "bank-builder", letter: "B", baseCents: 10000, targetCents: 1000000, steps: 5, maxLegs: 2, packageId: (d) => `bb-${d}` }),
  "ms-a": Object.freeze({ laneId: "ms-a", product: "moonshot", letter: "A", baseCents: 2500, targetCents: 100000, steps: 5, maxLegs: null, packageId: (d) => `ms-${d}` }),
  "ms-b": Object.freeze({ laneId: "ms-b", product: "moonshot", letter: "B", baseCents: 2500, targetCents: 100000, steps: 5, maxLegs: null, packageId: (d) => `ms-${d}` }),
});
/**
 * Illustrative milestones, base then steps 1-5 (SPEC revision 2 §2, founder's final clarification 2026-11-04; display
 * defaults the founder may adjust). The projection's own `milestonesCents` wins when present, so the site and the
 * graphics read the same ladder.
 */
export const DEFAULT_MILESTONES_CENTS = Object.freeze({
  "bank-builder": Object.freeze([10000, 30000, 90000, 270000, 650000, 1000000]),
  moonshot: Object.freeze([2500, 7500, 18000, 36000, 65000, 100000]),
});
/** Public status vocabulary (SPEC revision 2 §3): every image carries one. */
export const BADGE = Object.freeze({ ACTIVE: "ACTIVE", WON: "WON", LOST: "LOST", HELD: "HELD", COMPLETED: "COMPLETED", FINISHED_SHORT: "FINISHED SHORT" });
/** Internal codes → public status. */
const BADGE_OF = Object.freeze({ READY: "ACTIVE", IN_PLAY: "ACTIVE", UNPRICED: "HELD", NO_ELIGIBLE_CARD: "HELD", PENDING_VOID_REVIEW: "HELD", PAUSED: "HELD", AWAITING_RESTART_APPROVAL: "LOST", BUSTED: "LOST", COMPLETE: "COMPLETED", FINISHED_SHORT: "FINISHED_SHORT" });
/**
 * What the graphic draws for the day. CARD = the day's frozen card; WON = a step won that day (its card, legs landed);
 * NO_ELIGIBLE_CARD (held, no card), BUSTED, COMPLETE and FINISHED_SHORT are status graphics; IN_PLAY refuses.
 */
export const VIEW = Object.freeze({ CARD: "CARD", WON: "WON", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", BUSTED: "BUSTED", COMPLETE: "COMPLETE", FINISHED_SHORT: "FINISHED_SHORT", IN_PLAY: "IN_PLAY" });
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

const badgeOf = (status) => BADGE[BADGE_OF[status] ?? status] ?? null;
/** Pace against the milestone the lane should have reached after `cleared` won steps. */
export function paceOf(bankrollCents, milestonesCents, cleared) {
  if (!Number.isInteger(bankrollCents)) return null;
  const due = milestonesCents[cleared];
  const next = milestonesCents[Math.min(cleared + 1, milestonesCents.length - 1)];
  return bankrollCents >= due ? { state: "ON_PACE", shortfallCents: 0, milestoneCents: due, nextMilestoneCents: next } : { state: "BEHIND", shortfallCents: due - bankrollCents, milestoneCents: due, nextMilestoneCents: next };
}

/** The engine's pace ({ onPace, behindByCents, milestoneCents, withheld }) in this module's shape; null when withheld or absent. */
function enginePace(p, milestonesCents, cleared) {
  if (!p || p.withheld || typeof p.onPace !== "boolean") return null;
  const next = milestonesCents[Math.min(cleared + 1, milestonesCents.length - 1)];
  return { state: p.onPace ? "ON_PACE" : "BEHIND", shortfallCents: p.onPace ? 0 : p.behindByCents, milestoneCents: p.milestoneCents, nextMilestoneCents: next };
}

/**
 * The graphic's view of one lane on one ET posting date (the run holding that date, its days up to that date). Throws
 * on a file that does not verify; `view: null` with a reason when there is nothing to draw. The engine's public status,
 * milestones and pace are used when the projection carries them; otherwise they are derived here from SPEC rev. 2.
 */
export function laneView(doc, date) {
  const bad = projectionViolations(doc);
  if (bad.length) throw new Error(`lane projection refused:\n  - ${bad.join("\n  - ")}`);
  const L = BBM_LANES[doc.laneId];
  // The engine lists the milestone after each step; the ladder here starts from the base.
  const ms = doc.milestonesCents;
  const milestonesCents = Array.isArray(ms) ? (ms.length === doc.steps ? [doc.baseCents, ...ms] : ms) : DEFAULT_MILESTONES_CENTS[doc.product];
  const base = { laneId: doc.laneId, product: doc.product, letter: L.letter, date, baseCents: doc.baseCents, targetCents: doc.targetCents, steps: doc.steps, milestonesCents, payout: null };
  const run = [...doc.runs].reverse().find((r) => r.days.some((d) => d.date === date));
  if (!run) return { ...base, view: null, reason: `no day ${date} in ${doc.laneId}` };
  const days = run.days.filter((d) => d.date <= date);
  const today = days.find((d) => d.date === date);
  const wins = days.filter((d) => d.stepOutcome === "WIN");
  const lost = days.find((d) => d.stepOutcome === "LOSS") ?? null;
  const wonToday = today.stepOutcome === "WIN" ? today : null;
  const step = lost ? lost.step : wonToday ? wonToday.step : Math.min(today.step, doc.steps);
  const rungs = Array.from({ length: doc.steps }, (_, i) => {
    const k = i + 1;
    const milestoneCents = milestonesCents[k];
    if (wins.some((d) => d.step === k)) return { step: k, state: RUNG.COMPLETED, milestoneCents };
    if (lost?.step === k) return { step: k, state: RUNG.FAILED, milestoneCents };
    return { step: k, state: k === step && !lost && !wonToday ? RUNG.ACTIVE : RUNG.UPCOMING, milestoneCents };
  });
  // Public bankroll: the base until a step settles. After a win it is price-derived: the engine withholds it (P1), and
  // only an unwithheld run total for the run's latest day can print.
  const latest = run.days.at(-1).date === date;
  const bankrollCents = lost ? 0 : !wins.length ? doc.baseCents : latest && run.trackedBankrollWithheld == null && Number.isInteger(run.trackedBankrollCents) ? run.trackedBankrollCents : null;
  const pace = lost ? null : enginePace(today.pace ?? (latest ? run.pace : null), milestonesCents, wins.length) ?? paceOf(bankrollCents, milestonesCents, wins.length);
  const v = { ...base, runId: run.runId, step, rungs, cleared: wins.length, bankrollCents, pace, staked: today.staked === true, dayStatus: today.status, reason: today.reason ?? null };
  const badge = (fallback) => badgeOf(today.publicStatus ?? fallback);
  if (lost) return { ...v, view: VIEW.BUSTED, badge: BADGE.LOST, bustedAt: { step: lost.step, date: lost.date }, card: lost.card, legResults: lost.legResults, eventSha256: lost.cardEventSha256 };
  if (bankrollCents == null) return { ...v, view: null, reason: "the tracked bankroll is withheld (P1) once a priced step has won; no graphic until P1" };
  if (today.status === "COMPLETE" || (wins.length >= doc.steps && bankrollCents >= doc.targetCents)) return { ...v, view: VIEW.COMPLETE, badge: BADGE.COMPLETED, card: null, eventSha256: today.cardEventSha256 ?? null };
  if (today.status === "FINISHED_SHORT" || wins.length >= doc.steps) return { ...v, view: VIEW.FINISHED_SHORT, badge: BADGE.FINISHED_SHORT, card: null, eventSha256: today.cardEventSha256 ?? null };
  if (wonToday) return { ...v, view: VIEW.WON, badge: BADGE.WON, card: wonToday.card, legResults: wonToday.legResults, eventSha256: wonToday.cardEventSha256 };
  if (today.card && CARD_DAY.has(today.status)) return { ...v, view: VIEW.CARD, badge: badge(today.status), card: today.card, eventSha256: today.cardEventSha256 };
  if (["NO_ELIGIBLE_CARD", "PENDING_VOID_REVIEW", "PAUSED"].includes(today.status)) {
    const open = days.find((d) => d.date < date && d.staked && !d.stepOutcome);
    if (open && today.status === "NO_ELIGIBLE_CARD") return { ...v, view: VIEW.IN_PLAY, card: open.card, reason: `step ${open.step} from ${open.date} has not settled` };
    const ev = [...run.events].reverse().find((e) => e.type === "STATUS" && e.date === date && e.status === today.status);
    return { ...v, view: VIEW.NO_ELIGIBLE_CARD, badge: BADGE.HELD, card: null, eventSha256: ev?.sha256 ?? null };
  }
  return { ...v, view: null, card: null, reason: `${today.status}: ${today.reason ?? "no graphic for this status"}` };
}
