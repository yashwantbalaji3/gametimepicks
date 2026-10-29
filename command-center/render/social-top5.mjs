/**
 * TOP 5 BOARDS RENDERER — official Top Board model (recap/top5-boards.mjs) → 1080×1350 PNG(s). gtp-social-top5@1.0.
 *
 * NEW DESIGN VERSION, NOT APPROVED: TOP5_TEMPLATE needs its own founder design approval (per-template approvals,
 * orchestrator/queue-flow.mjs DESIGNS); no gtp-social@2.3.x approval carries over, and every post still needs its own
 * publishing approval.
 *
 *   variant "board"     one market per image — the X multi-image post (≤ 4 images, publishers/x-api.mjs MAX_IMAGES)
 *   variant "combined"  up to three markets on one image — the single-image alternative (format evaluation, prototype)
 *
 * Shares the V2.3 brand assets (bundled OFL fonts, the GameTimePicks logo inlined from app/public/brand, the X mark +
 * @GameTimePicksHQ, the sport's one disclosure line) and the offline renderer pattern (every request aborted). Each
 * image shows the logo, the sport + period, the market and its ranking basis, and @GameTimePicksHQ with the X mark.
 * Same model + fonts on one machine → same bytes. The render FAILS if any text still overflows after the fit pass.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { escapeHtml as esc, loadChromium, pngSize } from "./render-png.mjs";
import { DISCLOSURES, SOCIAL_HANDLE, X_MARK, fontFaces, inkOn } from "./social-v2.mjs";
import { nflTeamColor } from "../../app/src/lib/simulation-theater/nfl-team-colors.mjs";
import { formsForGroup } from "../recap/player-names.mjs";
import { etShort } from "../recap/top5-boards.mjs";

export const TOP5_TEMPLATE = "gtp-social-top5@1.0";
const DIR = path.join(CC_ROOT, "render/templates/social-top5");
export const TOP5_ASSET_MANIFEST = JSON.parse(fs.readFileSync(path.join(DIR, "asset-manifest.json"), "utf8")).manifestVersion;
export const TOP5_TEMPLATE_STATUS = "PROTOTYPE — needs the founder's design approval; each post still needs its own approval";
export const TOP5_VARIANTS = Object.freeze({ board: { width: 1080, height: 1350, maxMarkets: 1 }, combined: { width: 1080, height: 1350, maxMarkets: 3 } });
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");
/** One disclosure per sport (the V2.3 lines; Ligue 1 added in the same words). */
export const TOP5_DISCLOSURES = Object.freeze({ ...DISCLOSURES, LIGUE1: "Model projections · Not betting advice · Not affiliated with Ligue 1 or its clubs" });
const SPORT_CHIP = { NFL: "NFL", NBA: "NBA", MLB: "MLB", UFC: "UFC", EPL: "Premier League", LIGUE1: "Ligue 1" };

