/**
 * PRICED NBA GAME POST. PURE: no I/O, no clock, no network. One X post per game from already-built packages: image 1 the
 * priced winner card (NBA_GAME_WINNER `<eventId>-ml`, one observed moneyline), then the box-score line card page(s)
 * (NBA_BOXSCORE: model projection vs sportsbook line, ▲ green / ▼ red / neutral). It changes no image and no number. The
 * caption carries no price and no line; every number on the images is a claim from its source package.
 * Founder review only: socialAuthorized stays false; price display needs the founder's matchupGraphics approval.
 */
import { MODEL_GAME_POST } from "./nba-game-post-model.mjs";
import { buildSocialPackage, ccCaptionProblems, etLabel } from "./social-package.mjs";

export const PRICED_GAME_POST = Object.freeze({ maxLinePages: 2, designVersion: MODEL_GAME_POST.designVersion });

export const pricedGamePostCaption = ({ awayName, homeName, winnerNickname }) => [
  `🏀 ${awayName} vs ${homeName} tonight!`, "",
  `Our model projects the ${winnerNickname} to win.`, "",
  "Model projections vs sportsbook lines below 👇",
].join("\n");

const scale1 = (pkg) => pkg.images.filter((i) => i.scale === 1);

/** Why these packages cannot make one priced post (empty when they can). */
export function pricedGamePostProblems({ winner, box, images, forecastCells, recommendedAt }) {
  const p = [];
  const eventId = String(winner?.content?.eventId ?? "");
  if (winner?.contentType !== "NBA_GAME_WINNER" || winner.variant !== `${eventId}-ml` || winner.containsMarketData !== true || !winner.content?.price || !winner.content?.quotedAt) p.push("image 1 must be the priced winner card (-ml, one observed price)");
  if (box?.contentType !== "NBA_BOXSCORE" || String(box.variant) !== eventId) p.push("the line card must be this game's NBA_BOXSCORE");
  if (box?.content?.testData !== false) p.push("the line card is test data or does not say it is not");
  const pages = box ? scale1(box).length : 0;
  if (pages < 1 || pages > PRICED_GAME_POST.maxLinePages) p.push(`the line card must have 1 to ${PRICED_GAME_POST.maxLinePages} pages, has ${pages}`);
  const src = winner && box ? [...scale1(winner), ...scale1(box)].map((i) => i.sha256) : [];
  if (JSON.stringify((images ?? []).map((i) => i.sha256)) !== JSON.stringify(src)) p.push("images differ from the source cards or their order (winner first)");
  if (!forecastCells?.length) p.push("forecastCells are required");
  else if (forecastCells.some((c) => c.state === "BLOCKED")) p.push("a flagged cell is printed");
  if (winner && box) {
    const closes = Math.min(Date.parse(winner.window.closesAt), Date.parse(box.window.closesAt));
    const opens = Math.max(Date.parse(winner.window.opensAt), Date.parse(box.window.opensAt));
    const r = Date.parse(recommendedAt);
    if (!(r >= opens && r < closes)) p.push("the slot is outside the window both quotes allow");
  }
  return p;
}

/**
 * @param {{ winner:any, box:any, images:any[], forecastCells:any[], renderSource:{path:string, sha256:string}, recommendedAt:string,
 *   game:{awayName:string, homeName:string, awayAbbr:string, homeAbbr:string, winnerNickname:string, tipUtc:string} }} o
 */
export function buildPricedGamePost({ winner, box, images, forecastCells, renderSource, recommendedAt, game }) {
  const problems = pricedGamePostProblems({ winner, box, images, forecastCells, recommendedAt });
  if (!renderSource?.path) problems.push("renderSource is required");
  const eventId = String(winner?.content?.eventId ?? "?");
  if (problems.length) throw new Error(`${eventId}: ${problems.join("; ")}`);
  const caption = pricedGamePostCaption(game);
  const bad = ccCaptionProblems(caption, []);
  if (bad.length) throw new Error(`${eventId}: caption ${bad.join("; ")}`);
  const closesAt = [winner.window.closesAt, box.window.closesAt].sort()[0];
  const opensAt = [winner.window.opensAt, box.window.opensAt].sort().at(-1);
  const pkg = buildSocialPackage({
    sport: "nba", date: winner.date, contentType: "NBA_GAME_POST", variant: `${eventId}-priced`, designVersion: PRICED_GAME_POST.designVersion, containsMarketData: true,
    snapshotRefs: [...new Map([...winner.snapshotRefs, ...box.snapshotRefs].map((r) => [r.ref, r])).values()],
    images, caption, verification: { passed: winner.verification.passed && box.verification.passed, checks: [...new Set([...winner.verification.checks, ...box.verification.checks, "images in order: priced winner card, line card page(s)", "images byte-identical to the source cards", "caption prints no price and no line"])], cellsVerified: winner.verification.cellsVerified + box.verification.cellsVerified },
    window: { opensAt, closesAt },
    recommended: { recommendedAt, recommendedAtEt: etLabel(Date.parse(recommendedAt)), firstGameUtc: game.tipUtc, rule: "tip - 60 min, staggered 2 min where tips coincide (founder, 2026-11-04), inside both quote windows" },
    freshness: { ...winner.freshness, expiresAt: closesAt, rule: `${winner.freshness.rule}; the line card: ${box.freshness.rule}` },
    eligibilityClass: winner.eligibilityClass, disclosures: [...new Set([...winner.disclosures, ...box.disclosures])],
    title: `${game.awayAbbr} @ ${game.homeAbbr}: priced game post`, firstStartUtc: game.tipUtc, eventId, dataCommit: winner.commandCenter.dataCommit,
    ccCaption: caption, ccCaptionB: `🏀 ${game.awayName} vs ${game.homeName} tonight! Our model projects the ${game.winnerNickname} to win.`,
    extraClaims: [...winner.commandCenter.claims, ...box.commandCenter.claims],
    content: {
      eventId, priced: true, imageOrder: [winner.dedupeId, box.dedupeId], linePages: scale1(box).length, sourceDesignVersions: [winner.designVersion, box.designVersion], sourceContentSha256: [winner.contentSha256, box.contentSha256],
      moneyline: { side: winner.content.side, price: winner.content.price, book: winner.content.book, quotedAt: winner.content.quotedAt }, lineQuotes: box.content.quotedAt, winner: winner.content, box: box.content, socialAuthorized: false,
    },
  });
  return { ...pkg, forecastCells, renderSource };
}
