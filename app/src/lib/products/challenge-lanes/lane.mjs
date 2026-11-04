/**
 * BANK BUILDER & MOONSHOT SOCIAL CHALLENGES V2 (founder directive, 2026-11-04; contract ~/gtp-evidence/bbm-v2/SPEC.md).
 * The website shows the SAME four lanes as the X graphics, read from the engine's public lane projection
 * (app/public/data/challenge-lanes/<laneId>.json): an append-only, hash-chained event log per run, with every price and
 * price-derived field stripped until founder decision P1. Pure: verification and the view model, no file access.
 *
 * WORKING SCHEMA (bb-redesign's proposal to betting-engine, 2026-11-04; replace with the engine's when it lands):
 *   { schema: "gtp.challenge-lane@1", laneId, product, runs: [{ header: {laneId, runId, product, base, target, steps,
 *     startedAt, approvedBy}, events: [{ type, date, step, at, source, prevSha256, sha256, ...payload }] }], contentSha256 }
 *   header sha = sha256(JSON of header); event.sha256 = sha256(JSON of the event without sha256); the first event's
 *   prevSha256 is the header sha, each later one the previous event's sha256; contentSha256 = sha256(JSON of the file
 *   without contentSha256), the same digest as sealSuggestedCards.
 */
import { createHash } from "node:crypto";

export const CHALLENGE_LANE_SCHEMA = "gtp.challenge-lane@1";

/** SPEC §1. Base and target are the lane's fixed configuration, not prices. */
export const LANES = Object.freeze({
  "bb-a": { laneId: "bb-a", product: "bank-builder", letter: "A", base: 100, target: 10000, steps: 3 },
  "bb-b": { laneId: "bb-b", product: "bank-builder", letter: "B", base: 100, target: 10000, steps: 3 },
  "ms-a": { laneId: "ms-a", product: "moonshot", letter: "A", base: 25, target: 1000, steps: 5 },
  "ms-b": { laneId: "ms-b", product: "moonshot", letter: "B", base: 25, target: 1000, steps: 5 },
});
export const lanesOf = (product) => Object.values(LANES).filter((l) => l.product === product).map((l) => l.laneId);

/** No prices or payouts on the site until founder decision P1. A switch, not a branch: the view never prints one. */
export const PRICES_ON_SITE = false;
export const AWAITING_PRICES = "Awaiting verified prices";

/* Event types the PUBLIC projection may carry. PRICE_VERIFIED and PAYOUT_COMPUTED are private-only (SPEC §2). */
export const PUBLIC_EVENT_TYPES = Object.freeze([
  "CARD_FROZEN", "STAKE_SET", "GRAPHIC_RENDERED", "APPROVED", "POSTED", "LEG_SETTLED", "STEP_SETTLED", "STATUS", "WAGER_DOCUMENTED",
]);
/* Any of these keys anywhere in a public file means a price leaked: the file is refused, not filtered. */
export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "price", "prices", "odds", "oddsFormat", "decimalPrice", "americanPrice", "parlayPrice", "book", "bookmaker", "provider",
  "line", "grossPayout", "payout", "potentialPayout", "profit", "potentialProfit", "priceSnapshotSha", "bankrollAfter",
]);

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const withoutKey = (o, k) => { const { [k]: _x, ...rest } = o; return rest; };

/** Seal a lane document: chain every run's events and stamp the content digest. Used by tests and the fixture builder. */
export function sealChallengeLane(doc) {
  const runs = (doc.runs ?? []).map((run) => {
    let prev = sha(run.header);
    const events = (run.events ?? []).map((e) => {
      const body = { ...withoutKey(withoutKey(e, "sha256"), "prevSha256"), prevSha256: prev };
      const sealed = { ...body, sha256: sha(body) };
      prev = sealed.sha256;
      return sealed;
    });
    return { header: run.header, events };
  });
  const body = { ...withoutKey(doc, "contentSha256"), runs };
  return { ...body, contentSha256: sha(body) };
}

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

/**
 * Verify a public lane file. Returns { ok: true } or { ok: false, reason }. Refuses: wrong schema or lane, an unknown
 * lane, a fixture (unless allowFixture), a bad content digest, a broken hash chain, a private-only event type, or any
 * price or price-derived key anywhere in the file.
 */
