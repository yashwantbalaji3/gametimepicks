/**
 * CLEAN EXPORT RULES. PURE. A clean image is the reviewed card, same snapshot, without the review banner. Nothing here
 * posts anything. Eligibility: model-only, no estimate-labelled pass or rush yards, no player-stat card under REVIEW.
 */
export const REVIEW_DIV = /<div class="draft">[^<]*<\/div>/;

/** Why a package may not leave review. [] = eligible. */
export function cleanEligibilityProblems(pkg) {
  const p = [];
  if (pkg.containsMarketData !== false) p.push("containsMarketData");
  if (String(pkg.designVersion) !== "2") p.push("not design version 2");
  if (/top5_(pass|rush)_yds/.test(String(pkg.variant)) || (pkg.contentType === "NFL_PLAYER_STATS" && pkg.content?.estimate)) p.push("pass or rush estimate");
  if (/PLAYER_STATS$/.test(pkg.contentType) && pkg.anomalyCheck === "REVIEW") p.push("player-stat card with anomalyCheck REVIEW");
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
