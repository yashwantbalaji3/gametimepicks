/**
 * BANK BUILDER & MOONSHOT SOCIAL CHALLENGES V2 (founder directive, 2026-11-04; contract ~/gtp-evidence/bbm-v2/SPEC.md).
 * The website shows the SAME four lanes as the X graphics, read from the engine's public lane projection
 * (`gtp.challenge-lane.public@1`, lib/challenge-lanes/projection.mjs; docs/CHALLENGE_LANES_V2.md §3) at
 * app/public/data/challenge-lanes/<laneId>.json. Pure: the site's acceptance check and view model, no file access.
 *
 * ACCEPTANCE = the engine's verifyLaneProjection (schema + canonical content digest) PLUS the site's own refusals: the
 * file is the lane asked for, its base/target/steps are the lane's, it is not a fixture, and NOTHING PRICED is in it —
 * a price event must be the engine's withheld stub, no price/odds/book/payout/profit key appears anywhere, and a
 * withheld bankroll is null. A file that fails any of these is refused whole, never filtered.
 */
import { verifyLaneProjection, IMAGE_PATH } from "../../challenge-lanes/projection.mjs";
import { LANES as ENGINE_LANES, STATUS } from "../../challenge-lanes/lanes.mjs";

export const LANE_IDS = Object.freeze(Object.keys(ENGINE_LANES));
export const lanesOf = (product) => LANE_IDS.filter((id) => ENGINE_LANES[id].product === product);

/** No prices or payouts on the site until founder decision P1. A switch, not a branch: the view never prints one. */
export const PRICES_ON_SITE = false;
export const AWAITING_PRICES = "Awaiting verified prices";

const PRICE_EVENTS = new Set(["PRICE_VERIFIED", "PAYOUT_COMPUTED"]);
const PRICE_STUB_KEYS = new Set(["seq", "type", "date", "step", "at", "source", "withheld", "result", "refusals"]);
/* Any of these keys anywhere in a public file means a price leaked. */
export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "price", "odds", "oddsFormat", "decimal", "decimalPrice", "americanPrice", "parlayPrice", "parlayDecimal", "book", "bookmaker",
  "line", "grossPayout", "grossPayoutCents", "payout", "payoutCents", "potentialPayout", "profit", "profitCents",
  "potentialProfit", "priceSnapshotSha", "priceSnapshotSha256",
]);

function findForbiddenKey(v, at = "$") {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const f = findForbiddenKey(v[i], `${at}[${i}]`); if (f) return f; } return null; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(k)) return `${at}.${k}`;
      const f = findForbiddenKey(x, `${at}.${k}`); if (f) return f;
    }
  }
  return null;
}

/** { ok: true } or { ok: false, reason }. */
export function acceptLaneProjection(doc, { laneId, allowFixture = false } = {}) {
  if (!doc || typeof doc !== "object") return { ok: false, reason: "not a lane file" };
  if (!verifyLaneProjection(doc)) return { ok: false, reason: "schema or content digest does not verify" };
  const lane = ENGINE_LANES[doc.laneId];
  if (!lane) return { ok: false, reason: `unknown lane ${doc.laneId}` };
  if (laneId && doc.laneId !== laneId) return { ok: false, reason: `file is lane ${doc.laneId}, not ${laneId}` };
  if (doc.fixture && !allowFixture) return { ok: false, reason: "fixture file" };
  if (doc.product !== lane.product || doc.baseCents !== lane.baseCents || doc.targetCents !== lane.targetCents || doc.steps !== lane.steps) return { ok: false, reason: "product/base/target/steps differ from the lane" };
  const leak = findForbiddenKey(doc);
  if (leak) return { ok: false, reason: `price field in a public file (${leak})` };
  if (!Array.isArray(doc.runs) || !doc.runs.length || !doc.current) return { ok: false, reason: "no runs" };
  for (const run of doc.runs) {
    if (run.trackedBankrollWithheld && run.trackedBankrollCents != null) return { ok: false, reason: `withheld bankroll printed in ${run.runId}` };
    for (const e of run.events ?? []) {
      if (!PRICE_EVENTS.has(e.type)) continue;
      if (e.withheld !== "P1" || Object.keys(e).some((k) => !PRICE_STUB_KEYS.has(k))) return { ok: false, reason: `${e.type} is not the withheld stub in ${run.runId}` };
    }
  }
  if (doc.current.trackedBankrollWithheld && doc.current.trackedBankrollCents != null) return { ok: false, reason: "withheld bankroll printed" };
  return { ok: true };
}

