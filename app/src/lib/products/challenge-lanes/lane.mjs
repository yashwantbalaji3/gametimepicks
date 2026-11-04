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

/** Lane statuses the site shows (SPEC §5): one word each, with a glyph so state is never colour alone. */
export const LANE_STATUS = Object.freeze({
  "in-play": { label: "IN PLAY", glyph: "●" },
  busted: { label: "BUSTED", glyph: "✕" },
  paused: { label: "PAUSED", glyph: "Ⅱ" },
  "no-card": { label: "NO QUALIFYING CARD", glyph: "□" },
  complete: { label: "COMPLETE", glyph: "★" },
  unavailable: { label: "RECORD NOT PUBLISHED", glyph: "○" },
});
/** The engine's lane statuses (lib/challenge-lanes/lanes.mjs STATUS) → the five the site shows. */
export const SITE_STATUS = Object.freeze({
  [STATUS.IN_PLAY]: "in-play", [STATUS.PENDING_VOID_REVIEW]: "in-play",
  [STATUS.BUSTED]: "busted", [STATUS.AWAITING_RESTART_APPROVAL]: "busted",
  [STATUS.COMPLETE]: "complete", [STATUS.NO_ELIGIBLE_CARD]: "no-card",
  [STATUS.UNPRICED]: "paused", [STATUS.PAUSED]: "paused", [STATUS.READY]: "paused",
});
const DAY_TEXT = Object.freeze({
  [STATUS.IN_PLAY]: "In play", [STATUS.PENDING_VOID_REVIEW]: "Held for void review", [STATUS.BUSTED]: "Busted",
  [STATUS.AWAITING_RESTART_APPROVAL]: "Busted · restart awaiting approval", [STATUS.COMPLETE]: "Complete",
  [STATUS.NO_ELIGIBLE_CARD]: "No qualifying card", [STATUS.UNPRICED]: "Not staked · awaiting verified prices",
  [STATUS.PAUSED]: "Paused", [STATUS.READY]: "Card frozen · awaiting verified prices",
});

const money = (cents) => (typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null);
/** The engine's reasons read "CODE: sentence". The site shows the sentence. */
const reasonText = (r) => {
  if (typeof r !== "string") return null;
  const t = r.replace(/^[A-Z0-9_]+:\s*/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const xUrl = (u) => (typeof u === "string" && /^https:\/\/(x|twitter)\.com\//.test(u) ? u : null);

function legsOf(day, projectionLabel) {
  const outcome = new Map((day.legResults ?? []).map((r) => [r.legId, r.outcome]));
  return (day.card?.legs ?? []).map((l) => {
    const o = outcome.get(l.legId);
    return {
      legId: l.legId, gameId: l.gameId, game: l.eventLabel ?? l.gameId,
      selection: l.selection?.label ?? l.selection?.teamAbbr ?? "", teamAbbr: l.selection?.teamAbbr ?? null,
      projectionLabel, projection: l.probabilityShown ?? null,
      flags: l.guard?.flagText ?? [],
      outcome: o && o !== "PENDING" ? o : null,
    };
  });
}

function dayView(day, projectionLabel) {
  return {
    date: day.date, step: day.step, status: day.status, statusText: DAY_TEXT[day.status] ?? day.status ?? "",
    reason: reasonText(day.reason), staked: Boolean(day.staked),
    card: day.card ? { legs: legsOf(day, projectionLabel) } : null,
    modelCardResult: day.modelCardResult ?? null, stepOutcome: day.stepOutcome ?? null,
  };
}

/** The view of one lane: its CURRENT run (earlier runs summarised), from an accepted document. Never mutates it. */
export function laneView(doc) {
  const lane = ENGINE_LANES[doc.laneId];
  const run = doc.runs[doc.runs.length - 1];
  const cur = doc.current;
  const status = SITE_STATUS[cur.status] ?? "paused";
  const steps = doc.steps;
  const step = Math.min(cur.step, steps);
  const days = run.days.map((d) => dayView(d, doc.projectionLabel ?? "MODEL PROJECTION"));
  const today = days.at(-1) ?? null;
  const bustedAt = status === "busted" ? step : null;
  const rungs = Array.from({ length: steps }, (_, i) => {
    const k = i + 1;
    const state = status === "complete" ? "completed" : k === bustedAt ? "failed" : k < step ? "completed" : k === step && !bustedAt ? "active" : "upcoming";
    return { step: k, state };
  });
  let note = reasonText(cur.statusReason);
  if (status === "busted") note = `Busted at step ${step} of ${steps}.${cur.status === STATUS.AWAITING_RESTART_APPROVAL ? " A new run starts only after a founder-approved restart." : ""}`;
  if (!note && status === "in-play") note = `Step ${step} of ${steps} is in play. No new card until it settles.`;
  const stake = [...run.events].reverse().find((e) => e.type === "STAKE_SET" && e.date === today?.date);
  const receipts = run.days.flatMap((d) => d.receipts ?? []);
  const graphics = receipts.filter((r) => r.type === "GRAPHIC_RENDERED").map((g) => {
    const same = (r) => (r.packageId ?? null) === (g.packageId ?? null) && r.date === g.date;
    const post = receipts.find((r) => r.type === "POSTED" && same(r));
    return {
      date: g.date, step: g.step, packageId: g.packageId ?? null, imageSha256: g.imageSha256 ?? null,
      /* The engine's own image-path rule, re-applied: a file edited after projection still cannot point anywhere else. */
      imagePath: typeof g.imagePath === "string" && IMAGE_PATH.test(g.imagePath) && !g.imagePath.includes("..") ? g.imagePath : null,
      approved: receipts.some((r) => r.type === "APPROVED" && same(r)), postUrl: xUrl(post?.url), postedAt: post?.postedAt ?? null,
    };
  });
  return {
    laneId: doc.laneId, product: lane.product, letter: lane.slot, name: `Lane ${lane.slot}`,
    runId: run.runId, runNumber: doc.runs.length, startedAt: run.startedAt ?? null,
    step, steps, status, statusLabel: LANE_STATUS[status].label, statusGlyph: LANE_STATUS[status].glyph, note,
    base: money(doc.baseCents), target: money(doc.targetCents),
    tracked: cur.trackedBankrollWithheld ? AWAITING_PRICES : money(cur.trackedBankrollCents),
    wager: stake?.stakeCents != null ? money(stake.stakeCents) : stake?.withheld ? AWAITING_PRICES : "Not staked",
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES,
    label: doc.label ?? "Tracked challenge · no real wager placed",
    rungs, today, history: days.slice(0, -1).reverse(), graphics,
    earlierRuns: doc.runs.slice(0, -1).map((r) => ({ runId: r.runId, startedAt: r.startedAt ?? null, status: r.status })),
  };
}

/** The placeholder view for a lane whose public file is absent or refused: says so, invents nothing. */
export function unavailableLaneView(laneId, reason) {
  const lane = ENGINE_LANES[laneId];
  return {
    laneId, product: lane.product, letter: lane.slot, name: `Lane ${lane.slot}`, runId: null, runNumber: 0, startedAt: null,
    step: null, steps: lane.steps, status: "unavailable", statusLabel: LANE_STATUS.unavailable.label, statusGlyph: LANE_STATUS.unavailable.glyph,
    note: reason, base: money(lane.baseCents), target: money(lane.targetCents), tracked: null, wager: null,
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES, label: "Tracked challenge · no real wager placed",
    rungs: Array.from({ length: lane.steps }, (_, i) => ({ step: i + 1, state: "upcoming" })),
    today: null, history: [], graphics: [], earlierRuns: [],
  };
}
