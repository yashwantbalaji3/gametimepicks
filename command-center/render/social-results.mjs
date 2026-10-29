/**
 * "PREDICTED WINNER vs FINAL" RESULTS GRAPHIC — results-accuracy bundle (recap/results-accuracy.mjs) → PNG.
 *
 * NEW DESIGN VERSION, NOT APPROVED: RESULTS_TEMPLATE (gtp-social-results@1.1) is its own version; 1.0 was never approved. No approval of
 * gtp-social@2.3.2 (or of the gtp-social-accuracy@0.1 prototype) carries over; it needs its own founder design approval,
 * and every post still needs its own publishing approval.
 *
 * Shares the V2.3 brand assets (bundled OFL fonts, the GameTimePicks logo inlined from app/public/brand, the X mark +
 * @GameTimePicksHQ, the NBA disclosure) and the offline renderer pattern (render-png.mjs: every request aborted, no
 * remote asset). No league or club logo, no player photo: a team is its abbreviation on its verified colour
 * (app/src/lib/simulation-theater/nba/nba-team-colors.json via nbaTeamOf).
 *
 * Variants: "portrait" 1080×1350 (one column, up to ~14 games) and "square" 1080×1080 (two columns, up to 12 games).
 * A deterministic fit pass may shrink [data-fit] lines; the render FAILS if any text, row or the page still overflows.
 * Same bundle + fonts on one machine → same PNG bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { escapeHtml as esc, loadChromium, pngSize } from "./render-png.mjs";
import { ASSET_MANIFEST, SOCIAL_HANDLE, X_MARK, disclosureFor, fontFaces, inkOn } from "./social-v2.mjs";
import { nbaTeamOf } from "../recap/social-v2.mjs";

// 1.1 (founder 10-29): no sample-size subtitle, no context / estimate lines on the image (they stay in the bundle, docs and
// captions); the third KPI is the day's accuracy (one decimal) with the graded-game count as its label. Sport adapters.
export const RESULTS_TEMPLATE = "gtp-social-results@1.1";
/** Design status, printed nowhere on the graphic: carried in the media record so no surface can call it approved. */
export const RESULTS_TEMPLATE_STATUS = "PROTOTYPE — needs the founder's design approval; each post still needs its own approval";
export const RESULTS_ASSET_MANIFEST = ASSET_MANIFEST;
export const VARIANTS = Object.freeze({ portrait: { width: 1080, height: 1350, maxGames: 14 }, square: { width: 1080, height: 1080, maxGames: 12 } });
const DIR = path.join(CC_ROOT, "render/templates/social-results");
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");

/**
 * SPORT ADAPTERS — everything sport-specific the card needs. A new sport (NFL, MLB, UFC, soccer) adds an entry here and a
 * data builder that emits the same results-accuracy bundle; the template itself is sport-agnostic. An adapter supplies:
 *   league      the chip's league label ("NBA", "Premier League")
 *   teamOf(t)   { abbr, name } → { abbr, color, ink, accent } from VERIFIED colour data (never scraped, no logos)
 *   finalsWord  the chip's result word ("Finals", "Full time")
 *   separator   between away and home in a row ("–"); soccer may also order home-first via homeFirst: true
 *   ties        false when the sport cannot draw (a draw/tie needs its own pill, not implemented)
 * The disclosure comes from render/social-v2.mjs DISCLOSURES[sport] (one footer per sport).
 */
export const SPORT_ADAPTERS = Object.freeze({
  NBA: { league: "NBA", teamOf: (t) => nbaTeamOf(t.abbr, t.name), finalsWord: "Finals", separator: "–", homeFirst: false, ties: false },
});
const adapterOf = (sport) => {
  const a = SPORT_ADAPTERS[sport];
  if (!a) throw new Error(`no results-card adapter for ${sport}`);
  return a;
};
const paint = (t, adapter) => {
  const team = adapter.teamOf(t);
  // a near-black team colour gets its accent as an outline so the chip still reads on the dark card
  return { ...team, cink: inkOn(team.color, team.ink ?? "#F7F7F2"), edge: team.accent !== team.color ? team.accent : "rgba(255,255,255,.14)" };
};
const chip = (t) => `<div class="tchip" data-team="${esc(t.abbr)}" style="--c:${esc(t.color)};--cink:${esc(t.cink)};--edge:${esc(t.edge)}">${esc(t.abbr)}</div>`;
const MARK = { hit: "✓", miss: "✕" };

function rowHtml(g, variant, adapter) {
  const away = paint(g.away, adapter);
  const home = paint(g.home, adapter);
  const pred = g.predictedSide === "home" ? home : away;
  const out = g.correct ? "hit" : "miss";
  const score = `<div class="score">${chip(away)}<div class="pts ${g.actualSide === "away" ? "w" : ""}">${esc(g.finalAway)}</div><div class="dash">${esc(adapter.separator)}</div><div class="pts ${g.actualSide === "home" ? "w" : ""}">${esc(g.finalHome)}</div>${chip(home)}</div>`;
  const pct = g.estimateDisplay ? `<div class="pct">${esc(g.estimateDisplay)}</div>` : `<div class="pct none">—</div>`;
  const res = `<div class="res ${out}" data-result="${out}"><span class="m">${MARK[out]}</span>${g.correct ? "Correct" : "Missed"}</div>`;
  const attrs = `class="row ${out}" data-event="${esc(g.eventId)}" data-outcome="${out}"`;
  if (variant === "square") {
    return `<div ${attrs}><i class="stripe"></i>${score}<div class="line2"><div class="pred"><span class="k">Predicted</span>${chip(pred)}${pct}</div>${res}</div></div>`;
  }
  return `<div ${attrs}><i class="stripe"></i>${score}<div class="pred">${chip(pred)}${pct}</div>${res}</div>`;
}

