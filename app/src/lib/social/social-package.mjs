/**
 * SOCIAL CONTENT PACKAGES (`gtp-social-package@1`). PURE: no I/O, no clock, no network. One JSON per post, written by
 * scripts/social/render-social-pack.mjs under ~/gtp-private/graphics/packages/. A package is a proposal for founder
 * review: nothing here schedules or posts, and approval.status is always FOUNDER_REVIEW_REQUIRED.
 *
 * Owns three rules every content type shares:
 *   RECOMMENDED TIME  first game of the sport's next slate minus two hours (absolute time, so a DST change between the
 *                     recap and the slate cannot shift it), shown in America/New_York. A slate whose time has passed at
 *                     asOf is skipped, never proposed in the past.
 *   RECAPS            only verified finals grade. A game that is not final, has no frozen side, or tied is excluded and
 *                     counted, so the denominator is always visible. Winner records only: a prop record never enters.
 *   DEDUPE            sport|date|contentType|variant, stable across re-runs; a changed input changes contentSha256 only.
 */
import crypto from "node:crypto";

import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { formatValue } from "../sports/nfl/forecast-view.mjs";

export const SOCIAL_PACKAGE_SCHEMA = "gtp-social-package@1";
export const APPROVAL_STATUS = "FOUNDER_REVIEW_REQUIRED";
export const RECOMMEND_LEAD_MS = 2 * 60 * 60 * 1000;
export const CONTENT_TYPE = Object.freeze({
  NFL_SUNDAY_WINNERS: "NFL_SUNDAY_WINNERS",
  NFL_MNF_WINNER: "NFL_MNF_WINNER",
  NFL_WEEKLY_TOP5: "NFL_WEEKLY_TOP5",
  NBA_DAILY_TOP5: "NBA_DAILY_TOP5",
  RESULTS_RECAP: "RESULTS_RECAP",
});
const SPORTS = new Set(["nfl", "nba"]);
const ET = "America/New_York";
const OFF_STATUS = /POSTPONED|CANCELED|CANCELLED/;

/** Strict instant parse; accepts the repo's minute-precision `...T18:00Z`. NaN when unusable. */
export const instant = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
export const etDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
/** "Sun Nov 1, 1:00 PM EST": the zone abbreviation is the formatter's, so it follows DST. */
export const etLabel = (ms) => {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" }).format(d).replace(",", "");
  const time = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return `${day}, ${time}`;
};
export const toIso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

/**
 * The first game of the next slate after `afterEtDate`, minus two hours.
 * @param {{ games: Array<{ kickoffUtc: string, statusRaw?: string|null }>, afterEtDate: string, asOf: string }} o
 * @returns {{ recommendedAt: string, recommendedAtEt: string, firstGameUtc: string, firstGameEt: string, slateEtDate: string, games: number, skippedSlates: string[] } | null}
 *   null when the data holds no such slate: the caller reports that, it never guesses a time.
 */
