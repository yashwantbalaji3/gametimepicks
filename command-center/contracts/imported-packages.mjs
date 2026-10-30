/**
 * IMPORTED CONTENT — the one contract between Launch Readiness and the Command Center (founder 2026-10-30).
 *
 *   Launch Readiness owns forecasts, sportsbook comparisons and rendering; it writes gtp-social-package@1 files.
 *   The Command Center owns review, approval, scheduling and publishing. It never recomputes or edits a number.
 *
 * Pure. An imported package becomes an ordinary post proposal of kind "lr-…": one founder decision per post, bound by
 * digest, sent only through the publisher's one gate. Importing authorizes nothing and schedules nothing.
 * Every post starts in founder review; a design version needs its own approval; `blockers` can't be approved around.
 */
import { checkCaption } from "./post-queue.mjs";

export const PACKAGE_SCHEMA = "gtp-social-package@1";
export const IMPORT_ASSET_MANIFEST = PACKAGE_SCHEMA;
export const IMPORT_PREFIX = "lr-";
export const isImported = (pkg) => String(pkg?.kind ?? "").startsWith(IMPORT_PREFIX);
/**
 * A review copy carries the FOUNDER REVIEW ONLY banner on its image, so it can be approved but never sent. Approving it
 * tells Launch Readiness to produce the clean export (approval.socialAuthorized true), which comes back as a new
 * version of the same post and needs its own approval, because the image differs.
 */
export const isReviewCopy = (pkg) => isImported(pkg) && pkg.imported?.socialAuthorized !== true;

/**
 * contentType → how the Command Center treats it. tier = the founder's content rhythm (1 recap, 2 roundup, 3 Top 5,
 * 4 featured winners, 5 player graphics, 6 live). supported: the publisher can send it once approved and unblocked.
 * The template is its own design version: nothing can be approved until the founder approves that design.
 */
export const IMPORT_TYPES = Object.freeze({
  RESULTS_RECAP: { kind: "lr-results-recap", label: "Results recap", tier: 1, supported: true, design: "recap" },
  NBA_TONIGHT: { kind: "lr-nba-tonight", label: "NBA tonight: schedule and predicted winners", tier: 2, supported: true },
  NFL_SUNDAY_WINNERS: { kind: "lr-nfl-roundup", label: "NFL predicted-winner roundup", tier: 2, supported: true },
  NFL_MNF_WINNER: { kind: "lr-nfl-mnf", label: "Monday Night Football preview", tier: 2, supported: true },
  NBA_DAILY_TOP5: { kind: "lr-nba-top5", label: "NBA daily Top 5", tier: 3, supported: true },
  NFL_WEEKLY_TOP5: { kind: "lr-nfl-top5", label: "NFL weekly Top 5", tier: 3, supported: true },
  NBA_GAME_WINNER: { kind: "lr-nba-game-winner", label: "NBA game winner", tier: 4, supported: true },
  NFL_GAME_WINNER: { kind: "lr-nfl-game-winner", label: "NFL game winner", tier: 4, supported: true },
  NBA_BOXSCORE: { kind: "lr-nba-boxscore", label: "NBA player-prop box score (real lines)", tier: 5, supported: false },
  NFL_GAME_PLAYERS: { kind: "lr-nfl-game-players", label: "NFL game player graphic", tier: 5, supported: false },
  NBA_LIVE_UPDATE: { kind: "lr-live-update", label: "Live result update", tier: 6, supported: false },
  NFL_LIVE_UPDATE: { kind: "lr-live-update", label: "Live result update", tier: 6, supported: false },
});
export const UNSUPPORTED_KIND = "lr-unsupported";
/** The kinds the publisher may send (still only after approval, a clean re-check and the gate). */
export const IMPORT_SENDABLE = Object.freeze(Object.values(IMPORT_TYPES).filter((t) => t.supported).map((t) => t.kind));

const slug = (s) => String(s).toLowerCase().replace(/^lr-/, "");
/** One design version per kind (recaps per sport). */
export function importTemplateOf(contentType, sport) {
  const t = IMPORT_TYPES[contentType];
  if (!t) return null;
  return `gtp-lr-${t.design === "recap" ? `${String(sport).toLowerCase()}-recap` : slug(t.kind)}@1`;
}
const designRow = (template, label) => ({ template, assetManifest: IMPORT_ASSET_MANIFEST, label });
export const IMPORT_DESIGNS = Object.freeze([
  designRow(importTemplateOf("RESULTS_RECAP", "NBA"), "NBA results recap"),
  designRow(importTemplateOf("RESULTS_RECAP", "NFL"), "NFL results recap"),
  ...["NBA_TONIGHT", "NFL_SUNDAY_WINNERS", "NFL_MNF_WINNER", "NBA_DAILY_TOP5", "NFL_WEEKLY_TOP5", "NBA_GAME_WINNER", "NFL_GAME_WINNER", "NBA_BOXSCORE"].map((c) => designRow(importTemplateOf(c, null), IMPORT_TYPES[c].label)),
]);

