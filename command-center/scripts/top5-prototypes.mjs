#!/usr/bin/env node
/**
 * TOP 5 FORMAT PROTOTYPES — renders both X formats from REAL official boards at one pinned data commit, plus an X-feed
 * mobile mock (~390 CSS px) of each, into command-center/docs/assets/top5/. Read-only on data; sends nothing.
 *
 *   node command-center/scripts/top5-prototypes.mjs [--commit <sha>] [--date YYYY-MM-DD]
 *
 *   Option A  one 1080×1350 image with every published market (render variant "combined")
 *   Option B  one X post with one 1080×1350 image per market (variant "board", ≤ 4 images)
 * The X layout in the mock (1 image at its own ratio; 2–4 images in a 16:9 grid: 2 side by side, 3 as 1 + 2, 4 as
 * 2 × 2, each tile centre-cropped) is X's long-standing web/app grid, approximated — check on a phone before deciding.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { nflWeekTop5 } from "../recap/top5-boards.mjs";
import { renderTop5Set } from "../render/social-top5.mjs";
import { groupMarkets, top5Captions } from "../contracts/top5-packages.mjs";
import { loadChromium, escapeHtml as esc } from "../render/render-png.mjs";
import { X_MARK } from "../render/social-v2.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const COMMIT = arg("--commit", "047c7f686b85a0739d823fec914e3d81cf6b84dc");
const DATE = arg("--date", "2026-10-29");
const OUT = path.join(CC_ROOT, "docs/assets/top5");

const src = gitDataSource(REPO_ROOT, COMMIT);
const model = nflWeekTop5({ src, date: DATE });
if (!model.ok || !model.markets.length) throw new Error(`no official weekly board: ${model.reason ?? model.reasons.join("; ")}`);
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.(png|html)$/.test(f)) fs.rmSync(path.join(OUT, f));

const { groups } = groupMarkets(model.markets);
const b = await renderTop5Set(model, groups, { outDir: OUT, fileBase: `option-b-${model.period}` });
const a = await renderTop5Set(model, [model.markets.slice(0, 3)], { outDir: OUT, fileBase: `option-a-${model.period}`, variant: "combined" });
const caption = top5Captions(model, groups.flat(), model.markets.length)[0].text;

const LOGO = path.relative(OUT, path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png")).split(path.sep).join("/");
/** Images are referenced by their file name next to the mock (no copies inlined). */
const img = (f) => encodeURI(f);
/** X's media layout for 1–4 images. */
function mediaHtml(files) {
  if (files.length === 1) return `<div class="m one"><img src="${img(files[0])}" alt=""></div>`;
  const cls = ["", "", "two", "three", "four"][files.length];
  return `<div class="m grid ${cls}">${files.map((f, i) => `<div class="t t${i + 1}"><img src="${img(f)}" alt=""></div>`).join("")}</div>`;
}
const post = (label, files, note) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=390">
<style>
*{box-sizing:border-box;margin:0;padding:0} body{width:390px;background:#000;color:#e7e9ea;font:15px/20px -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.bar{height:44px;border-bottom:1px solid #2f3336;display:flex;align-items:center;justify-content:center;font-weight:700}
.p{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid #2f3336}.av{width:40px;height:40px;border-radius:50%;background:#0b130e url(${LOGO}) center/90% no-repeat;flex:none}
.b{min-width:0;flex:1}.h{display:flex;gap:4px;white-space:nowrap;overflow:hidden}.n{font-weight:700}.g{color:#71767b}
.tx{white-space:pre-wrap;margin:2px 0 10px}.m{border:1px solid #2f3336;border-radius:16px;overflow:hidden}
.one img{display:block;width:100%;height:auto}
.grid{display:grid;gap:2px;aspect-ratio:16/9}.grid .t{overflow:hidden;min-height:0}.grid img{width:100%;height:100%;object-fit:cover;display:block}
.two{grid-template-columns:1fr 1fr}.three{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.three .t1{grid-row:1/3}.four{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.act{display:flex;justify-content:space-between;color:#71767b;margin-top:10px;font-size:13px}.lab{padding:10px 16px;color:#71767b;font-size:12px}
.x{width:16px;height:16px;color:#e7e9ea}
</style></head><body><div class="bar"><svg class="x" viewBox="0 0 1200 1227">${X_MARK.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg></div>
<div class="p"><div class="av"></div><div class="b"><div class="h"><span class="n">GameTimePicks</span><span class="g">@GameTimePicksHQ · 2h</span></div>
<div class="tx">${esc(caption)}</div>${mediaHtml(files)}<div class="act"><span>💬 12</span><span>🔁 8</span><span>♡ 64</span><span>📊 3.1K</span></div></div></div>
<div class="lab">${esc(label)} — mock of an X post at 390 px (iPhone width). ${esc(note)} Engagement numbers are placeholders.</div></body></html>`;
const open = (file, label) => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:390px;background:#000;color:#71767b;font:12px -apple-system,Helvetica,sans-serif}img{width:390px;display:block}p{padding:8px 12px}</style></head><body><img src="${img(file)}" alt=""><p>${esc(label)} — tapped open, full width at 390 px.</p></body></html>`;

const pages = {
  "x-preview-option-a.html": post("Option A · one combined image", a.map((m) => m.file), "One 4:5 image shows uncropped in the feed."),
  "x-preview-option-b.html": post(`Option B · ${b.length} images, one board each`, b.map((m) => m.file), "Multi-image grid: each tile is centre-cropped in the feed; a tap opens each board full-screen."),
  "x-open-option-a.html": open(a[0].file, "Option A"),
  "x-open-option-b.html": open(b[0].file, "Option B, image 1"),
};
const browser = await loadChromium().launch();
try {
  for (const [f, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(OUT, f), html);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.goto(`file://${path.join(OUT, f)}`, { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUT, f.replace(/\.html$/, ".png")), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }

// effective text sizes on a 390 px phone: feed (post media ≈ 390 − 16·2 − 48 = 310 px wide) and opened (390 px)
const FEED = 310;
const report = {
  dataCommit: COMMIT, date: DATE, period: model.period, board: model.evidence.at(-1),
  optionA: { files: a.map((m) => m.file), minFontPx1080: a[0].minFontPx, nameFontPx1080: 34, feedNamePx: +(34 * FEED / 1080).toFixed(1), openNamePx: +(34 * 390 / 1080).toFixed(1) },
  optionB: { files: b.map((m) => m.file), minFontPx1080: Math.min(...b.map((m) => m.minFontPx)), nameFontPx1080: 54, feedTileNamePx: +(54 * (FEED / 2) / 1080).toFixed(1), openNamePx: +(54 * 390 / 1080).toFixed(1) },
  caption,
};
fs.writeFileSync(path.join(OUT, "prototypes.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