/**
 * PUBLIC STATUS VOCABULARY (SPEC rev 2 §3), shared with the graphics: one word each, with a glyph so state is never
 * colour alone. The engine's internal codes map onto these with the reason shown.
 */
export const LANE_STATUS = Object.freeze({
  ACTIVE: { label: "ACTIVE", glyph: "●", tone: "active" },
  WON: { label: "WON", glyph: "✓", tone: "won" },
  LOST: { label: "LOST", glyph: "✕", tone: "lost" },
  HELD: { label: "HELD", glyph: "Ⅱ", tone: "held" },
  COMPLETED: { label: "COMPLETED", glyph: "★", tone: "won" },
  FINISHED_SHORT: { label: "FINISHED SHORT", glyph: "◐", tone: "held" },
  UNAVAILABLE: { label: "RECORD NOT PUBLISHED", glyph: "○", tone: "held" },
});
/** The engine's lane statuses (lib/challenge-lanes/lanes.mjs STATUS, plus rev 2's FINISHED_SHORT) → the public six. */
export const PUBLIC_STATUS_OF = Object.freeze({
  [STATUS.IN_PLAY]: "ACTIVE",
  [STATUS.READY]: "HELD", [STATUS.UNPRICED]: "HELD", [STATUS.NO_ELIGIBLE_CARD]: "HELD", [STATUS.PENDING_VOID_REVIEW]: "HELD", [STATUS.PAUSED]: "HELD",
  [STATUS.BUSTED]: "LOST", [STATUS.AWAITING_RESTART_APPROVAL]: "LOST",
  [STATUS.COMPLETE]: "COMPLETED", FINISHED_SHORT: "FINISHED_SHORT",
});
const DAY_TEXT = Object.freeze({
  [STATUS.IN_PLAY]: "Active", [STATUS.PENDING_VOID_REVIEW]: "Held · void under review", [STATUS.BUSTED]: "Lost",
  [STATUS.AWAITING_RESTART_APPROVAL]: "Lost · restart awaiting approval", [STATUS.COMPLETE]: "Completed",
  [STATUS.NO_ELIGIBLE_CARD]: "Held · no qualifying card", [STATUS.UNPRICED]: "Held · not staked, awaiting verified prices",
  [STATUS.PAUSED]: "Held", [STATUS.READY]: "Card frozen · awaiting verified prices", FINISHED_SHORT: "Finished short",
});

/**
 * ILLUSTRATIVE MILESTONES (SPEC rev 2 §2: display defaults, founder-adjustable; Moonshot's row is the PD proposal).
 * TEMPORARY, adapter-only: the engine owns these once its projection carries `milestonesCents`, and the site then reads
 * the projection's. Applied only to a five-step lane; index 0 is the base, index 5 the target.
 */
export const SPEC_REV2_MILESTONES_CENTS = Object.freeze({
  "bank-builder": Object.freeze([10000, 30000, 90000, 270000, 650000, 1000000]),
  moonshot: Object.freeze([2500, 7500, 18000, 36000, 65000, 100000]),
});

