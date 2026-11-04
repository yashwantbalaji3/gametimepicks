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
import { decimalToAmerican } from "../../challenge-lanes/payout.mjs";
import { EVIDENCE_LABEL, diversityViolations as engineDiversity } from "../../challenge-lanes/card-fields.mjs";

export const LANE_IDS = Object.freeze(Object.keys(ENGINE_LANES));
export const lanesOf = (product) => LANE_IDS.filter((id) => ENGINE_LANES[id].product === product);

/**
 * PRICES ON THE SITE (founder 2026-11-04, SPEC §0/§7: the existing The Odds API subscription). They render ONLY from the
 * engine's priced fold (display.mjs pricedLaneDisplay over the encrypted display artifact, decrypted server-side by
 * price-display.mjs readLanePrices); the public JSON stays price-free and acceptLaneProjection still refuses a price in
 * it. With no VERIFIED price for a day, every money cell reads "Awaiting verified prices".
 */
export const PRICES_ON_SITE = true;
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
  /* Rules v2 (proposed): a run superseded under new rules. */
  RETIRED: { glyph: "⊘", tone: "held" },
});
/** "bbm-rules@1" → "RULES V1": the engine's rule version, shown, never interpreted. */
export const ruleLabel = (v) => (typeof v === "string" && /@(\d+)$/.test(v) ? `RULES V${v.match(/@(\d+)$/)[1]}` : v ?? null);
const UNAVAILABLE = { label: "RECORD NOT PUBLISHED", glyph: "○", tone: "held" };
/** PD 2026-11-04 (rules v2): an open lane with nothing recorded for the product day yet. Never priced. */
export const AWAITING_SELECTION = "AWAITING QUALIFIED SELECTION";
const AWAITING = { label: AWAITING_SELECTION, glyph: "◌", tone: "held" };
/** Day-level wording for the engine's internal day codes (presentation only). */
const DAY_TEXT = Object.freeze({
  IN_PLAY: "Active", PENDING_VOID_REVIEW: "Held · void under review", BUSTED: "Lost", AWAITING_RESTART_APPROVAL: "Lost · restart awaiting approval",
  COMPLETE: "Completed", FINISHED_SHORT: "Finished short", NO_ELIGIBLE_CARD: "Held · no qualifying card",
  UNPRICED: "Held · not staked, awaiting verified prices", PAUSED: "Held", READY: "Card frozen · awaiting verified prices",
});

/* Whole dollars print bare ($100); anything with cents prints both digits ($189.90, never $189.9). */
const money = (cents) => (typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toLocaleString("en-US", cents % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}` : null);
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

const american = (n) => (typeof n === "number" && Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : null);
const ET_STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const etStamp = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET_STAMP.format(t)} ET` : null; };

/**
 * PRICE VERIFICATION STATE (founder P0, 2026-11-04): the engine prices a frozen lane from the early snapshot first
 * (PRELIMINARY) and re-verifies near the posting window. The site shows the engine's own state field; it never infers
 * one. VERIFIED (or no field) shows no extra label.
 */
export const VERIFICATION_LABEL = Object.freeze({ PRELIMINARY: "PRELIMINARY", AWAITING_VERIFICATION: "AWAITING VERIFICATION" });
const verificationOf = (p) => (p?.verification === "PRELIMINARY" ? VERIFICATION_LABEL.PRELIMINARY : null);