export function recommendedPostTime({ games, afterEtDate, asOf }) {
  const now = instant(asOf);
  if (!Number.isFinite(now)) throw new Error("recommendedPostTime: asOf (ISO) is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(afterEtDate ?? ""))) throw new Error("recommendedPostTime: afterEtDate (YYYY-MM-DD) is required");
  const slates = new Map();
  for (const g of games ?? []) {
    const t = instant(g.kickoffUtc);
    if (!Number.isFinite(t) || OFF_STATUS.test(String(g.statusRaw ?? ""))) continue;
    const d = etDate(t);
    if (d <= afterEtDate) continue;
    if (!slates.has(d)) slates.set(d, []);
    slates.get(d).push(t);
  }
  const skippedSlates = [];
  for (const d of [...slates.keys()].sort()) {
    const first = Math.min(...slates.get(d));
    const at = first - RECOMMEND_LEAD_MS;
    if (at <= now) { skippedSlates.push(d); continue; }
    return { recommendedAt: toIso(at), recommendedAtEt: etLabel(at), firstGameUtc: toIso(first), firstGameEt: etLabel(first), slateEtDate: d, games: slates.get(d).length, skippedSlates };
  }
  return null;
}

const accuracyText = (correct, graded) => (graded ? `${((correct / graded) * 100).toFixed(1)}%` : null);
const tally = (rows) => {
  const correct = rows.filter((r) => r.outcome === "CORRECT").length;
  const missed = rows.filter((r) => r.outcome === "MISSED").length;
  return { graded: correct + missed, correct, missed, accuracy: accuracyText(correct, correct + missed) };
};

/**
 * NBA recap: the frozen lane sides of one slate against accepted finals (loadCurrentNbaResults). Null when the lane has
 * no game: no recap exists for a day without games.
 * @param {any} lane  the committed lane snapshot
 * @param {Array<any>} finals  loadCurrentNbaResults(...).results
 */
export function buildNbaRecap(lane, finals) {
  if (!lane?.games?.length) return null;
  const byId = new Map((finals ?? []).map((r) => [String(r.providerEventId), r]));
  const games = lane.games.map((g) => {
    const id = String(g.providerEventId);
    const base = { eventId: id, matchup: `${g.away.abbr} @ ${g.home.abbr}`, kickoffUtc: g.tipUtc, away: g.away.abbr, home: g.home.abbr };
    const fin = byId.get(id);
    const side = g.elo?.state === "FAVOURED" ? g.elo.favoured : null;
    const wp = eloWinProbabilityOf(g);
    if (!fin) return { ...base, outcome: "EXCLUDED", reason: "NOT_FINAL", frozenSide: side };
    if (fin.home !== g.home.abbr || fin.away !== g.away.abbr) throw new Error(`${id}: final is ${fin.away} @ ${fin.home}, the frozen lane says ${base.matchup}`);
    const final = { away: fin.ftAway, home: fin.ftHome };
    if (!side || !wp) return { ...base, final, outcome: "EXCLUDED", reason: side ? "NO_FROZEN_PROBABILITY" : "NO_FROZEN_SIDE", frozenSide: side };
    const won = final.home > final.away ? g.home.abbr : g.away.abbr;
    const probability = side === g.home.abbr ? wp.home : wp.away;
    return { ...base, final, frozenSide: side, probability, probabilityText: `${side === g.home.abbr ? wp.homePct : wp.awayPct}%`, wonBy: won, outcome: won === side ? "CORRECT" : "MISSED", frozenAt: g.frozenAt, receiptPayloadSha256: g.receipt?.payloadSha256 ?? null };
  });
  return { sport: "nba", date: lane.date, period: { kind: "SLATE", label: lane.date }, record: "WINNER_SIDE", gamesScheduled: games.length, excluded: games.filter((g) => g.outcome === "EXCLUDED"), ...tally(games), games };
}

/** NFL recap from one week's reconciliation document. Each grade is recomputed from the final and must agree with it. */
export function buildNflRecap(rec) {
  if (!rec?.games?.length) return null;
  const games = rec.games.map((g) => {
    const id = String(g.providerEventId);
    const base = { eventId: id, matchup: g.matchup, kickoffUtc: g.kickoffUtc, away: g.away.abbr, home: g.home.abbr };
    const pick = g.published?.pick ?? null;
    if (g.state !== "FINAL" || !g.final) return { ...base, outcome: "EXCLUDED", reason: "NOT_FINAL", frozenSide: pick?.abbr ?? null };
    const final = { away: g.final.away, home: g.final.home };
    if (!pick?.abbr || !(typeof pick.probability === "number")) return { ...base, final, outcome: "EXCLUDED", reason: "NO_FROZEN_SIDE", frozenSide: null };
    if (final.home === final.away) return { ...base, final, frozenSide: pick.abbr, outcome: "EXCLUDED", reason: "TIE_VOID" };
    const won = final.home > final.away ? g.home.abbr : g.away.abbr;
    const outcome = won === pick.abbr ? "CORRECT" : "MISSED";
    const stored = g.team?.find((t) => t.prop === "winner")?.outcome;
    if (stored !== (outcome === "CORRECT" ? "HIT" : "MISS")) throw new Error(`${id}: reconciliation says ${stored}, the final makes it ${outcome}`);
    return { ...base, final, frozenSide: pick.abbr, probability: pick.probability, probabilityText: formatValue("probability", pick.probability), wonBy: won, outcome, frozenAt: g.published.generatedAt ?? null };
  });
  const p = rec.period ?? {};
  const last = Math.max(...games.map((g) => instant(g.kickoffUtc)));
  return { sport: "nfl", date: etDate(last), period: { kind: "WEEK", seasonType: p.seasonType ?? null, week: p.week ?? null, label: p.label ?? `Week ${p.week}` }, record: "WINNER_SIDE", gamesScheduled: games.length, excluded: games.filter((g) => g.outcome === "EXCLUDED"), ...tally(games), games };
}

/** Finals on the recap must equal the scoreboard capture, game by game. Returns problems (empty = verified). */
export function recapFinalsProblems(recap, resultRows) {
  const byId = new Map((resultRows ?? []).map((r) => [String(r.providerEventId), r]));
  const p = [];
  for (const g of recap.games) {
    if (!g.final) continue;
    const r = byId.get(g.eventId);
    if (!r) { p.push(`${g.eventId} ${g.matchup}: not in the results capture`); continue; }
    if (!/^STATUS_FINAL/.test(String(r.statusRaw ?? ""))) p.push(`${g.eventId}: capture status ${r.statusRaw}`);
    if (r.ftHome !== g.final.home || r.ftAway !== g.final.away) p.push(`${g.eventId} ${g.matchup}: final ${g.final.away}-${g.final.home} vs capture ${r.ftAway}-${r.ftHome}`);
  }
  return p;
}

/** Plain-language denominator: "3 of 3 games final and graded". */
export const denominatorText = (recap) => `${recap.graded} of ${recap.gamesScheduled} games graded`;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const dedupeSlug = ({ sport, date, contentType, variant = null }) => [sport, date, contentType.toLowerCase().replace(/_/g, "-"), variant].filter(Boolean).join("-");

/**
 * One package.
 * @param {{ sport: string, date: string, contentType: string, variant?: string|null, snapshotRefs: Array<{ref:string, sha256:string}>, images: Array<{path:string, width:number, height:number, scale:number, sha256:string}>, caption: string, verification: {passed:boolean, checks:string[], cellsVerified:number}, window: {opensAt:string, closesAt:string}, recommended: {recommendedAt:string}|null, recommendedNote?: string|null, freshness: object, content: object }} o
 */
export function buildSocialPackage(o) {
  const { sport, date, contentType, variant = null, snapshotRefs, images, caption, verification, window, recommended, recommendedNote = null, freshness, content } = o;
  const pkg = {
    schema: SOCIAL_PACKAGE_SCHEMA, sport, date, contentType, variant,
    snapshotRefs, images, caption, verification, window,
    recommendedAt: recommended?.recommendedAt ?? null,
    recommendedAtEt: recommended?.recommendedAtEt ?? null,
    recommendation: recommended ?? { none: recommendedNote },
    dedupeId: `gtp-social:${sport}:${date}:${contentType}${variant ? `:${variant}` : ""}`,
    contentSha256: sha(JSON.stringify({ snapshotRefs, caption, content })),
    approval: { status: APPROVAL_STATUS, socialAuthorized: false },
    freshness, content,
  };
  const v = socialPackageViolations(pkg);
  if (v.length) throw new Error(`package ${pkg.dedupeId} refused:\n  - ${v.join("\n  - ")}`);
  return pkg;
}

/** [] when a package meets the contract. */
export function socialPackageViolations(p) {
  const v = [];
  if (p?.schema !== SOCIAL_PACKAGE_SCHEMA) v.push(`schema ${p?.schema}`);
  if (!SPORTS.has(p?.sport)) v.push(`sport ${p?.sport}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p?.date ?? ""))) v.push(`date ${p?.date}`);
  if (!Object.values(CONTENT_TYPE).includes(p?.contentType)) v.push(`contentType ${p?.contentType}`);
  if (!p?.snapshotRefs?.length || p.snapshotRefs.some((r) => !r.ref || !/^[0-9a-f]{64}$/.test(String(r.sha256)))) v.push("snapshotRefs need a ref and a sha256");
  if (!p?.images?.length || p.images.some((i) => !i.path || !/^[0-9a-f]{64}$/.test(String(i.sha256)))) v.push("images need a path and a sha256");
  if (!p?.caption || /[—–]/.test(p.caption)) v.push("caption missing or carries an em or en dash");
  if (p?.verification?.passed !== true) v.push("verification did not pass");
  if (!(instant(p?.window?.opensAt) < instant(p?.window?.closesAt))) v.push("window must open before it closes");
  if (p?.recommendedAt != null && !(instant(p.recommendedAt) >= instant(p.window?.opensAt) && instant(p.recommendedAt) < instant(p.window?.closesAt))) v.push("recommendedAt lies outside the window");
  if (p?.approval?.status !== APPROVAL_STATUS || p?.approval?.socialAuthorized !== false) v.push("approval must stay FOUNDER_REVIEW_REQUIRED");
  if (!p?.dedupeId || !p?.freshness?.asOf) v.push("dedupeId and freshness are required");
  return v;
}
