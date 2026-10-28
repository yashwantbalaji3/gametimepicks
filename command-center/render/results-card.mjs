/**
 * RESULTS CARD RENDERER — results bundle (recap/results-bundle.mjs) → results-card@1 → 1080×1350 PNG.
 *
 * Same contract as the NFL card (render-png.mjs): offline, every request aborted, one machine → identical bytes, and
 * every slot from the bundle. NBA tags use the app's validated team colours (nba-team-colors.json via its own
 * maths module); EPL clubs have no colour data in the app, so their tags stay neutral rather than guessed.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, CC_ROOT } from "../lib/util.mjs";
import { nbaTeamColor, bestInk } from "../../app/src/lib/simulation-theater/nba/nba-team-colors.mjs";
import { fillTemplate, renderHtmlToPng, escapeHtml } from "./render-png.mjs";

export const RESULTS_TEMPLATE_ID = "results-card@1";
const TEMPLATE = path.join(CC_ROOT, "render/templates/results-card.html");
const NBA_COLORS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "app/src/lib/simulation-theater/nba/nba-team-colors.json"), "utf8"));
const LEAGUE = { NBA: "NBA", EPL: "PREMIER LEAGUE" };
const SOURCE = { NBA: "NBA finals record", EPL: "results + Forecast Ledger" };

function tagStyle(sport, short) {
  if (sport !== "NBA") return "";
  const c = nbaTeamColor(NBA_COLORS, short);
  if (!c) return "";
  return `--c:${c.primary};--ink:${bestInk(NBA_COLORS, c.primary)}`;
}

export function resultsSlots(b) {
  if (!b.publicLabel?.term) throw new Error(`results bundle ${b.sport} ${b.date} has no public label from the registry: refusing to render`);
  const side = (g, s) => {
    const t = g[s];
    const style = tagStyle(b.sport, t.short);
    // NBA: the tricode. EPL: H / A — the app has no club codes or colours, and none are invented here.
    const tag = b.sport === "NBA" ? t.short : s === "home" ? "H" : "A";
    return `<div class="side ${g.winner === s ? "win" : ""}"><span class="tag"${style ? ` style="${escapeHtml(style)}"` : ""}>${escapeHtml(tag)}</span><span class="nm">${escapeHtml(t.name)}</span><span class="sc">${escapeHtml(String(t.score))}</span></div>`;
  };
  const games = b.games.map((g) => {
    const order = b.sport === "EPL" ? ["home", "away"] : ["away", "home"];
    const fc = g.forecast
      ? `<div class="fc ${g.forecast.hit ? "hit" : "miss"}"><span class="mark">${g.forecast.hit ? "✓" : "✗"}</span>${escapeHtml(b.publicLabel.term)}: <b>${escapeHtml(g.forecast.pickLabel)} ${escapeHtml(g.forecast.probabilityDisplay)}</b>${g.forecast.hit ? "" : " · missed"}</div>`
      : "";
    return `<div class="game"><div class="teams">${order.map((s) => side(g, s)).join("")}</div>${fc}</div>`;
  }).join("");
  const t = b.tally;
  return {
    chip: `${LEAGUE[b.sport]} · FINAL${b.parts > 1 ? ` · ${b.part}/${b.parts}` : ""}`,
    rawHeadline: t ? `${escapeHtml(b.publicLabel.term)} <em>vs</em> Final` : `Final scores`,
    sub: b.dateLabel,
    rawGames: games,
    tally: t ? `Most likely result came in: ${t.hits} of ${t.count}${t.misses ? ` · ${t.misses} missed` : ""}` : "",
    rawDisc: t
      ? `Model Performance: ${escapeHtml(b.publicLabel.modelPerformanceNote)}<br>Not betting advice · gametimepicks.yashwantbalaji.com`
      : `Official finals${b.sport === "NBA" ? ", write-once record" : ""}.<br>gametimepicks.yashwantbalaji.com`,
    sourceName: SOURCE[b.sport],
    commit: b.sources[0]?.commit ? `@${b.sources[0].commit.slice(0, 12)}` : "",
  };
}

export function resultsAltText(b) {
  const lines = b.games.map((g) => `${g.away.name} ${g.away.score}, ${g.home.name} ${g.home.score}${g.forecast ? ` (${b.publicLabel.term}: ${g.forecast.pickLabel} ${g.forecast.probabilityDisplay}, ${g.forecast.hit ? "came in" : "missed"})` : ""}`);
  return `GameTimePicks ${b.sport} results graphic, ${b.dateLabel}. ${lines.join(". ")}.${b.tally ? ` Most likely result came in for ${b.tally.hits} of ${b.tally.count}. Model Performance: ${b.publicLabel.modelPerformanceNote}` : ""}`;
}

export async function renderResultsPng(b, { outFile }) {
  return renderHtmlToPng(fillTemplate(TEMPLATE, resultsSlots(b)), { outFile, template: RESULTS_TEMPLATE_ID, altText: resultsAltText(b) });
}