export function verifyChallengeLane(doc, { laneId, allowFixture = false } = {}) {
  if (!doc || typeof doc !== "object") return { ok: false, reason: "not a lane file" };
  if (doc.schema !== CHALLENGE_LANE_SCHEMA) return { ok: false, reason: `schema is not ${CHALLENGE_LANE_SCHEMA}` };
  const lane = LANES[doc.laneId];
  if (!lane) return { ok: false, reason: `unknown lane ${doc.laneId}` };
  if (laneId && doc.laneId !== laneId) return { ok: false, reason: `file is lane ${doc.laneId}, not ${laneId}` };
  if (doc.product !== lane.product) return { ok: false, reason: "product does not match the lane" };
  if (doc.fixture && !allowFixture) return { ok: false, reason: "fixture file" };
  if (typeof doc.contentSha256 !== "string" || sha(withoutKey(doc, "contentSha256")) !== doc.contentSha256) return { ok: false, reason: "content digest does not verify" };
  const leak = findForbiddenKey(doc);
  if (leak) return { ok: false, reason: `price field in a public file (${leak})` };
  if (!Array.isArray(doc.runs) || !doc.runs.length) return { ok: false, reason: "no runs" };
  for (const run of doc.runs) {
    const h = run?.header;
    if (!h || h.laneId !== doc.laneId || h.product !== lane.product) return { ok: false, reason: "run header does not match the lane" };
    if (h.base !== lane.base || h.target !== lane.target || h.steps !== lane.steps) return { ok: false, reason: `run ${h.runId} header base/target/steps differ from the lane` };
    let prev = sha(h);
    for (const e of run.events ?? []) {
      if (!PUBLIC_EVENT_TYPES.includes(e?.type)) return { ok: false, reason: `event type ${e?.type} is not allowed in a public file` };
      if (e.prevSha256 !== prev) return { ok: false, reason: `hash chain broken in ${h.runId}` };
      if (sha(withoutKey(e, "sha256")) !== e.sha256) return { ok: false, reason: `event digest does not verify in ${h.runId}` };
      prev = e.sha256;
    }
  }
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

const money = (n) => (typeof n === "number" && Number.isFinite(n) ? `$${n.toLocaleString("en-US")}` : null);
const pct = (p) => (typeof p === "number" ? `${Math.round(p * 100)}%` : null);

function legOf(l, settled) {
  const outcome = settled.get(l.gameId) ?? null;
  return {
    gameId: l.gameId,
    game: l.gameLabel ?? l.gameId,
    selection: l.selection?.label ?? l.selection?.teamAbbr ?? "",
    teamAbbr: l.selection?.teamAbbr ?? null,
    market: l.market ?? null,
    projectionLabel: l.projection?.label ?? "MODEL WIN PROBABILITY",
    projection: l.projection?.shown ?? pct(l.projection?.value),
    flags: l.flagText ?? [],
    snapshotId: l.snapshotId ?? null,
    outcome,
    settlementSource: outcome ? l.settlementSource ?? null : null,
  };
}

/** The view of one lane's CURRENT run (with every earlier run summarised), from a verified document. */
export function laneView(doc) {
  const lane = LANES[doc.laneId];
  const runs = doc.runs;
  const run = runs[runs.length - 1];
  const { header } = run;
  let step = 1; let busted = null; let complete = false; let bankroll = header.base; let bankrollKnown = true;
  let open = null; const steps = []; const graphics = []; let lastStatus = null; let stake = null; let wagerDocumented = false;
  for (const e of run.events) {
    if (e.type === "CARD_FROZEN") {
      open = { date: e.date, step: e.step, legs: (e.legs ?? []).map((l) => ({ ...l })), settled: new Map(), suggestedCardsSha: e.suggestedCardsSha ?? null };
      lastStatus = null;
    } else if (e.type === "STAKE_SET") {
      stake = typeof e.stake === "number" ? e.stake : null;
    } else if (e.type === "WAGER_DOCUMENTED") {
      wagerDocumented = true;
    } else if (e.type === "LEG_SETTLED" && open) {
      open.settled.set(e.gameId, e.outcome);
      const leg = open.legs.find((l) => l.gameId === e.gameId); if (leg) leg.settlementSource = e.source ?? null;
    } else if (e.type === "STEP_SETTLED" && open) {
      const card = { date: open.date, step: open.step, outcome: e.outcome, legs: open.legs.map((l) => legOf(l, open.settled)) };
      steps.push(card);
      if (e.outcome === "WIN") { step = open.step + 1; bankrollKnown = false; } else if (e.outcome === "LOSS") {
        busted = { step: open.step, date: e.date };
        /* A loss costs the tracked stake (no price involved); with no public stake the bankroll is not guessed. */
        if (bankrollKnown && stake != null) bankroll = Math.max(0, bankroll - stake); else bankrollKnown = false;
      }
      open = null; stake = null;
    } else if (e.type === "STATUS") {
      lastStatus = { status: e.status, reason: e.reason ?? null, date: e.date };
      if (e.status === "COMPLETE") complete = true;
      if (e.status === "BUSTED" && !busted) busted = { step: e.step, date: e.date };
    } else if (e.type === "GRAPHIC_RENDERED") {
      graphics.push({ date: e.date, step: e.step, packageId: e.packageId ?? null, imageSha: e.imageSha ?? null, imagePath: e.imagePath ?? null, alt: e.alt ?? null, postUrl: null, postedAt: null });
    } else if (e.type === "POSTED") {
      const g = [...graphics].reverse().find((x) => x.packageId === e.packageId || x.date === e.date);
      if (g) { g.postUrl = typeof e.url === "string" && /^https:\/\/(x|twitter)\.com\//.test(e.url) ? e.url : null; g.postedAt = e.at ?? null; }
    }
  }
  let status; let note = null;
  if (busted) { status = "busted"; note = `Busted at step ${busted.step} of ${header.steps}${lastStatus?.status === "AWAITING_RESTART_APPROVAL" ? ". A new run starts only after a founder-approved restart" : ""}.`; }
  else if (complete) status = "complete";
  else if (open) { status = "in-play"; note = `Step ${open.step} of ${header.steps} is in play. No new card until it settles.`; }
  else if (lastStatus?.status === "NO_ELIGIBLE_CARD") { status = "no-card"; note = `No qualifying card today, still step ${step} of ${header.steps}.`; }
  else if (lastStatus?.status === "PAUSED" || lastStatus?.status === "UNPRICED") { status = "paused"; note = lastStatus.status === "UNPRICED" ? `Paused: ${AWAITING_PRICES.toLowerCase()}.` : `Paused${lastStatus.reason ? `: ${lastStatus.reason}` : ""}.`; }
  else { status = "paused"; note = "No card has been frozen for this run yet."; }
  const rungs = Array.from({ length: header.steps }, (_, i) => {
    const k = i + 1;
    const state = busted && k === busted.step ? "failed" : k < step || (complete && k <= header.steps) ? "completed" : !busted && !complete && k === step ? "active" : "upcoming";
    return { step: k, state };
  });
  return {
    laneId: doc.laneId, product: lane.product, letter: lane.letter, name: `Lane ${lane.letter}`,
    runId: header.runId, runNumber: runs.length, startedAt: header.startedAt ?? null,
    step: busted ? busted.step : Math.min(step, header.steps), steps: header.steps,
    status, statusLabel: LANE_STATUS[status].label, statusGlyph: LANE_STATUS[status].glyph, note,
    base: money(header.base), target: money(header.target),
    tracked: bankrollKnown ? money(bankroll) : AWAITING_PRICES,
    wager: stake != null ? money(stake) : open ? AWAITING_PRICES : null,
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES,
    amountsAre: wagerDocumented ? "documented" : "tracked",
    rungs,
    card: open ? { date: open.date, step: open.step, legs: open.legs.map((l) => legOf(l, open.settled)), suggestedCardsSha: open.suggestedCardsSha } : null,
    settledSteps: steps,
    graphics,
    earlierRuns: runs.slice(0, -1).map((r) => ({ runId: r.header.runId, startedAt: r.header.startedAt ?? null, events: r.events.length })),
  };
}

/** The placeholder view for a lane whose public file is absent or refused: says so, invents nothing. */
export function unavailableLaneView(laneId, reason) {
  const lane = LANES[laneId];
  return {
    laneId, product: lane.product, letter: lane.letter, name: `Lane ${lane.letter}`, runId: null, runNumber: 0, startedAt: null,
    step: null, steps: lane.steps, status: "unavailable", statusLabel: LANE_STATUS.unavailable.label, statusGlyph: LANE_STATUS.unavailable.glyph,
    note: reason, base: money(lane.base), target: money(lane.target), tracked: null, wager: null,
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES, amountsAre: "tracked",
    rungs: Array.from({ length: lane.steps }, (_, i) => ({ step: i + 1, state: "upcoming" })),
    card: null, settledSteps: [], graphics: [], earlierRuns: [],
  };
}
