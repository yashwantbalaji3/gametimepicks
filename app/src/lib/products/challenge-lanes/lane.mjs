/**
 * BANK BUILDER & MOONSHOT SOCIAL CHALLENGES V2 (SPEC rev 2 §3, §6). The website shows the SAME four lanes as the X
 * graphics: both read the file through the engine's ONE public reader (lib/challenge-lanes/public-reader.mjs) and fold it
 * through the engine's ONE display function (lib/challenge-lanes/display.mjs `laneDisplay`). Step, rungs, milestones,
 * status, bankroll, distance and pace all come from laneDisplay; this module only PRESENTS them (money strings, team
 * marks, sentences) and adds the site's own refusals. Pure: no file access.
 *
 * SITE REFUSALS on top of the engine's checks: not a fixture, and NOTHING PRICED in a public file — a price event must be
 * the engine's withheld stub, no price/odds/book/payout/profit key appears anywhere, and a withheld bankroll is null. A
 * file that fails any of these is refused whole, never filtered.
 */
import { verifyLaneProjection, IMAGE_PATH } from "../../challenge-lanes/projection.mjs";
import { LANES as ENGINE_LANES } from "../../challenge-lanes/lanes.mjs";
import { laneDisplay } from "../../challenge-lanes/display.mjs";

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