const teamPaint = (sport, abbr) => {
  const c = sport === "NFL" ? nflTeamColor(abbr) : null;
  const color = c?.primary ?? "#2A302C";
  return { color, ink: inkOn(color, c?.ink ?? "#F7F7F2"), edge: c && c.accent !== c.primary ? c.accent : "rgba(255,255,255,.18)", accent: c?.accent ?? "#39FF88" };
};
const tag = (sport, team) => { const p = teamPaint(sport, team); return `<span class="tag" style="--c:${esc(p.color)};--cink:${esc(p.ink)};--edge:${esc(p.edge)}">${esc(team)}</span>`; };
const pname = (name, group, forms) => `<span class="pname" data-name-group="${esc(group)}" data-forms="${esc(JSON.stringify(forms))}">${esc(forms[0])}</span>`;
/** The chip: sport + the post's period ("NFL · Week 8", "NBA · Thu, Oct 30"). */
export const chipOf = (model) => `${SPORT_CHIP[model.sport] ?? model.sport} · ${model.scope === "week" ? model.weekLabel : model.slateLine}`;
const logoUri = () => `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
const foot = (sport) => {
  const d = TOP5_DISCLOSURES[sport];
  if (!d) throw new Error(`no disclosure configured for ${sport}: no graphic`);
  return `<div class="foot"><div class="social" data-handle="${esc(SOCIAL_HANDLE)}">${X_MARK}<span>${esc(SOCIAL_HANDLE)}</span></div><div class="disclosure" data-fit>${esc(d)}</div></div>`;
};

function boardBody(model, market, { index, count }) {
  const forms = formsForGroup(market.rows.map((r) => r.name));
  const kicker = `Top ${market.rows.length} · ${model.scope === "week" ? model.weekLabel : model.slateLine}`;
  return `
    <div class="top"><img class="logo" src="${logoUri()}" alt=""><div class="topr"><div class="chip" data-fit>${esc(chipOf(model))}</div>${count > 1 ? `<div class="pager">${index + 1}/${count}</div>` : ""}</div></div>
    <div class="kicker" data-fit>${esc(kicker)}</div>
    <h1 class="title" data-fit data-market="${esc(market.market)}">${esc(market.title)}</h1>
    <div class="method" data-fit data-method="${esc(market.methodId)}">${esc(market.note)}</div>
    <div class="rows">${market.rows.map((r, i) => `<div class="row r${r.rank}" data-rank="${r.rank}" data-player="${esc(r.playerId)}" style="--c:${esc(teamPaint(model.sport, r.team).accent)}">
      <div class="rk">${r.rank}</div>
      <div class="who">${pname(r.name, "board", forms[i])}<div class="meta">${tag(model.sport, r.team)}<span>${r.opponent ? `vs ${esc(r.opponent)} · ` : ""}${r.kickoffUtc ? esc(etShort(r.kickoffUtc)) : ""}</span></div></div>
      <div class="val"><b data-fit>${esc(r.display)}</b><span>${esc(market.unit)}</span></div></div>`).join("")}</div>
    ${foot(model.sport)}`;
}

function combinedBody(model, markets) {
  return `
    <div class="top"><img class="logo" src="${logoUri()}" alt=""><div class="topr"><div class="chip" data-fit>${esc(chipOf(model))}</div></div></div>
    <div class="head"><h1 class="title" data-fit>Top 5 boards</h1></div>
    <div class="panels">${markets.map((m) => {
      const forms = formsForGroup(m.rows.map((r) => r.name));
      return `<section class="panel" data-market="${esc(m.market)}"><div class="ph"><h2 data-fit>${esc(m.title)}</h2><span data-fit>${esc(m.methodLabel)}</span></div>
        ${m.rows.map((r, i) => `<div class="row" data-rank="${r.rank}"><div class="rk">${r.rank}</div>${pname(r.name, `c-${m.market}`, forms[i])}${tag(model.sport, r.team)}<div class="val" data-fit>${esc(r.display)}${m.method === "probability" ? "" : `<small>${esc(m.unit.replace("PROJ. ", ""))}</small>`}</div></div>`).join("")}</section>`;
    }).join("")}</div>
    ${foot(model.sport)}`;
}

/** The HTML of one image (exported so tests can check content without a browser). */
export function top5Html(model, markets, { variant = "board", index = 0, count = 1 } = {}) {
  const v = TOP5_VARIANTS[variant];
  if (!v) throw new Error(`unknown variant ${variant}`);
  if (!markets.length || markets.length > v.maxMarkets) throw new Error(`${markets.length} market(s) on a ${variant} image (max ${v.maxMarkets})`);
  if (new Set(markets.map((m) => m.method)).size > 1 && variant === "board") throw new Error("one image never mixes ranking methodologies");
  const body = variant === "board" ? boardBody(model, markets[0], { index, count }) : combinedBody(model, markets);
  const slots = { rawCss: `${fontFaces()}\n${fs.readFileSync(path.join(DIR, "top5.css"), "utf8")}`, rawBody: body, variant, template: TOP5_TEMPLATE };
  return fs.readFileSync(path.join(DIR, "top5.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`slot {{${k}}} has no value`);
    return k.startsWith("raw") ? slots[k] : esc(slots[k]);
  });
}

/** Alt text for one image: every row, in the published order. */
export function top5AltText(model, markets) {
  return `GameTimePicks ${chipOf(model)} Top 5: ${markets.map((m) => `${m.title} (${m.methodLabel.toLowerCase()}): ${m.rows.map((r) => `${r.rank}. ${r.name} ${r.team} ${r.display}`).join("; ")}`).join(". ")}.`.slice(0, 1000);
}

/**
 * Render a set of images, one per group of markets, with one browser.
 * @param {Array<Array<object>>} groups  markets per image, in order
 * @returns media records, in order
 */
export async function renderTop5Set(model, groups, { outDir, fileBase, variant = "board" }) {
  const browser = await loadChromium().launch({ args: ["--disable-background-networking", "--no-first-run", "--font-render-hinting=none"] });
  const out = [];
  try {
    for (const [index, markets] of groups.entries()) {
      const html = top5Html(model, markets, { variant, index, count: groups.length });
      const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const fit = await page.evaluate(() => window.__runFit());
      const bad = fit.items.filter((i) => !i.fits);
      if (bad.length || fit.pageOverflow) throw new Error(`text does not fit: ${bad.map((x) => x.text).join(" | ") || "page overflow"}`);
      const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      await page.close();
      const hash = sha256(png);
      const file = `${fileBase}-${variant}-${index + 1}-${hash.slice(0, 12)}.png`;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, file), png);
      out.push({ schema: "gtp.cc.media-artifact@1", template: TOP5_TEMPLATE, templateStatus: TOP5_TEMPLATE_STATUS, assetManifest: TOP5_ASSET_MANIFEST, variant, format: `top5-${variant}`,
        markets: markets.map((m) => m.market), file, mime: "image/png", ...pngSize(png), sha256: hash, htmlSha256: sha256(html), minFontPx: fit.minFontPx, altText: top5AltText(model, markets) });
    }
  } finally {
    await browser.close();
  }
  return out;
}