/** The engine's day price (pricedLaneDisplay `day.price`): a computed payout, PRELIMINARY or VERIFIED; never REFUSED. */
const verified = (price) => (PRICES_ON_SITE && ["VERIFIED", "PRELIMINARY"].includes(price?.result) && price?.verification !== "REFUSED" ? price : null);
/** A frozen leg price as the engine carries it (`price` in its `oddsFormat`): odds, line, book, capture time. */
/* Hit-rate windows (founder 2026-11-04): k of n, never a percent, never a probability. */
const windowText = (w) => (w ? String(w).replace(/^last(\d+)$/, "last $1") : "");
export const hitRateText = (h) => (h && Number.isInteger(h.k) && Number.isInteger(h.n) && h.n > 0 ? `${h.k} of ${h.n}${h.window ? ` (${windowText(h.window)})` : ""}` : null);
/* `detail` is the engine's encrypted leg detail (price.legDetails[]: line, line-dependent hit rates) for a card@2 leg. */
const legPrice = (p, book, detail = null) => (p ? {
  odds: american(p.oddsFormat === "american" ? p.price : decimalToAmerican(p.price)), line: p.line ?? detail?.line ?? null, book: book ?? null, captured: etStamp(p.fetchedAt),
  hitRates: (Array.isArray(detail?.hitRates) ? detail.hitRates : Array.isArray(p.hitRates) ? p.hitRates : []).map(hitRateText).filter(Boolean),
  /* The engine's evidenceLine (the graphic's and caption's text, hit counts only): encrypted display only. The engine's
     flag text is NOT shown: it carries contextual rates, which would read as a probability. */
  evidenceLine: typeof detail?.evidenceLine === "string" && !/%|\b0?\.\d/.test(detail.evidenceLine) ? detail.evidenceLine : null,
  lineup: lineupText(detail?.lineup),
} : null);
/** The engine's evidence class for a day or a leg (card@2 legs carry `classification`), with the engine's own label. */
export const evidenceOf = (x) => {
  const c = x?.evidenceClass ?? (x?.classification && x.classification !== "HOLD" ? x.classification : null);
  return c ? { class: c, label: x.evidenceLabel ?? EVIDENCE_LABEL[c] ?? c } : null;
};
export const PROP_MARKET = Object.freeze({ pts: "PTS", reb: "REB", ast: "AST", player_points: "PTS", player_rebounds: "REB", player_assists: "AST" });
/** A player-prop leg: card@2 `family` pts/reb/ast (or its `market` player_*); winner / h2h legs are not props. */
/* DAILY RESEARCH SELECTION (founder ~19:40Z): the engine's disclosed limitations per leg, as codes in the public card
   (card.flags [{legId, code, level}]); the site prints plain words, never the contextual rate behind them. Field names
   PROPOSED to betting-engine 2026-11-04. */
export const FLAG_TEXT = Object.freeze({
  B_ROLE_UNSTABLE: "Role unstable", B_MINUTES_VOLATILE: "Minutes volatile", C_LINEUP_UNCERTAIN: "Lineup uncertain",
  C_LINEUP_MEDIUM: "Lineup uncertainty: MEDIUM", C_LINEUP_HIGH: "Lineup uncertainty: HIGH",
  B_MINUTES_DROP: "Minutes dropping", B_MINUTES_UNCERTAIN: "Minutes uncertain",
  ML_SMALL_SAMPLE: "Small sample", ML_ROSTER_TURNOVER: "Roster turnover", ML_KEY_OUT: "Key player out", ML_KEY_DTD: "Key player day-to-day",
  ML_TOP5_OUT: "A top-5 minutes player out", ML_KEY_UNCERTAIN: "Key player status uncertain", ML_BACK_TO_BACK: "Back-to-back",
  E_SNAPSHOT_OVERRIDE: "Odds captured under a dated founder exception (older than 90 min)",
});
/* Only codes the site knows are shown (betting-engine: treat unknown codes as absent); *_WEIGHT ranking markers never are. */
export const flagWords = (f) => FLAG_TEXT[f?.code] ?? null;
/** The engine's lineup context (encrypted legDetails.lineup) in words and counts: tonight's expected lineup, how often
    the side hit in exactly that lineup (k of n), who is uncertain. Never the contextual rate. */
