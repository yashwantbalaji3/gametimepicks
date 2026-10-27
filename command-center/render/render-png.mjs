/**
 * CREATIVE RENDERER — fact bundle → HTML template → 1080×1350 PNG, offline and deterministic.
 *
 * Playwright and its Chromium come from the app's existing devDependency (app/node_modules, `npm ci` in app/);
 * no new dependency is added. Every request the page makes is aborted, so the render cannot fetch anything — the
 * logo is inlined as a data URI and fonts fall back to locally installed faces. Same bundle in, same bytes out on
 * the same machine (asserted in tests/render.test.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { REPO_ROOT, CC_ROOT, sha256 } from "../lib/util.mjs";
import { nflTeamColor } from "../../app/src/lib/simulation-theater/nfl-team-colors.mjs";
import { claimOf, display } from "../recap/fact-bundle-nfl.mjs";

export const TEMPLATE_ID = "nfl-recap@0";
export const SIZE = Object.freeze({ width: 1080, height: 1350 });
const TEMPLATE_PATH = path.join(CC_ROOT, "render/templates/nfl-recap.html");
const LOGO_PATH = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function teamPaint(abbr) {
  const c = nflTeamColor(abbr);
  return { color: c?.primary ?? "#3A3F4B", ink: c?.ink ?? "#FFFFFF" };
}

/** The template slots, all from display strings. Exported so tests can check them without a browser. */
export function templateSlots(bundle) {
  const { home, away } = bundle.teams;
  const fav = bundle.favouredSide === "home" ? home : away;
  const result = claimOf(bundle, "result.side").value;
  const inside = claimOf(bundle, "result.totalInsideRange").value;
  const homeFinal = Number(display(bundle, "final.home"));
  const awayFinal = Number(display(bundle, "final.away"));
  const hp = teamPaint(home.abbr);
  const ap = teamPaint(away.abbr);
  const modelLine = bundle.model.statusAtPublish === "PUBLIC_EXPERIMENTAL" ? "Experimental model" : "Model forecast";
  return {
    chip: `NFL${bundle.week ? ` · WEEK ${bundle.week}` : ""} · FINAL`,
    homeColor: hp.color, homeInk: hp.ink, awayColor: ap.color, awayInk: ap.ink,
    homeAbbr: home.abbr, homeName: home.name, awayAbbr: away.abbr, awayName: away.name,
    homeFinal: display(bundle, "final.home"), awayFinal: display(bundle, "final.away"),
    homeWinnerClass: homeFinal > awayFinal ? "winner" : "", awayWinnerClass: awayFinal > homeFinal ? "winner" : "",
    frozenAt: display(bundle, "frozenAt"),
    favPct: display(bundle, "favoured.winProbability"),
    favName: fav.name,
    barWidth: display(bundle, "favoured.winProbability"),
    projHome: display(bundle, "projected.home"), projAway: display(bundle, "projected.away"),
    projTotal: display(bundle, "projected.total"), totalRange: display(bundle, "projected.totalRange"),
    sideVerdictClass: result === "WIN" ? "hit" : "miss",
    sideMark: result === "WIN" ? "✓" : "✗",
    sideVerdict: result === "WIN" ? `Forecast favourite won: ${fav.name}` : result === "LOSS" ? `Forecast missed: ${fav.name} lost` : "Game ended in a tie",
    totalVerdictClass: inside ? "hit" : "miss",
    totalMark: inside ? "✓" : "✗",
    totalVerdict: `Total ${inside ? "inside" : "outside"} the 80% range: ${display(bundle, "final.total")} scored vs ${display(bundle, "projected.total")} projected`,
    modelLine,
    disclaimer: bundle.disclaimer,
    snapshotId: bundle.snapshotId,
  };
}

export function altText(bundle) {
  const s = templateSlots(bundle);
  return `GameTimePicks recap graphic. Final: ${s.awayName} ${s.awayFinal}, ${s.homeName} ${s.homeFinal}. ` +
    `Pregame forecast frozen ${s.frozenAt}: ${s.favName} ${s.favPct} to win; projected ${s.homeAbbr} ${s.projHome}, ${s.awayAbbr} ${s.projAway}; ` +
    `projected total ${s.projTotal} (80% range ${s.totalRange}). ${s.sideVerdict}. ${s.totalVerdict}. ${s.modelLine}. ${s.disclaimer}`;
}

export function renderHtml(bundle) {
  const slots = templateSlots(bundle);
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
  const html = fs.readFileSync(TEMPLATE_PATH, "utf8").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === "logoDataUri") return logo;
    if (!(key in slots)) throw new Error(`template slot {{${key}}} has no value`);
    return escapeHtml(slots[key]);
  });
  return html;
}

function loadChromium() {
  const require = createRequire(path.join(REPO_ROOT, "app/package.json"));
  try {
    return require("@playwright/test").chromium;
  } catch {
    throw new Error("Playwright is not installed for app/. Run `npm ci` in app/ (no tracked changes) and retry.");
  }
}

/** PNG width/height from the IHDR chunk. */
export function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Render one bundle to PNG. Returns the media artifact; `file` is the bare file name, so records do not depend on
 * where the output directory happens to be.
 * @param {object} bundle
 * @param {{ outFile: string }} opts
 */
export async function renderPng(bundle, { outFile }) {
  const html = renderHtml(bundle);
  const chromium = loadChromium();
  const browser = await chromium.launch({ args: ["--disable-background-networking", "--no-first-run", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    const size = pngSize(png);
    return {
      schema: "gtp.cc.media-artifact@1",
      template: TEMPLATE_ID,
      file: path.basename(outFile),
      mime: "image/png",
      width: size.width,
      height: size.height,
      sha256: sha256(png),
      htmlSha256: sha256(html),
      altText: altText(bundle),
    };
  } finally {
    await browser.close();
  }
}
