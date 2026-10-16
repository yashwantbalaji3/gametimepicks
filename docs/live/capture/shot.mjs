// Screenshots of /live and each event's game page at 390 px and 1440 px (read-only). Run from app/ so playwright
// resolves. Prints one JSON line per shot for captures.jsonl.
//   node shot.mjs <out dir> <pass stamp> <espnId[,espnId…]>
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const pw = await import(pathToFileURL(createRequire(`${process.cwd()}/`).resolve("playwright")).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const [out, t, evArg] = process.argv.slice(2);
const events = String(evArg ?? "").split(",").filter(Boolean);
setTimeout(() => { console.log(JSON.stringify({ t, name: "screenshots", ok: false, err: "timed out" })); process.exit(1); }, 90_000 + 60_000 * (1 + events.length)).unref();
const B = process.env.GTP_BASE || "https://gametimepicks.yashwantbalaji.com";
const pages = [["live", `${B}/live/`, null], ...events.map((ev) => ["game", `${B}/nfl/game/${ev}/`, ev])];
const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, url, ev] of pages) {
    const file = ev ? `${t}-${name}-${ev}-${w}.png` : `${t}-${name}-${w}.png`;
    let ok = false, overflow = null, imgs = null, err = null;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500); // one client poll settles
      overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      imgs = await page.evaluate(() => { const all = [...document.images]; return { total: all.length, broken: all.filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).length, headshots: all.filter((i) => /headshot|\/i\/headshots\//.test(i.src)).length, logos: all.filter((i) => /teamlogos|\/logos?\//.test(i.src)).length }; });
      await page.screenshot({ path: `${out}/${file}`, fullPage: true });
      ok = true;
    } catch (e) { err = String(e?.message ?? e).slice(0, 200); }
    // `name` stays shot-<page>-<width> (the report's key); `event` says which game page it was.
    console.log(JSON.stringify({ t, name: `shot-${name}-${w}`, ...(ev ? { event: ev } : {}), ok, file, horizontalOverflowPx: overflow, images: imgs, err }));
  }
  await ctx.close();
}
await browser.close();