const money = (cents) => (typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null);
/** The engine's reasons read "CODE: sentence". The site shows the sentence. */
const reasonText = (r) => {
  if (typeof r !== "string") return null;
  const t = r.replace(/^[A-Z0-9_]+:\s*/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const xUrl = (u) => (typeof u === "string" && /^https:\/\/(x|twitter)\.com\//.test(u) ? u : null);
/* One formatter for the module (a formatter per call is what blew the build's memory, #1262). */
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const etTime = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET_TIME.format(t)} ET` : null; };

/** Team identity for a leg: name and colours from the NBA team colour DATA, when the caller supplies it. */
function teamOf(teams, abbr) {
  if (!teams || !abbr) return null;
  const a = String(abbr).toUpperCase();
  const t = teams.teams?.[teams.aliases?.[a] ?? a];
  if (!t?.listed?.length) return null;
  return { name: t.name ?? null, color: t.listed[0], ink: teams.inkFor ? teams.inkFor(t.listed[0]) : null };
}

function legsOf(day, projectionLabel, teams) {
  const outcome = new Map((day.legResults ?? []).map((r) => [r.legId, r.outcome]));
  return (day.card?.legs ?? []).map((l, i) => {
    const o = outcome.get(l.legId);
    const abbr = l.selection?.teamAbbr ?? null;
    const [away, home] = String(l.eventLabel ?? "").split(" @ ");
    const opponent = l.selection?.code === "home" ? away : l.selection?.code === "away" ? home : null;
    const prop = l.market !== "winner";
    return {
      n: i + 1, legId: l.legId, gameId: l.gameId, game: l.eventLabel ?? l.gameId, market: l.market ?? null, prop,
      selection: l.selection?.label ?? abbr ?? "", teamAbbr: abbr, team: teamOf(teams, abbr),
      matchup: opponent ? `${l.selection.code === "home" ? "vs" : "@"} ${opponent}` : l.eventLabel ?? null,
      time: etTime(l.startUtc),
      projectionLabel: prop ? projectionLabel : "MODEL WIN PROBABILITY", projection: l.probabilityShown ?? null,
      flags: l.guard?.flagText ?? [],
      outcome: o && o !== "PENDING" ? o : null,
    };
  });
}

function dayView(day, projectionLabel, teams) {
  const legs = day.card ? legsOf(day, projectionLabel, teams) : [];
  let result = null;
  if (day.stepOutcome === "WIN") result = `Step ${day.step} won.`;
  else if (day.stepOutcome === "LOSS") result = `Step ${day.step} lost.`;
  else if (day.stepOutcome) result = `Step ${day.step}: ${day.stepOutcome}.`;
  else if (day.card && !day.staked && day.modelCardResult && day.modelCardResult !== "PENDING") result = `The model card ${day.modelCardResult === "WIN" ? "won" : "lost"}, but it was not staked, so the lane did not move.`;
  return {
    date: day.date, step: day.step, internalStatus: day.status,
    statusText: day.stepOutcome === "WIN" ? "Won" : day.stepOutcome === "LOSS" ? "Lost" : DAY_TEXT[day.status] ?? day.status ?? "",
    tone: day.stepOutcome === "WIN" ? "won" : day.stepOutcome === "LOSS" ? "lost" : day.status === STATUS.IN_PLAY ? "active" : "held",
    reason: reasonText(day.reason), staked: Boolean(day.staked), legs, hasCard: Boolean(day.card),
    modelCardResult: day.modelCardResult ?? null, stepOutcome: day.stepOutcome ?? null, result,
  };
}

/**
 * The site's view of one lane (its current run, earlier runs as the restart history) from an ACCEPTED document. Pure and
 * never mutates the document. Options: `teams` (NBA team colour data, for team marks), `imageVerified(path, sha)` (the
 * loader's byte check; with none, no image is shown).
 * @param {any} doc
 * @param {{ teams?: { teams: any, aliases: any, inkFor?: (fill: string) => string } | null, imageVerified?: (path: string, sha: string) => boolean }} [opts]
 */
export function laneView(doc, { teams = null, imageVerified = () => false } = {}) {
  const lane = ENGINE_LANES[doc.laneId];
  const run = doc.runs[doc.runs.length - 1];
  const cur = doc.current;
  const steps = doc.steps;
  const step = Math.min(cur.step, steps);
  const projectionLabel = doc.projectionLabel ?? "MODEL PROJECTION";
  const days = run.days.map((d) => dayView(d, projectionLabel, teams));
  const latest = days.at(-1) ?? null;
  let status = PUBLIC_STATUS_OF[cur.status] ?? "HELD";
  /* WON: the latest day settled a winning step and the next step has no card yet. */
  if (status === "HELD" && latest?.stepOutcome === "WIN") status = "WON";
  const lost = status === "LOST";
  const wonSteps = new Set(run.days.filter((d) => d.stepOutcome === "WIN").map((d) => d.step));
  const milestonesCents = Array.isArray(doc.milestonesCents) && doc.milestonesCents.length === steps + 1 ? doc.milestonesCents
    : steps === 5 ? SPEC_REV2_MILESTONES_CENTS[lane.product] : null;
  const milestoneSource = Array.isArray(doc.milestonesCents) ? "projection" : milestonesCents ? "spec-rev2-default" : null;
  const rungs = Array.from({ length: steps }, (_, i) => {
    const k = i + 1;
    const state = status === "COMPLETED" || wonSteps.has(k) ? "completed" : lost && k === step ? "failed" : k === step && !lost ? "active" : "upcoming";
    return { step: k, state, milestone: milestonesCents ? money(milestonesCents[k]) : null };
  });
  const cleared = rungs.filter((r) => r.state === "completed").length;
  /* A lost step loses the whole tracked bankroll (all-in ladder), as the graphics print it; no price is involved. */
  const trackedCents = lost ? 0 : cur.trackedBankrollWithheld ? null : cur.trackedBankrollCents;
  /* Pace: the tracked bankroll against the milestone the lane should have reached after the steps it has cleared. */
  let pace = null;
  if (milestonesCents && !lost && status !== "COMPLETED") {
    const due = milestonesCents[Math.min(cleared, steps)];
    if (trackedCents == null) pace = { state: "unpriced", text: "Pace: awaiting verified prices" };
    else if (trackedCents >= due) pace = { state: "on", text: cleared ? `On pace · milestone ${money(due)}` : `On pace · next milestone ${money(milestonesCents[1])}` };
    else pace = { state: "behind", text: `Behind pace by ${money(due - trackedCents)} · milestone ${money(due)}` };
  }
  let note = reasonText(cur.statusReason);
  if (lost) note = `Lost at step ${step} of ${steps}.${cur.status === STATUS.AWAITING_RESTART_APPROVAL ? " A new run starts only after a founder-approved restart." : ""}`;
  if (!note && status === "ACTIVE") note = `Step ${step} of ${steps} is active. No new card until it settles.`;
  if (!note && status === "WON") note = `Step ${step - 1} won. Step ${step} gets the next qualifying card.`;
  const current = latest?.hasCard && ["ACTIVE", "HELD"].includes(status) && latest.internalStatus !== STATUS.NO_ELIGIBLE_CARD ? latest : null;
  const stake = [...run.events].reverse().find((e) => e.type === "STAKE_SET" && e.date === latest?.date);
  const receipts = run.days.flatMap((d) => d.receipts ?? []);
  const graphics = receipts.filter((r) => r.type === "GRAPHIC_RENDERED").map((g) => {
    const same = (r) => (r.packageId ?? null) === (g.packageId ?? null) && r.date === g.date;
    const post = receipts.find((r) => r.type === "POSTED" && same(r));
    /* The engine's own image-path rule, re-applied, and the bytes on disk must be the bytes the engine recorded. */
    const pathOk = typeof g.imagePath === "string" && IMAGE_PATH.test(g.imagePath) && !g.imagePath.includes("..");
    return {
      date: g.date, step: g.step, packageId: g.packageId ?? null, imageSha256: g.imageSha256 ?? null,
      imagePath: pathOk && g.imageSha256 && imageVerified(g.imagePath, g.imageSha256) ? g.imagePath : null,
      approved: receipts.some((r) => r.type === "APPROVED" && same(r)), postUrl: xUrl(post?.url), postedAt: post?.postedAt ?? null,
    };
  });
  const runs = doc.runs.map((r, i) => ({
    runId: r.runId, number: i + 1, started: String(r.startedAt ?? "").slice(0, 10) || null,
    status: LANE_STATUS[PUBLIC_STATUS_OF[r.status] ?? "HELD"].label, stepsWon: r.stepsWon ?? 0, current: i === doc.runs.length - 1,
  }));
  return {
    laneId: doc.laneId, product: lane.product, letter: lane.slot, name: `Lane ${lane.slot}`,
    runId: run.runId, runNumber: doc.runs.length, startedAt: String(run.startedAt ?? "").slice(0, 10) || null,
    step, steps, cleared, status, statusLabel: LANE_STATUS[status].label, statusGlyph: LANE_STATUS[status].glyph, tone: LANE_STATUS[status].tone,
    internalStatus: cur.status, note,
    base: money(doc.baseCents), target: money(doc.targetCents),
    tracked: trackedCents == null ? AWAITING_PRICES : money(trackedCents),
    toTarget: trackedCents == null || lost ? null : money(Math.max(0, doc.targetCents - trackedCents)),
    wager: lost ? null : stake?.stakeCents != null ? money(stake.stakeCents) : stake?.withheld ? AWAITING_PRICES : "Not staked",
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES,
    pace, milestoneSource, label: doc.label ?? "Tracked challenge · no real wager placed",
    rungs, current, story: [...days].reverse(), graphics, runs,
  };
}

/** The placeholder view for a lane whose public file is absent or refused: says so, invents nothing. */
export function unavailableLaneView(laneId, reason) {
  const lane = ENGINE_LANES[laneId];
  return {
    laneId, product: lane.product, letter: lane.slot, name: `Lane ${lane.slot}`, runId: null, runNumber: 0, startedAt: null,
    step: null, steps: lane.steps, cleared: 0, status: "UNAVAILABLE", statusLabel: LANE_STATUS.UNAVAILABLE.label, statusGlyph: LANE_STATUS.UNAVAILABLE.glyph, tone: "held",
    internalStatus: null, note: reason, base: money(lane.baseCents), target: money(lane.targetCents), tracked: null, toTarget: null, wager: null,
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES, pace: null, milestoneSource: null, label: "Tracked challenge · no real wager placed",
    rungs: Array.from({ length: lane.steps }, (_, i) => ({ step: i + 1, state: "upcoming", milestone: null })),
    current: null, story: [], graphics: [], runs: [],
  };
}
