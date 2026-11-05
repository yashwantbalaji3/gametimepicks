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
  NFL_GAME_WINNER: "NFL_GAME_WINNER",
  NBA_TONIGHT: "NBA_TONIGHT",
  NBA_GAME_WINNER: "NBA_GAME_WINNER",
  NBA_GAME_POST: "NBA_GAME_POST",
  NFL_GAME_POST: "NFL_GAME_POST",
  NFL_WEEKLY_TOP5: "NFL_WEEKLY_TOP5",
  NBA_DAILY_TOP5: "NBA_DAILY_TOP5",
  NBA_TOP5_CAROUSEL: "NBA_TOP5_CAROUSEL",
  NBA_BOXSCORE: "NBA_BOXSCORE",
  NBA_PLAYER_STATS: "NBA_PLAYER_STATS",
  NFL_PLAYER_STATS: "NFL_PLAYER_STATS",
  NFL_GAME_PLAYERS: "NFL_GAME_PLAYERS",
  RESULTS_RECAP: "RESULTS_RECAP",
  UFC_PRELIMS: "UFC_PRELIMS",
  UFC_MAIN_CARD: "UFC_MAIN_CARD",
});
export const ELIGIBILITY = Object.freeze({ OFFICIAL: "OFFICIAL", ESTIMATE: "ESTIMATE" });
/**
 * Command Center mapping (read from command-center/contracts/post-queue.mjs at 7c3457d7d3, read-only). null = the queue
 * has no kind for this post yet. The `commandCenter` block reuses that module's package field names; nothing ingests it.
 */