// ── what can't go out, whatever anyone clicks ──────────────────────────────────────────────────────────────────
export const BLOCK = Object.freeze({
  LINE_RIGHTS: "LINE_RIGHTS_NOT_VERIFIED",
  NBA_BOARDS: "NBA_BOARDS_NOT_AUTHORIZED_FOR_SOCIAL",
  BELOW_BAR: "BELOW_PUBLICATION_BAR",
  UNSUPPORTED: "UNSUPPORTED_TYPE",
  VERIFICATION: "VERIFICATION_NOT_PASSED",
  EXPIRED: "WINDOW_CLOSED",
  TEST_DATA: "TEST_DATA",
  OVERLAP: "OVERLAPS_EXISTING_POST",
});
/** True when the content shows real sportsbook lines (the row-level `line`, or a count of lines shown). */
export function showsLines(contentType, content) {
  if (contentType === "NBA_BOXSCORE") return true;
  if ((content?.linesShown ?? 0) > 0) return true;
  return (content?.rows ?? []).some((r) => r?.line);
}
const UNCLEARED_NFL = /^top5_(pass|rush)_yds$/;

/** The standing blockers of one package (overlap is added by the caller, which knows the ledger). */
export function blockersOf(p, { now }) {
  const out = [];
  const add = (code, detail) => out.push({ code, detail });
  const t = IMPORT_TYPES[p.contentType];
  if (!t) add(BLOCK.UNSUPPORTED, `${p.contentType} is not a type the Command Center knows: it can be viewed, not approved`);
  else if (!t.supported && !showsLines(p.contentType, p.content)) add(BLOCK.UNSUPPORTED, `${t.label}: the publisher does not support this type yet`);
  if (showsLines(p.contentType, p.content)) add(BLOCK.LINE_RIGHTS, "Shows real sportsbook lines: social use needs written provider confirmation of redistribution rights. Private review only.");
  if (p.contentType === "NBA_DAILY_TOP5") add(BLOCK.NBA_BOARDS, "NBA player Top 5 boards are authorized for the site, not for social, until the founder clears them.");
  if (p.sport === "NFL" && (UNCLEARED_NFL.test(String(p.variant ?? "")) || (p.contentType === "NFL_WEEKLY_TOP5" && p.eligibilityClass === "ESTIMATE"))) add(BLOCK.BELOW_BAR, "An uncleared estimate (below the publication bar): it stays off social until independently cleared.");
  if (p.verification?.passed !== true) add(BLOCK.VERIFICATION, "Launch Readiness verification did not pass.");
  if (p.testData === true) add(BLOCK.TEST_DATA, "Test data: never publishable.");
  const closes = p.window?.closesAt ?? p.expiresAt;
  if (Number.isFinite(Date.parse(closes ?? "")) && Date.parse(now) >= Date.parse(closes)) add(BLOCK.EXPIRED, `The publishing window closed at ${closes}.`);
  return out;
}

// ── package validation (everything that needs no disk) ─────────────────────────────────────────────────────────
const SHA = /^[0-9a-f]{64}$/;
export function validatePackage(p) {
  const bad = [];
  if (p?.schema !== PACKAGE_SCHEMA) return [`schema is ${p?.schema ?? "missing"}, expected ${PACKAGE_SCHEMA}`];
  for (const k of ["sport", "date", "contentType", "dedupeId"]) if (!p[k] || typeof p[k] !== "string") bad.push(`${k} missing`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date ?? ""))) bad.push("date is not YYYY-MM-DD");
  if (!/^gtp-social:[a-z]+:\d{4}-\d{2}-\d{2}:[A-Z0-9_]+(:[A-Za-z0-9_-]+)?$/.test(String(p.dedupeId ?? ""))) bad.push(`dedupeId malformed: ${p.dedupeId}`);
  if (p.dedupeId && p.sport && p.date && !String(p.dedupeId).startsWith(`gtp-social:${p.sport}:${p.date}:${p.contentType}`)) bad.push("dedupeId does not match sport, date and contentType");
  if (!SHA.test(String(p.contentSha256 ?? ""))) bad.push("contentSha256 missing");
  if (!Array.isArray(p.images) || !p.images.length) bad.push("no images");
  for (const i of p.images ?? []) {
    if (!i?.path || !SHA.test(String(i.sha256 ?? ""))) bad.push(`image without path or sha256: ${i?.path ?? "?"}`);
    if (!(i?.width > 0) || !(i?.height > 0) || !(i?.scale > 0)) bad.push(`image without size: ${i?.path ?? "?"}`);
  }
  if (!p.commandCenter?.postId || !p.commandCenter?.title) bad.push("commandCenter block missing postId or title");
  if (!Array.isArray(p.commandCenter?.captions) || !p.commandCenter.captions.length) bad.push("no caption options");
  return bad;
}