/** The card's HTML (exported so tests can check content without a browser). */
export function resultsHtml(b, { variant = "portrait" } = {}) {
  if (b?.schema !== "gtp.cc.results-accuracy@1" || !b.ok) throw new Error(`not a results-accuracy bundle: ${b?.schema ?? b?.reason}`);
  const v = VARIANTS[variant];
  if (!v) throw new Error(`unknown variant ${variant}`);
  const adapter = adapterOf(b.sport);
  if (!b.total) throw new Error(`no graded game on ${b.date}: no graphic`);
  if (b.total > v.maxGames) throw new Error(`${b.total} games do not fit the ${variant} card (max ${v.maxGames})`);
  const bar = [...Array(b.correct).fill("hit"), ...Array(b.missed).fill("miss")].map((c) => `<i class="${c}"></i>`).join("");
  const excl = b.excluded.length
    ? `<div class="excl" data-fit>Not graded: ${b.excluded.slice(0, 3).map((x) => `<b>${esc(x.game)}</b> (${esc(x.code === "NO_OFFICIAL_FINAL" ? "no final yet" : x.code === "NO_PUBLISHED_FORECAST" ? "no published prediction" : "not eligible")})`).join(", ")}${b.excluded.length > 3 ? ` and ${b.excluded.length - 3} more` : ""}</div>`
    : "";
  const body = `
    <div class="top"><img class="logo" src="data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}" alt=""><div class="chip" data-fit>${esc(adapter.league)} · ${esc(b.dateLabel)} · ${esc(adapter.finalsWord)}</div></div>
    <h1 class="title" data-fit>Predicted winner <em>vs</em> final</h1>
    <section class="tally" data-correct="${b.correct}" data-missed="${b.missed}" data-total="${b.total}" data-accuracy="${esc(b.accuracyDisplay)}">
      <div class="stats">
        <div class="stat acc"><b>${esc(b.accuracyDisplay)}</b><span>Accuracy</span><small class="graded" data-fit>${b.correct} of ${b.total} graded game${b.total === 1 ? "" : "s"}</small></div><i class="sep"></i>
        <div class="stat hit"><b>${b.correct}</b><span>Correct</span></div><i class="sep"></i>
        <div class="stat miss"><b>${b.missed}</b><span>Missed</span></div>
      </div>
      <div class="tbar" aria-hidden="true">${bar}</div>
    </section>
    ${variant === "portrait" ? `<div class="cols"><span></span><span>Final · away – home</span><span>Predicted</span><span>Result</span></div>` : ""}
    <div class="rows" style="--per-col:${Math.ceil(b.total / 2)}">${b.games.map((g) => rowHtml(g, variant, adapter)).join("")}</div>
    ${excl}
    <div class="foot">
      <div class="social" data-handle="${esc(SOCIAL_HANDLE)}">${X_MARK}<span>${esc(SOCIAL_HANDLE)}</span></div>
      <div class="disclosure" data-fit>${esc(disclosureFor(b.sport))}</div>
    </div>`;
  const slots = {
    rawCss: `${fontFaces()}\n${fs.readFileSync(path.join(DIR, "results.css"), "utf8")}`, rawBody: body, variant, height: String(v.height), template: RESULTS_TEMPLATE,
  };
  return fs.readFileSync(path.join(DIR, "results.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`slot {{${k}}} has no value`);
    return k.startsWith("raw") ? slots[k] : esc(slots[k]);
  });
}

/** Alt text: every game, misses named as misses. */
export function resultsAltText(b) {
  const line = (g) => `${g.away.abbr} ${g.finalAway}, ${g.home.abbr} ${g.finalHome}: predicted ${g.predictedWinner}${g.estimateDisplay ? ` (${g.estimateDisplay} estimate)` : ""}, ${g.correct ? "correct" : "missed"}`;
  return `GameTimePicks ${b.sport} predicted winner vs final, ${b.dateLabel}: ${b.accuracyDisplay} accuracy, ${b.correct} correct, ${b.missed} missed, ${b.correct} of ${b.total} graded games. ${b.games.map(line).join("; ")}. ${b.contextLine}`;
}

/**
 * Render one variant. Refuses (throws) when any text or row overflows after fitting.
 * @returns media record: template, variant, file, width, height, sha256, htmlSha256, approved:false
 */
export async function renderResults(b, { outFile, variant = "portrait" }) {
  const html = resultsHtml(b, { variant });
  const { width, height } = VARIANTS[variant];
  const browser = await loadChromium().launch({ args: ["--disable-background-networking", "--no-first-run", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const fit = await page.evaluate(() => window.__runFit());
    const bad = fit.items.filter((i) => !i.fits);
    if (bad.length || fit.pageOverflow) throw new Error(`text does not fit: ${bad.map((x) => x.text).join(" | ") || "page overflow"}`);
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    return {
      schema: "gtp.cc.media-artifact@1", template: RESULTS_TEMPLATE, templateStatus: RESULTS_TEMPLATE_STATUS, designApproved: false, assetManifest: RESULTS_ASSET_MANIFEST,
      variant, file: path.basename(outFile), mime: "image/png", ...pngSize(png), sha256: sha256(png), htmlSha256: sha256(html),
      dataCommit: b.dataSource?.commit ?? null, altText: resultsAltText(b), minFontPx: fit.minFontPx,
    };
  } finally {
    await browser.close();
  }
}
