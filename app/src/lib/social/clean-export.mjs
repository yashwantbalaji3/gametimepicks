/**
 * CLEAN EXPORT RULES. PURE. A clean image is the reviewed card, same snapshot, without the review banner. Nothing here
 * posts anything. Eligibility: sportsbook data only on the moneyline winner cards (they carry no player projections, founder
 * authorization 2026-10-30), no estimate-labelled pass or rush yards, nothing under anomaly REVIEW, and no stat, Top 5 or
 * game-post package without a recorded anomaly check. Game posts stay on design 3, which is not yet allowed.
 */
import { americanText } from "./nba-moneyline.mjs";

export const REVIEW_DIV = /<div class="draft">[^<]*<\/div>/;
const CLEAN_DESIGN_VERSIONS = ["2"];
const NEEDS_ANOMALY_CHECK = /(_PLAYER_STATS|_BOXSCORE|_TOP5|_GAME_POST)$/;

/** The two package shapes allowed to carry a sportsbook price. */
export function isMoneylinePackage(pkg) {
  if (pkg.contentType === "NBA_TONIGHT") return pkg.variant === "ml";
  return pkg.contentType === "NBA_GAME_WINNER" && /^\d+$/.test(String(pkg.content?.eventId)) && pkg.variant === `${pkg.content.eventId}-ml`;
}

/** Why a package may not leave review. [] = eligible. */
export function cleanEligibilityProblems(pkg) {
  const p = [];
  const ml = isMoneylinePackage(pkg);
  if (pkg.containsMarketData !== ml) p.push("containsMarketData");
  if (!CLEAN_DESIGN_VERSIONS.includes(String(pkg.designVersion))) p.push("design version not allowed");
  if (/top5_(pass|rush)_yds/.test(String(pkg.variant)) || (pkg.contentType === "NFL_PLAYER_STATS" && pkg.content?.estimate)) p.push("pass or rush estimate");
  if (pkg.anomalyCheck === "REVIEW") p.push("anomalyCheck REVIEW");
  else if (pkg.anomalyCheck == null && NEEDS_ANOMALY_CHECK.test(String(pkg.contentType))) p.push("anomalyCheck missing");
  return p;
}

const quotesOf = (content) => (content?.games ?? [content]).map(({ eventId, side, price, book, quotedAt }) => ({ eventId, side, price, book, quotedAt }));
/** [] when the rebuilt card holds the package's side, price and book, and prints each price. */
export function marketValueProblems(pkg, rebuiltContent, html) {
  if (!isMoneylinePackage(pkg)) return [];
  const want = quotesOf(pkg.content);
  const p = [];
  if (want.some((q) => !q.side || !Number.isFinite(q.price) || !q.book)) p.push("package quote incomplete");
  if (JSON.stringify(want) !== JSON.stringify(quotesOf(rebuiltContent))) p.push("side, price or book differs from the package");
  const shown = cellsOf(html).join("\n");
  for (const q of want) if (Number.isFinite(q.price) && !shown.includes(americanText(q.price))) p.push(`price not on the card: ${q.eventId}`);
  return p;
}

/** Why an approval entry does not match its package and the image on disk. [] = matches. */
export function approvalMatchProblems(entry, pkg, imageShas) {
  const p = [];
  if (!entry.dedupeId || !entry.contentSha256 || !entry.captionId || !entry.caption || !entry.approvedAt) p.push("entry needs dedupeId, contentSha256, captionId, caption, approvedAt");
  if (entry.dedupeId !== pkg.dedupeId) p.push("dedupeId differs");
  if (entry.contentSha256 !== pkg.contentSha256) p.push("contentSha256 differs from the package");
  const cap = pkg.commandCenter?.captions?.find((c) => c.id === entry.captionId);
  if (!cap || cap.text !== entry.caption) p.push("caption does not match the package caption");
  for (const i of pkg.images ?? []) if (imageShas.get(i.path) !== i.sha256) p.push(`image hash differs: ${i.path}`);
  return p;
}

/** The clean page: exactly the banner removed. Throws unless there was exactly one. */
export function withoutBanner(html) {
  if ((html.match(new RegExp(REVIEW_DIV, "g")) ?? []).length !== 1) throw new Error("expected exactly one review banner");
  return html.replace(REVIEW_DIV, "");
}

const cellsOf = (html) => [...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`).sort();
/** [] when the clean page prints the same values and the same disclosure text as the reviewed page. */
export function sameDisplayProblems(reviewed, clean, disclosure) {
  const p = [];
  if (JSON.stringify(cellsOf(reviewed)) !== JSON.stringify(cellsOf(clean))) p.push("displayed values differ");
  if (!clean.includes(disclosure)) p.push("disclosure missing");
  if (REVIEW_DIV.test(clean)) p.push("banner still present");
  return p;
}