// ── captions ───────────────────────────────────────────────────────────────────────────────────────────────────
const EM_DASH = /[—–]/;
/** The queue's checks (evidence, forbidden terms, links, 280) plus the founder's rules for this content. */
export function checkImportedCaption(text, pkg) {
  const problems = [...checkCaption(text, pkg).problems];
  if (EM_DASH.test(text)) problems.push({ code: "EM_DASH", detail: "no em or en dashes in captions" });
  if (pkg.sport === "NBA" && pkg.kind !== "lr-results-recap" && /\d\s*%/.test(text)) problems.push({ code: "NO_PERCENT_IN_NBA_CAPTION", detail: "NBA captions don't state the estimate as a percentage" });
  return { ok: problems.length === 0, problems };
}

// ── overlap with what the Command Center already has ───────────────────────────────────────────────────────────
const LIVE_STATES = new Set(["approved", "scheduled", "published"]);
const EVENT_KINDS = new Set(["nba-game", "nba-pregame", "pregame-forecast", "lr-nba-game-winner", "lr-nfl-game-winner", "lr-nfl-mnf"]);
function sameContent(mine, theirs) {
  const a = mine, b = theirs.package ?? {};
  if (mine.kind === "lr-results-recap") return b.sport === a.sport && ["results-recap", "nba-results", "lr-results-recap"].includes(b.kind) && (b.resultsDate ?? b.date) === (a.resultsDate ?? a.date);
  if (mine.kind === "lr-nfl-top5") return b.sport === "NFL" && ["top5-weekly"].includes(b.kind) && Number(b.week ?? -1) === Number(a.week);
  if (mine.kind === "lr-nba-top5") return b.sport === "NBA" && b.kind === "top5-daily" && b.date === a.date;
  return Boolean(a.eventId) && EVENT_KINDS.has(a.kind) && EVENT_KINDS.has(b.kind) && String(b.eventId ?? "") === String(a.eventId);
}
/** Posts covering the same content under another id. approved/scheduled/published block; a draft is only noted. */
export function overlapsOf(pkg, posts) {
  const base = pkg.postId;
  const hits = posts.filter((p) => p.package?.postId !== base && !p.archived && sameContent(pkg, p) && !["superseded", "rejected", "invalidated"].includes(p.lifecycle));
  return { blocking: hits.filter((p) => LIVE_STATES.has(p.lifecycle)), noted: hits.filter((p) => !LIVE_STATES.has(p.lifecycle)) };
}

// ── pre-send re-check: nothing is recomputed, the published files are compared ─────────────────────────────────
/** A ref named for a date or week; `latest` files move all day and are checked at import against the data commit. */
export const pinnedRef = (ref) => !/(^|\/)(frozen-)?latest\.json$/.test(ref);
const normTime = (t) => { const x = Date.parse(t ?? ""); return Number.isFinite(x) ? x : null; };

function nbaGameReasons(g, lane) {
  const row = (lane?.games ?? []).find((x) => String(x.providerEventId) === String(g.eventId));
  if (!row) return [`${g.matchup}: no longer in the published lane`];
  const out = [];
  if (row.elo?.favoured !== g.side) out.push(`${g.matchup}: the published side is ${row.elo?.favoured ?? "none"}, the graphic says ${g.side}`);
  const wp = row.elo?.winProbability;
  if (wp && g.awayP != null && Math.abs(wp.away - g.awayP) > 1e-9) out.push(`${g.matchup}: the published estimate changed`);
  if (normTime(row.tipUtc) !== normTime(g.kickoffUtc)) out.push(`${g.matchup}: tip-off moved to ${row.tipUtc}`);
  return out;
}
function nflGameReasons(g, forecasts) {
  const row = (forecasts?.forecasts ?? []).find((x) => String(x.providerEventId) === String(g.eventId));
  if (!row) return [`${g.matchup}: no longer in the published forecasts`];
  const out = [];
  const side = row.sideDecision?.publishedSide === "HOME" ? row.home?.abbr : row.sideDecision?.publishedSide === "AWAY" ? row.away?.abbr : null;
  if (side !== g.winner) out.push(`${g.matchup}: the published side is ${side ?? "none"}, the graphic says ${g.winner}`);
  if (normTime(row.kickoffUtc) !== normTime(g.kickoffUtc)) out.push(`${g.matchup}: kickoff moved to ${row.kickoffUtc}`);
  return out;
}
/** Each game the post shows, against the official file of today's data. Launch Readiness verified the numbers; this catches a change since. */
export function officialReasons(pkg, src) {
  const c = pkg.imported?.content;
  if (!c) return [];
  const games = c.game ? [c.game] : c.games ?? [];
  if (!games.length || pkg.kind === "lr-results-recap") return [];
  const json = (p) => { const raw = src.read(p); return raw == null ? null : JSON.parse(raw); };
  if (pkg.sport === "NBA") {
    const lane = json(`app/public/data/nba/experimental-public/${pkg.date}.json`);
    if (!lane) return [`no published NBA lane for ${pkg.date}`];
    return games.flatMap((g) => nbaGameReasons(g, lane));
  }
  if (pkg.sport === "NFL") {
    const f = json("app/public/data/nfl/forecasts/latest.json");
    if (!f) return ["no published NFL forecasts"];
    return games.flatMap((g) => nflGameReasons(g, f));
  }
  return [];
}