/** The public statuses (SPEC rev 2 §3; laneDisplay's `status`), each with a glyph so state is never colour alone. */
export const LANE_STATUS = Object.freeze({
  ACTIVE: { glyph: "●", tone: "active" },
  WON: { glyph: "✓", tone: "won" },
  LOST: { glyph: "✕", tone: "lost" },
  HELD: { glyph: "Ⅱ", tone: "held" },
  COMPLETED: { glyph: "★", tone: "won" },
  "FINISHED SHORT": { glyph: "◐", tone: "held" },
});
const UNAVAILABLE = { label: "RECORD NOT PUBLISHED", glyph: "○", tone: "held" };
/** Day-level wording for the engine's internal day codes (presentation only). */
const DAY_TEXT = Object.freeze({
  IN_PLAY: "Active", PENDING_VOID_REVIEW: "Held · void under review", BUSTED: "Lost", AWAITING_RESTART_APPROVAL: "Lost · restart awaiting approval",
  COMPLETE: "Completed", FINISHED_SHORT: "Finished short", NO_ELIGIBLE_CARD: "Held · no qualifying card",
  UNPRICED: "Held · not staked, awaiting verified prices", PAUSED: "Held", READY: "Card frozen · awaiting verified prices",
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

function dayPresent(day, projectionLabel, teams) {
  /* The engine leaves a staked, unsettled day's own status empty: that day is the active step. */
  const status = day.status ?? (day.staked && !day.stepOutcome ? "IN_PLAY" : null);
  let result = null;
  if (day.stepOutcome === "WIN") result = `Step ${day.step} won.`;
  else if (day.stepOutcome === "LOSS") result = `Step ${day.step} lost.`;
  else if (day.stepOutcome) result = `Step ${day.step}: ${day.stepOutcome}.`;
  else if (day.card && !day.staked && day.modelCardResult && day.modelCardResult !== "PENDING") result = `The model card ${day.modelCardResult === "WIN" ? "won" : "lost"}, but it was not staked, so the lane did not move.`;
  return {
    date: day.date, step: day.step, internalStatus: status,
    statusText: day.stepOutcome === "WIN" ? "Won" : day.stepOutcome === "LOSS" ? "Lost" : DAY_TEXT[status] ?? status ?? "",
    tone: day.stepOutcome === "WIN" ? "won" : day.stepOutcome === "LOSS" ? "lost" : status === "IN_PLAY" ? "active" : "held",
    reason: reasonText(day.reason), staked: Boolean(day.staked), legs: day.card ? legsOf(day, projectionLabel, teams) : [], hasCard: Boolean(day.card),
    modelCardResult: day.modelCardResult ?? null, stepOutcome: day.stepOutcome ?? null, result,
  };
}

/**
 * The site's presentation of one lane, from the engine's laneDisplay (which throws on a file that does not verify). Pure;
 * never mutates the document. Options: `teams` (NBA team colour data, for team marks), `imageVerified(path, sha)` (the
 * loader's byte check; with none, no image is shown).
 * @param {any} doc
 * @param {{ teams?: { teams: any, aliases: any, inkFor?: (fill: string) => string } | null, imageVerified?: (path: string, sha: string) => boolean }} [opts]
 */
export function laneView(doc, { teams = null, imageVerified = () => false } = {}) {
  const d = laneDisplay(doc);
  const lane = ENGINE_LANES[d.laneId];
  const projectionLabel = d.projectionLabel ?? "MODEL PROJECTION";
  const story = [...d.history].reverse().map((x) => dayPresent(x, projectionLabel, teams));
  const latest = d.day ? dayPresent(d.day, projectionLabel, teams) : null;
  const current = latest?.hasCard && !latest.stepOutcome && d.status !== "LOST" ? latest : null;
  const glyph = LANE_STATUS[d.status] ?? LANE_STATUS.HELD;
  let note = reasonText(d.reason);
  if (!note && d.status === "ACTIVE") note = `Step ${d.step} of ${d.steps} is active. No new card until it settles.`;
  if (!note && d.status === "WON") note = `Step ${d.step - 1} won. Step ${d.step} gets the next qualifying card.`;
  const p = d.pace;
  /* Pace means nothing once a lane is lost: it is not shown. */
  const pace = !p || d.status === "LOST" ? null
    : p.state === "withheld" ? { state: "withheld", text: "Pace: awaiting verified prices" }
    : p.state === "on" ? { state: "on", text: `On pace · milestone ${money(p.milestoneCents)}` }
    : { state: "behind", text: `Behind pace by ${money(p.behindCents)} · milestone ${money(p.milestoneCents)}` };
  const receipts = d.history.flatMap((x) => x.receipts ?? []);
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
  const tracked = d.trackedBankrollCents == null ? AWAITING_PRICES : money(d.trackedBankrollCents);
  return {
    laneId: d.laneId, product: d.product, letter: d.slot, name: `Lane ${d.slot}`,
    runId: d.runId, runNumber: d.runNumber, startedAt: String(d.runs.at(-1)?.startedAt ?? "").slice(0, 10) || null,
    step: d.step, steps: d.steps, stepText: d.stepText, maxLegs: d.maxLegs ?? null,
    cleared: d.rungs.filter((r) => r.state === "completed").length,
    status: d.status, statusLabel: d.status, statusGlyph: glyph.glyph, tone: glyph.tone, internalStatus: d.internalStatus, note,
    base: money(d.baseCents), target: money(d.targetCents), tracked,
    toTarget: d.distanceToTargetCents == null || d.status === "LOST" ? null : money(d.distanceToTargetCents),
    wager: d.status === "LOST" ? null : tracked, wagerNote: latest?.staked ? "staked" : "not staked until priced",
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES,
    pace, label: d.label ?? "Tracked challenge · no real wager placed",
    rungs: d.rungs.map((r) => ({ step: r.step, state: r.state, milestone: money(r.milestoneCents) })),
    current, story, graphics,
    runs: d.runs.map((r, i) => ({ runId: r.runId, number: i + 1, started: String(r.startedAt ?? "").slice(0, 10) || null, status: r.endStatus, stepsWon: r.stepsWon ?? 0, current: i === d.runs.length - 1 })),
    sourceSha256: d.sourceSha256,
  };
}

/** The placeholder view for a lane whose public file is absent or refused: says so, invents nothing. */
export function unavailableLaneView(laneId, reason) {
  const lane = ENGINE_LANES[laneId];
  return {
    laneId, product: lane.product, letter: lane.slot, name: `Lane ${lane.slot}`, runId: null, runNumber: 0, startedAt: null,
    step: null, steps: lane.steps, stepText: null, maxLegs: null, cleared: 0, status: "UNAVAILABLE", statusLabel: UNAVAILABLE.label, statusGlyph: UNAVAILABLE.glyph, tone: UNAVAILABLE.tone,
    internalStatus: null, note: reason, base: money(lane.baseCents), target: money(lane.targetCents), tracked: null, toTarget: null, wager: null, wagerNote: null,
    potentialPayout: AWAITING_PRICES, potentialProfit: AWAITING_PRICES, pace: null, label: "Tracked challenge · no real wager placed",
    rungs: Array.from({ length: lane.steps }, (_, i) => ({ step: i + 1, state: "upcoming", milestone: null })),
    current: null, story: [], graphics: [], runs: [], sourceSha256: null,
  };
}