export const CC_KIND = Object.freeze({
  NFL_SUNDAY_WINNERS: null, NFL_GAME_PLAYERS: null, NFL_MNF_WINNER: "pregame-forecast", NFL_GAME_WINNER: "pregame-forecast", NBA_TONIGHT: null, NBA_GAME_WINNER: null, NBA_GAME_POST: null, NFL_GAME_POST: null, NBA_BOXSCORE: null, NBA_PLAYER_STATS: null, NFL_PLAYER_STATS: null,
  NFL_WEEKLY_TOP5: "top5-weekly", NBA_DAILY_TOP5: "top5-daily", NBA_TOP5_CAROUSEL: null, RESULTS_RECAP: "results-recap", UFC_PRELIMS: null, UFC_MAIN_CARD: null,
});
/** One row per content type: the queue kind, and what the Command Center lacks when there is none. */
export const CC_KIND_MAP = Object.freeze(Object.entries(CC_KIND).map(([contentType, kind]) => Object.freeze({
  contentType, kind,
  gap: kind ? null : /BOXSCORE|PLAYER_STATS|GAME_WINNER|GAME_POST/.test(contentType) ? "no kind; nearest is nba-game, which needs a pre + players pair and is not in POST_KINDS" : "no slate-level winner kind",
})));
export const CC_ACCOUNT = "@GameTimePicksHQ";
export const CC_MAX_CAPTION = 280;
const CC_FORBIDDEN = ["edge", "value", "lock", "pick", "best bet", "beat the market", "market mistake", "profitable", "guaranteed", "odds", "bet", "bets", "betting", "parlay", "sure thing", "can't lose", "picks", "free money"];
const X_SINGLE = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
/** X-weighted length: characters outside X's single-weight ranges (emoji, CJK) count 2. */
export const xWeighted = (text) => [...String(text)].reduce((n, c) => n + (X_SINGLE.some(([a, b]) => c.codePointAt(0) >= a && c.codePointAt(0) <= b) ? 1 : 2), 0);
const ccNumbers = (s) => String(s ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
/** The Command Center's caption rules, mirrored here (its module is not on this branch). Returns problems. */
export function ccCaptionProblems(text, claims, { hasMiss = false } = {}) {
  const p = [];
  const allowed = new Set(claims.flatMap((c) => ccNumbers(c.display)));
  for (const n of ccNumbers(text)) if (!allowed.has(n)) p.push(`number ${n} is not in the claims`);
  const plain = String(text).replace(/\bnot betting advice\b/gi, "");
  for (const t of CC_FORBIDDEN) if (new RegExp(`\\b${t}\\b`, "i").test(plain)) p.push(`forbidden term ${t}`);
  if (/https?:\/\/|www\./i.test(text)) p.push("link in caption");
  if (xWeighted(text) > CC_MAX_CAPTION) p.push("over 280 X-weighted characters");
  if (hasMiss && /\b(forecast|prediction|predicted)/i.test(text) && !/\bmiss(ed)?\b/i.test(text)) p.push("a miss is not stated");
  return p;
}

/** Editorial spacing for one slate, minutes before first game. Proposal only: it changes no recommendedAt. */
export const EDITORIAL = Object.freeze({ recapLeadMin: 120, slateLeadMin: 90, boardLeadMin: 75, boardGapMin: 15, gameLeadMin: 45, gameCardsPerTipMax: 2 });
/**
 * Priority and spacing. Order is by type then start time, NEVER by win probability: a confidence ranking is withheld.
 * @param {Array<{ sport:string, date:string, contentType:string, variant?:string|null, firstStartUtc:string }>} posts
 */
export function editorialPlan(posts) {
  const type = (c) => (c === CONTENT_TYPE.RESULTS_RECAP ? 0 : /TONIGHT|SUNDAY|MNF/.test(c) ? 1 : /TOP5/.test(c) ? 2 : 3);
  const sorted = [...posts].sort((a, b) => type(a.contentType) - type(b.contentType) || instant(a.firstStartUtc) - instant(b.firstStartUtc) || String(a.variant).localeCompare(String(b.variant)));
  const first = Math.min(...posts.filter((p) => type(p.contentType) < 3 && p.contentType !== CONTENT_TYPE.RESULTS_RECAP).map((p) => instant(p.firstStartUtc)));
  const perTip = new Map();
  let board = 0;
  return sorted.map((p, i) => {
    const t = type(p.contentType);
    const start = instant(p.firstStartUtc);
    const base = Number.isFinite(first) ? first : start;
    let at = base; let hold = false;
    if (t === 0) at = start - EDITORIAL.recapLeadMin * 60000;
    else if (t === 1) at = start - EDITORIAL.slateLeadMin * 60000;
    else if (t === 2) { at = base - (EDITORIAL.boardLeadMin - EDITORIAL.boardGapMin * board) * 60000; board += 1; } else {
      const n = (perTip.get(start) ?? 0) + 1; perTip.set(start, n);
      at = start - EDITORIAL.gameLeadMin * 60000;
      hold = n > EDITORIAL.gameCardsPerTipMax;
    }
    return { rank: i + 1, sport: p.sport, date: p.date, contentType: p.contentType, variant: p.variant ?? null, proposedAt: toIso(at), proposedAtEt: etLabel(at), recommendation: hold ? "HOLD_FOR_FOUNDER_CHOICE" : "POST" };
  });
}

const SPORTS = new Set(["nfl", "nba", "ufc"]);
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
 * The first game of the next slate after `afterEtDate`, minus `leadMs` (default two hours).
 * @param {{ games: Array<{ kickoffUtc: string, statusRaw?: string|null }>, afterEtDate: string, asOf: string, leadMs?: number }} o
 * @returns {{ recommendedAt: string, recommendedAtEt: string, firstGameUtc: string, firstGameEt: string, slateEtDate: string, games: number, skippedSlates: string[] } | null}
 *   null when the data holds no such slate: the caller reports that, it never guesses a time.
 */
export function recommendedPostTime({ games, afterEtDate, asOf, leadMs = RECOMMEND_LEAD_MS }) {
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
    const at = first - leadMs;
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

/**
 * The revision of a package about to replace `prior` (null = first). A new image or caption moves it on, so an approval
 * against the old contentSha256 can never match; an identical re-render keeps it. Revision 1 stays out of contentSha256.
 */
export function nextRevision(prior, { images, caption, ccCaption }) {
  if (!prior) return 1;
  const shas = (l) => JSON.stringify(l.map((i) => i.sha256));
  const same = shas(prior.images ?? []) === shas(images) && prior.caption === caption && prior.commandCenter?.captions?.[0]?.text === ccCaption;
  return (prior.revision ?? 1) + (same ? 0 : 1);
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const dedupeSlug = ({ sport, date, contentType, variant = null }) => [sport, date, contentType.toLowerCase().replace(/_/g, "-"), variant].filter(Boolean).join("-");

/**
 * One package.
 * @param {{ sport: string, date: string, contentType: string, variant?: string|null, snapshotRefs: Array<{ref:string, sha256:string}>, images: Array<{path:string, width:number, height:number, scale:number, sha256:string}>, caption: string, verification: {passed:boolean, checks:string[], cellsVerified:number}, window: {opensAt:string, closesAt:string}, recommended: {recommendedAt:string}|null, recommendedNote?: string|null, freshness: object, content: object }} o
 */
/**
 * FINAL-COPY CANDIDATE (founder 2026-11-04T22:30:09Z, verbatim in ~/gtp-evidence/nov4-founder-decisions-2230Z.md): "I authorize
 * marking successfully validated, banner-free packages as final-copy candidates rather than yellow-banner review drafts …
 * It is not permission to fabricate my content approval … My approval of each final post in the Command Center remains
 * mandatory." The ONLY case where socialAuthorized may be true without a clean export: an NBA_GAME_POST `<eventId>-priced`
 * for 2026-11-04 carrying market data, status still FOUNDER_REVIEW_REQUIRED, contentApproval null, and this exact ref.
 */
export const FINAL_COPY_AUTHORIZATION_2026_11_04 = Object.freeze({
  ref: "nov4-founder-decisions-2230Z.md section C", sha256: "0bb0c75cc18f77028fcb850fd60b5477a4c7b14383781ab647aabaed1981bbb3", at: "2026-11-04T22:30:09Z",
});
/**
 * NFL WEEK 9 (founder 2026-11-05T16:04:37Z, ~/gtp-evidence/nov5-founder-approval-items1-5.md): "I approve final-copy imports
 * of all 15 NFL game posts and all five official Top 5 graphics into the Command Center. Each post must remain subject to
 * my exact-version content approval before scheduling or publishing." Week 9 NFL_GAME_POST / NFL_WEEKLY_TOP5, dated
 * 2026-11-05 to 2026-11-09, still FOUNDER_REVIEW_REQUIRED, contentApproval null, this exact ref.
 */
export const FINAL_COPY_AUTHORIZATION_NFL_W9 = Object.freeze({
  ref: "nov5-founder-approval-items1-5.md final-copy paragraph", sha256: "64bbd86930ca8409552e1980b9e7b1dbae833ce35e8ad340913a67ef134b1c7d", at: "2026-11-05T16:04:37Z",
});
// Founder ~22:30Z Nov 5, verbatim "Deliver these NBA packages into the live Command Center as finalized, banner-free,
// single-approval posts" (~/gtp-evidence/nov5-founder-weekend-directive-excerpts.md): the two Nov 5 NBA game posts only.
export const FINAL_COPY_AUTHORIZATION_NBA_2026_11_05 = Object.freeze({
  ref: "nov5-founder-weekend-directive-excerpts.md NBA finalized-posts line", sha256: "80818f48756cce69926cc1bc62f545361164e309c83f2a8be4aa3a49de605ab7", at: "2026-11-05T22:30:00Z",
});
const sameRef = (f, F) => f.ref === F.ref && f.sha256 === F.sha256 && f.at === F.at;
const nflW9 = (p) => p.sport === "nfl" && ["NFL_GAME_POST", "NFL_WEEKLY_TOP5"].includes(p.contentType) && p.date >= "2026-11-05" && p.date <= "2026-11-09" && p.content?.week === 9;

export function isFinalCopyCandidate(p) {
  const a = p?.approval ?? {}, f = a.finalCopyAuthorization ?? {}, F = FINAL_COPY_AUTHORIZATION_2026_11_04;
  if (a.socialAuthorized === true && a.status === APPROVAL_STATUS && a.contentApproval === null && sameRef(f, FINAL_COPY_AUTHORIZATION_NFL_W9) && nflW9(p ?? {})) return true;
  if (a.socialAuthorized === true && a.status === APPROVAL_STATUS && a.contentApproval === null && sameRef(f, FINAL_COPY_AUTHORIZATION_NBA_2026_11_05)
    && p.sport === "nba" && p.date === "2026-11-05" && p.contentType === "NBA_GAME_POST" && /^\d+-lines$/.test(String(p.variant)) && p.containsMarketData === true) return true;
  return a.socialAuthorized === true && a.status === APPROVAL_STATUS && a.contentApproval === null && f.ref === F.ref && f.sha256 === F.sha256 && f.at === F.at
    && p.sport === "nba" && p.date === "2026-11-04" && p.contentType === "NBA_GAME_POST" && /^\d+-priced$/.test(String(p.variant)) && p.containsMarketData === true;
}

export function buildSocialPackage(o0) {
  /* A recommended time past the window (a quote expiring before the slot) becomes no recommendation, with the reason. */
  const rec0 = o0.recommended?.recommendedAt, inWin = rec0 == null || (Date.parse(rec0) >= Date.parse(o0.window?.opensAt) && Date.parse(rec0) < Date.parse(o0.window?.closesAt));
  const o = inWin || !o0.containsMarketData ? o0 : { ...o0, recommended: null, recommendedNote: "the recommended slot falls outside this package's quote window; refresh quotes or post earlier" };
  const { revision = 1, anomalies = null, anomalyCheck = null, designVersion = null, containsMarketData = false, sport, date, contentType, variant = null, snapshotRefs, images, caption, verification, window, recommended, recommendedNote = null, freshness, content, eligibilityClass, disclosures, ccCaption, ccCaptionB = null, extraClaims = [], cells = [], title, firstStartUtc, eventId = null, hasMiss = false, dataCommit = null, priority = null } = o;
  const evidenceRef = snapshotRefs[0];
  const claims = [...extraClaims, ...cells.map(([key, display]) => ({ key, display, evidenceRef: evidenceRef.ref }))];
  const firstSet = images.filter((i) => i.scale === 1);
  const mediaSet = firstSet.map((i) => ({ file: i.path, sha256: i.sha256, width: i.width, height: i.height, format: contentType, altText: title }));
  const contentKind = CC_KIND[contentType] ?? contentType.toLowerCase();
  const snapshotId = sha(snapshotRefs.map((r) => r.sha256).join("|"));
  const dedupe = `gtp-social:${sport}:${date}:${contentType}${variant ? `:${variant}` : ""}`;
  const pkg = {
    schema: SOCIAL_PACKAGE_SCHEMA, revision, designVersion, containsMarketData, ...(anomalyCheck ? { anomalyCheck, anomalies } : {}), sport, date, contentType, variant,
    snapshotRefs, images, caption, verification, window,
    ...(o.validationStatus ? { validationStatus: o.validationStatus, displayStatus: o.displayStatus } : {}),
    recommendedAt: recommended?.recommendedAt ?? null,
    recommendedAtEt: recommended?.recommendedAtEt ?? null,
    recommendation: recommended ?? { none: recommendedNote },
    dedupeId: dedupe,
    idempotencyKey: ["publish", "x", CC_ACCOUNT, dedupe, contentKind, snapshotId].join("|"),
    mediaSha256: firstSet[0]?.sha256 ?? null,
    mediaSetSha256: sha(firstSet.map((m) => m.sha256).join("|")),
    disclosures, expiresAt: window.closesAt, eligibilityClass,
    commandCenter: {
      ingestable: CC_KIND[contentType] != null, postId: `${date}:${sport.toUpperCase()}:${contentType.toLowerCase()}${variant ? `:${variant}` : ""}`, kind: CC_KIND[contentType], format: contentKind, title, sport: sport.toUpperCase(), date,
      status: "READY", reasons: [], priority, eventId, firstStartUtc, suggestedPublishAt: recommended?.recommendedAt ?? null, dataCommit, contentKey: snapshotId,
      claims, media: mediaSet[0] ? { ...mediaSet[0], mime: "image/png", kind: "graphic" } : null, mediaSet,
      captions: [{ id: "A", tone: "factual", source: "template", text: ccCaption }, { id: "B", tone: "short", source: "template", text: ccCaptionB ?? `${ccCaption.split(/(?<=[.:])\s/)[0].replace(/:$/, ".")} Not betting advice.` }], evidence: snapshotRefs.map((r) => ({ label: r.ref, ref: `sha256 ${r.sha256.slice(0, 12)}` })), hasMiss,
    },
    contentSha256: sha(JSON.stringify({ ...(revision > 1 ? { revision } : {}), snapshotRefs, caption, content, media: images.map((i) => i.sha256), ...(anomalyCheck ? { anomalyCheck, anomalies } : {}) })),
    approval: { status: APPROVAL_STATUS, socialAuthorized: false },
    freshness, content,
  };
  const v = socialPackageViolations(pkg);
  if (v.length) throw new Error(`package ${pkg.dedupeId} refused:\n  - ${v.join("\n  - ")}`);
  return pkg;
}

/**
 * VALIDATION IS NOT DISPLAY. `validationStatus.state` says how far the numbers are validated (an ESTIMATE has not met its
 * calibration standard); `displayStatus` says whether the post may show them. An estimate shows, with its label.
 */
export const validationOf = (estimateLabelText) => (estimateLabelText
  ? { validationStatus: { state: ELIGIBILITY.ESTIMATE, label: estimateLabelText, blocksDisplay: false }, displayStatus: "SHOW_WITH_ESTIMATE_LABEL" }
  : { validationStatus: { state: ELIGIBILITY.OFFICIAL, label: null, blocksDisplay: false }, displayStatus: "SHOW" });

/** [] when a package meets the contract. */
export function socialPackageViolations(p) {
  const v = [];
  if (p?.schema !== SOCIAL_PACKAGE_SCHEMA) v.push(`schema ${p?.schema}`);
  if (!SPORTS.has(p?.sport)) v.push(`sport ${p?.sport}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p?.date ?? ""))) v.push(`date ${p?.date}`);
  if (!Object.values(CONTENT_TYPE).includes(p?.contentType)) v.push(`contentType ${p?.contentType}`);
  if (!p?.snapshotRefs?.length || p.snapshotRefs.some((r) => !r.ref || !/^[0-9a-f]{64}$/.test(String(r.sha256)))) v.push("snapshotRefs need a ref and a sha256");
  if (!p?.images?.length || p.images.some((i) => !i.path || !/^[0-9a-f]{64}$/.test(String(i.sha256)) || !Number.isInteger(i.width) || !Number.isInteger(i.scale))) v.push("images need a path, sha256, width and scale");
  if (!p?.caption || /[—–]/.test(p.caption)) v.push("caption missing or carries an em or en dash");
  if (p?.verification?.passed !== true) v.push("verification did not pass");
  if (!(instant(p?.window?.opensAt) < instant(p?.window?.closesAt))) v.push("window must open before it closes");
  if (p?.recommendedAt != null && !(instant(p.recommendedAt) >= instant(p.window?.opensAt) && instant(p.recommendedAt) < instant(p.window?.closesAt))) v.push("recommendedAt lies outside the window");
  if (p?.approval?.status !== APPROVAL_STATUS || (p?.approval?.socialAuthorized !== false && !isFinalCopyCandidate(p))) v.push("approval must stay FOUNDER_REVIEW_REQUIRED");
  if (!Object.values(ELIGIBILITY).includes(p?.eligibilityClass)) v.push(`eligibilityClass ${p?.eligibilityClass}`);
  if (!p?.disclosures?.length) v.push("disclosures are required");
  if (!p?.idempotencyKey || !/^[0-9a-f]{64}$/.test(String(p?.mediaSha256)) || p?.expiresAt !== p?.window?.closesAt) v.push("idempotencyKey, mediaSha256 and expiresAt are required");
  const cc = p?.commandCenter;
  for (const c of cc?.captions ?? []) for (const x of ccCaptionProblems(c.text, cc.claims ?? [], { hasMiss: cc.hasMiss })) v.push(`Command Center caption ${c.id}: ${x}`);
  if (p?.anomalyCheck !== undefined) {
    if (!["PASS", "REVIEW", ...(p.publicationException?.affected && p.reviewAnomalyCheck === "REVIEW" ? ["EXCEPTION"] : [])].includes(p.anomalyCheck) || !Array.isArray(p.anomalies)) v.push("anomalyCheck must be PASS or REVIEW with an anomalies list");
    for (const a of p.anomalies ?? []) if (!a.playerId || !a.market || !a.verdict || /[+\u2212-]\d{3}\b|\bline (of )?\d|\$\d/i.test(String(a.detail))) v.push(`anomaly ${a.playerId}:${a.market} needs fields and may not print a line or a price`);
  }
  if ((p?.validationStatus == null) !== (p?.displayStatus == null)) v.push("validationStatus and displayStatus travel together");
  if (p?.validationStatus?.state === ELIGIBILITY.ESTIMATE && !p.validationStatus.label) v.push("an estimate needs its label");
  if (!p?.dedupeId || !p?.freshness?.asOf) v.push("dedupeId and freshness are required");
  return v;
}