export const lineupText = (lu) => {
  if (!lu || typeof lu !== "object") return null;
  const k = lu.exact?.hits, n = lu.exact?.games;
  const parts = [lu.expectedLineup ? `Tonight: ${lu.expectedLineup}` : null, Number.isInteger(k) && Number.isInteger(n) && n > 0 ? `${k} of ${n} in that lineup` : null,
    Array.isArray(lu.uncertainTeammates) && lu.uncertainTeammates.length ? `uncertain: ${lu.uncertainTeammates.map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean).join(", ")}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};
/** The card's selection mode label, verbatim ("RESEARCH SELECTION — NO VALIDATED EDGE CLAIM"), or null. */
export const selectionOf = (card) => (card?.selectionLabel ? { mode: card.selectionMode ?? null, label: card.selectionLabel } : null);
export const isProp = (l) => !["winner", "h2h"].includes(l?.family ?? l?.market ?? "winner");

/**
 * The odds heading by card shape (founder 2026-11-04): one leg → "SELECTION ODDS"; two or more → "COMBINED ODDS" with
 * its basis — the engine's combinedLabel verbatim, else from its method (BOOK_QUOTED_PARLAY: a book-quoted parlay; otherwise the
 * calculated leg product). A same-game estimate keeps the engine's own estimate label.
 */
export const oddsLabel = (p, legCount) => {
  if (p?.estimate) return p.label ?? "Combined price · estimate (same-game legs, not a book's offer)";
  if (legCount === 1) return "SELECTION ODDS";
  return `COMBINED ODDS (${p?.combinedLabel ?? (p?.method === "BOOK_QUOTED_PARLAY" ? "book-quoted parlay" : "calculated leg product")})`;
};

/** The day's priced block (combined price, stake, payout, profit, pace), formatted; null without a VERIFIED price. */
function priceOf(day) {
  const p = verified(day.price);
  if (!p) return null;
  return {
    method: p.method, estimate: p.estimate === true,
    combinedLabel: oddsLabel(p, day.card?.legs?.length ?? 0),
    band: p.band && typeof p.band.loCents === "number" ? `${money(p.band.loCents)}–${money(p.band.hiCents)}` : null,
    combined: [american(decimalToAmerican(p.decimalPrice)), typeof p.decimalPrice === "number" ? `${p.decimalPrice.toFixed(2)}×` : null].filter(Boolean).join(" · "),
    decimal: p.decimalPrice, book: p.book ?? null,
    stake: money(p.stakeCents), payout: money(p.grossPayoutCents), profit: money(p.profitCents),
    requiredMultiple: typeof p.pace === "number" ? p.pace : null, belowPace: p.belowPace ?? null,
    captured: etStamp([...(p.legs ?? [])].map((l) => l.fetchedAt).filter(Boolean).sort().at(-1)),
    verification: verificationOf(p), verificationNote: p.verification === "PRELIMINARY" ? p.verificationLabel ?? null : null,
    snapshotSha256: p.priceSnapshotSha256 ?? null, priceEventSha256: p.priceEventSha256 ?? null,
  };
}

function legsOf(day, projectionLabel, teams) {
  const outcome = new Map((day.legResults ?? []).map((r) => [r.legId, r.outcome]));
  const vp = verified(day.price);
  const prices = new Map((vp?.legs ?? []).map((p) => [p.legId, p]));
  const details = new Map((vp?.legDetails ?? []).map((p) => [p.legId, p]));
  const cardFlags = Array.isArray(day.card?.flags) ? day.card.flags : [];
  return (day.card?.legs ?? []).map((l, i) => {
    const o = outcome.get(l.legId);
    /* card@1 legs name the side in `selection`; card@2 winner legs carry `team` and `side` (home/away). */
    const abbr = l.selection?.teamAbbr ?? l.team ?? null;
    const code = l.selection?.code ?? l.side ?? null;
    const [away, home] = String(l.eventLabel ?? "").split(" @ ");
    const opponent = code === "home" ? away : code === "away" ? home : null;
    const prop = isProp(l);
    /* A player-prop leg (pts/reb/ast): the player and side are public; the line and hit rates come only from the
       engine's encrypted price display (a book line never sits in plain public JSON). */
    const player = prop && l.player ? { name: l.player.name ?? null, team: l.player.team ?? l.team ?? null, side: l.side ? String(l.side).toUpperCase() : null, market: PROP_MARKET[l.family] ?? PROP_MARKET[l.market] ?? l.market } : null;
    return {
      n: i + 1, legId: l.legId, gameId: l.gameId, game: l.eventLabel ?? l.gameId, market: l.market ?? null, prop,
      selection: player ? `${player.name ?? ""}` : l.selection?.label ?? abbr ?? "", teamAbbr: player ? player.team : abbr, team: teamOf(teams, player ? player.team : abbr), player,
      matchup: opponent ? `${code === "home" ? "vs" : "@"} ${opponent}` : l.eventLabel ?? null,
      time: etTime(l.startUtc),
      /* betting-engine 2026-11-04: a card@2 winner leg carries no probability unless it is a validated LEVEL A one; with
         none, no MODEL WIN PROBABILITY row at all (a "—" under that label would suggest a model number exists). */
      projectionLabel: prop ? l.projection?.label ?? projectionLabel : l.probabilityShown != null ? "MODEL WIN PROBABILITY" : null, projection: prop ? (typeof l.projection?.value === "number" ? l.projection.value.toFixed(1) : null) : l.probabilityShown ?? null,
      evidence: evidenceOf(l),
      limits: [...new Set(cardFlags.filter((f) => f?.legId === l.legId).map(flagWords).filter(Boolean))],
      flags: l.guard?.flagText ?? [],
      outcome: o && o !== "PENDING" ? o : null,
      price: legPrice(prices.get(l.legId), vp?.book, details.get(l.legId)),
      snapshotId: l.projection?.snapshotId ?? null,
      /* The selection's identity fields for the engine's diversity check (no line, book, odds or snapshot). */
      selectionLeg: { legId: l.legId, sport: l.sport ?? "nba", gameId: l.gameId, family: l.family ?? null, market: l.market ?? null, player: l.player?.playerId ? { playerId: l.player.playerId } : null, side: l.side ?? l.selection?.code ?? null },
    };
  });
}

function dayPresent(day, projectionLabel, teams) {
  /* The engine leaves a staked, unsettled day's own status empty: that day is the active step. */
  const status = day.status ?? (day.staked && !day.stepOutcome ? "IN_PLAY" : null);
  let result = null;
  /* Rules v2 (proposed): a v1 card withdrawn by the migration stays in the record, never staked, never re-read. */
  if (day.withdrawn) result = "Withdrawn when the rules changed: never staked; its legs are kept as record only.";
  if (result) { /* withdrawn: nothing else applies */ }
  else if (day.stepOutcome === "WIN") result = `Step ${day.step} won.`;
  else if (day.stepOutcome === "LOSS") result = `Step ${day.step} lost.`;
  else if (day.stepOutcome) result = `Step ${day.step}: ${day.stepOutcome}.`;
  else if (day.card && !day.staked && day.modelCardResult && day.modelCardResult !== "PENDING") result = `The model card ${day.modelCardResult === "WIN" ? "won" : "lost"}, but it was not staked, so the lane did not move.`;
  return {
    date: day.date, step: day.step, internalStatus: status,
    statusText: day.withdrawn ? "Withdrawn · record only" : day.stepOutcome === "WIN" ? "Won" : day.stepOutcome === "LOSS" ? "Lost" : day.heldCode === "NO_QUALIFIED_CARD" ? "Held · no qualified card" : DAY_TEXT[status] ?? status ?? (day.card ? "Card frozen" : ""),
    tone: day.stepOutcome === "WIN" ? "won" : day.stepOutcome === "LOSS" ? "lost" : status === "IN_PLAY" ? "active" : "held",
    reason: reasonText(day.reason), staked: Boolean(day.staked), legs: day.card ? legsOf(day, projectionLabel, teams) : [], hasCard: Boolean(day.card),
    modelCardResult: day.modelCardResult ?? null, stepOutcome: day.stepOutcome ?? null, result,
    price: priceOf(day),
    ruleVersion: day.ruleVersion ?? null,
    withdrawn: Boolean(day.withdrawn), legCount: day.legCount ?? null, maxLegs: day.maxLegs ?? null, evidence: evidenceOf(day), selection: selectionOf(day.card),
    stepTarget: typeof day.targetPayoutCents === "number" ? { label: day.targetPayoutLabel ?? "STEP TARGET", value: money(day.targetPayoutCents) } : null,
  };
}

/**
 * The site's presentation of one lane, from the engine's laneDisplay (which throws on a file that does not verify). Pure;
 * never mutates the document. Options: `teams` (NBA team colour data, for team marks), `imageVerified(path, sha)` (the
 * loader's byte check; with none, no image is shown).
 * @param {any} doc
 * `display` is the engine's PRICED fold of the same file when the caller has one (it must name this file's digest); by
 * default the price-free laneDisplay(doc).
 * `productDay` (YYYY-MM-DD, the build's ET day): a lane with no engine record for that day — no frozen card and no engine
 * decision yet — reads AWAITING QUALIFIED SELECTION with no prices, instead of carrying an older day forward.
 * @param {{ teams?: { teams: any, aliases: any, inkFor?: (fill: string) => string } | null, imageVerified?: (path: string, sha: string) => boolean, display?: any, productDay?: string | null }} [opts]
 */
export function laneView(doc, { teams = null, imageVerified = () => false, display = null, productDay = null } = {}) {
  const d = display ?? laneDisplay(doc);
  if (d.sourceSha256 !== doc.contentSha256) throw new Error("laneView: the display was not folded from this lane file");
  const lane = ENGINE_LANES[d.laneId];
  const projectionLabel = d.projectionLabel ?? "MODEL PROJECTION";
  /* RULE VERSIONS (PD 2026-11-04): the engine moved to rules v2 (two legs a step, new milestones). Days and runs the
     record marks with another rule version stay in the history, labelled with that version — never re-read as today's. */
  const currentRule = d.ruleVersion ?? d.runs?.at(-1)?.ruleVersion ?? null;
  const ruleTag = (v) => (v && v !== currentRule ? ruleLabel(v) : null);
  /* Every history day names its own rule version (PD 2026-11-04), so an old card never reads as today's; ruleTag stays
     the "differs from the current rules" marker. */
  const story = [...d.history].reverse().map((x) => ({ ...dayPresent(x, projectionLabel, teams), ruleTag: ruleTag(x.ruleVersion), ruleLabel: ruleLabel(x.ruleVersion ?? "bbm-rules@1") }));
  const latest = d.day ? dayPresent(d.day, projectionLabel, teams) : null;
  /* AWAITING QUALIFIED SELECTION (PD 2026-11-04, rules v2): the lane is open but the engine has recorded nothing for the
     product day yet. An engine decision for the day (a frozen card, or HELD with its reason) always wins over this. */
  const settledState = ["LOST", "COMPLETED", "FINISHED SHORT"].includes(d.status);
  const awaiting = !settledState && Boolean(productDay) && (!d.day || d.day.date < productDay);
  const current = !awaiting && latest?.hasCard && !latest.stepOutcome && d.status !== "LOST" ? latest : null;
  /* Leg cap (rules v2): a card with more legs than its own day's cap is refused, never shown as a qualified card. */
  if (current && typeof current.maxLegs === "number" && current.legs.length > current.maxLegs) throw new Error(`laneView: ${d.laneId} ${current.date} shows ${current.legs.length} legs over its cap of ${current.maxLegs}`);
  /* LANE SPECIALIZATION (founder 2026-11-04, proposed): the lane's type from the engine record (the current run's, else
     the file's), printed verbatim; a card whose legs do not fit the type is refused, never shown as the lane's card.
     Field names PROPOSED to betting-engine. */
  const lt = d.runs?.at(-1)?.laneType ?? d.laneType ?? null;
  const laneType = lt ? { type: lt, label: d.runs?.at(-1)?.laneTypeLabel ?? d.laneTypeLabel ?? lt.replaceAll("_", " ") } : null;
  const fits = (l) => (lt === "NBA_MONEYLINE" ? !l.prop : lt === "NBA_PLAYER_PROPS" ? l.prop : true);
  if (current && !current.legs.every(fits)) throw new Error(`laneView: ${d.laneId} ${current.date} has legs outside its lane type ${lt}`);
  const glyph = awaiting ? AWAITING : LANE_STATUS[d.status] ?? LANE_STATUS.HELD;
  /* The engine keeps a run's last reason after it moves on (a HELD day's reason stays on the run once a card is in
     play), so a reason is shown only for the states it explains. */
  const REASONED = new Set(["HELD", "LOST", "RETIRED", "FINISHED SHORT", "COMPLETED"]);
  let note = awaiting ? `No qualified selection has been frozen for ${productDay} yet. Nothing is priced until one is.` : REASONED.has(d.status) ? reasonText(d.reason) : null;
  if (!note && d.status === "ACTIVE") note = `Step ${d.step} of ${d.steps} is active. No new card until it settles.`;
  /* LOST (PD 2026-11-04): busted at the step it lost, waiting on a founder-approved restart; never an active step. */
  const lost = d.status === "LOST";
  if (lost) note = [note, "Awaiting restart approval."].filter(Boolean).join(" ");
  if (!note && d.status === "WON") note = `Step ${d.step - 1} won. Step ${d.step} gets the next qualifying card.`;
  const p = d.pace;
  const pp = current?.price;
  /* Pace means nothing once a lane is lost: it is not shown. A priced card states its multiple against the pace. */
  /* PACE (founder 2026-11-04): the engine's pace flag verbatim — "BELOW PACE" when it is set, and never an "on pace"
     claim anywhere on the lane (the card's own multiple and the next milestone say the rest). */
  const milestone = p?.nextMilestoneCents ? ` · next milestone ${money(p.nextMilestoneCents)}` : "";
  const pace = !p || d.status === "LOST" ? null
    : pp?.requiredMultiple && pp.decimal ? { state: pp.belowPace ? "behind" : "on", text: `${pp.belowPace ? "BELOW PACE · " : ""}This card ${pp.decimal.toFixed(2)}× · pace needs ${pp.requiredMultiple.toFixed(2)}×${milestone}` }
    : p.state === "withheld" ? { state: "withheld", text: "Pace: awaiting verified prices" }
    : p.state === "behind" ? { state: "behind", text: `BELOW PACE by ${money(p.behindCents)}${milestone}` }
    : milestone ? { state: "on", text: milestone.slice(3).replace(/^n/, "N") } : null;
  const receipts = d.history.flatMap((x) => x.receipts ?? []);
  const graphics = receipts.filter((r) => r.type === "GRAPHIC_RENDERED").map((g) => {
    const same = (r) => (r.packageId ?? null) === (g.packageId ?? null) && r.date === g.date;
    const post = receipts.find((r) => r.type === "POSTED" && same(r));
    /* The engine's own image-path rule, re-applied, and the bytes on disk must be the bytes the engine recorded. */
    const pathOk = typeof g.imagePath === "string" && IMAGE_PATH.test(g.imagePath) && !g.imagePath.includes("..");
    return {
      date: g.date, step: g.step, packageId: g.packageId ?? null, imageSha256: g.imageSha256 ?? null,
      /* Cross-surface parity (PD 2026-11-04): the caption's hash and the renderer version the engine recorded, verbatim. */
      captionSha256: g.captionSha256 ?? null, graphicVersion: g.rendererCommit ?? null,
      approvedVersionSha256: receipts.find((r) => r.type === "APPROVED" && same(r))?.approvedVersionSha256 ?? null,
      imagePath: pathOk && g.imageSha256 && imageVerified(g.imagePath, g.imageSha256) ? g.imagePath : null,
      approved: receipts.some((r) => r.type === "APPROVED" && same(r)), postUrl: xUrl(post?.url), postedAt: post?.postedAt ?? null,
    };
  });
  /* A LOST lane shows the bankroll after the losing step: the engine's trackedBankrollCents is the post-settlement
     bankroll in every state since 566ab9cfd5 ($0 on BUSTED); with no verified price, "Busted" (no number is guessed). */
  const tracked = d.trackedBankrollCents == null ? (lost ? "Busted" : AWAITING_PRICES) : money(d.trackedBankrollCents);
  return {
    laneId: d.laneId, product: d.product, letter: d.slot, name: `Lane ${d.slot}`, laneType,
    runId: d.runId, runNumber: d.runNumber, startedAt: String(d.runs.at(-1)?.startedAt ?? "").slice(0, 10) || null,
    step: d.step, steps: d.steps, stepText: lost ? `LOST AT STEP ${d.step} OF ${d.steps}` : d.stepText, maxLegs: d.maxLegs ?? null, lost,
    trackedLabel: lost ? "Bankroll after the loss" : "Tracked bankroll · settled",
    cleared: d.cleared ?? d.rungs.filter((r) => r.state === "completed").length,
    status: awaiting ? "AWAITING" : d.status, statusLabel: awaiting ? AWAITING_SELECTION : d.status, statusGlyph: glyph.glyph, tone: glyph.tone, internalStatus: d.internalStatus, note,
    base: money(d.baseCents), target: money(d.targetCents), tracked,
    toTarget: d.distanceToTargetCents == null || d.status === "LOST" ? null : money(d.distanceToTargetCents),
    wager: d.status === "LOST" || awaiting ? null : current?.price?.stake ?? tracked, wagerNote: current?.price ? "tracked stake" : latest?.staked ? "staked" : "not staked until priced",
    potentialPayout: current?.price?.payout ?? AWAITING_PRICES, potentialProfit: current?.price?.profit ?? AWAITING_PRICES,
    pace, label: d.label ?? "Tracked challenge · no real wager placed",
    /* PRELIMINARY when the priced day is the early snapshot; AWAITING VERIFICATION from the plain file alone (no prices
       in this build); nothing once VERIFIED. Both come from the engine's fields, never inferred. */
    verification: awaiting ? null : current?.price?.verification ?? (d.day?.awaitingVerification && d.status !== "LOST" ? VERIFICATION_LABEL.AWAITING_VERIFICATION : null),
    verificationNote: current?.price?.verificationNote ?? null,
    rungs: d.rungs.map((r) => ({ step: r.step, state: r.state, milestone: money(r.milestoneCents) })),
    current, story, graphics,
    runs: d.runs.map((r, i) => ({ runId: r.runId, number: i + 1, started: String(r.startedAt ?? "").slice(0, 10) || null, status: r.endStatus, stepsWon: r.stepsWon ?? 0, current: i === d.runs.length - 1, ruleTag: ruleTag(r.ruleVersion) })),
    ruleVersion: currentRule, ruleLabel: ruleLabel(currentRule), evidence: current?.evidence ?? null, selection: current?.selection ?? null,
    stepTarget: awaiting || lost ? null : latest?.stepTarget ?? null,
    sourceSha256: d.sourceSha256,
  };
}

/** The placeholder view for a lane whose public file is absent or refused: says so, invents nothing. */
/**
 * DIVERSIFICATION (founder 2026-11-04, the engine's diversity@2): the engine's own checker (card-fields.mjs
 * diversityViolations, maxLegUse 1) over the cards the site is about to render — same date only, held lanes skipped.
 * Identity is the underlying selection (team moneyline; player + stat + side whatever the line, book or odds): no
 * selection in two lanes, no repeated combination, never both sides of one proposition. [] when the set passes.
 * @param {Array<{ laneId: string, current?: { date: string, legs: Array<{ legId: string, selectionLeg?: any }> } | null }>} views
 */
export const DIVERSITY_MAX_LEG_USE = 1;
/* Applies to cards frozen under bbm-rules@2 or later: a v1 card was frozen before the rule existed (its run is retired
   or withdrawn under v2) and is shown as history, never judged by a later rule. */
const underV2 = (v) => /@(\d+)$/.test(String(v?.current?.ruleVersion ?? "")) && Number(String(v.current.ruleVersion).match(/@(\d+)$/)[1]) >= 2;
export const diversityViolations = (views) => engineDiversity(views.filter((v) => v?.current?.legs?.length && underV2(v)).map((v) => ({ laneId: v.laneId, date: v.current.date, legs: v.current.legs.map((l) => l.selectionLeg ?? { legId: l.legId }) })), { maxLegUse: DIVERSITY_MAX_LEG_USE });

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
