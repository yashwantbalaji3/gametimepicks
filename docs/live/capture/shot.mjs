// Screenshots of /live and the game page at 390 px and 1440 px (read-only). Run from app/ so playwright resolves.
// Prints one JSON line per shot for captures.jsonl.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const pw = await import(pathToFileURL(createRequire(`${process.cwd()}/`).resolve("playwright")).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const [out, t, ev] = process.argv.slice(2);
setTimeout(() => { console.log(JSON.stringify({ t, name: "screenshots", ok: false, err: "timed out after 150 s" })); process.exit(1); }, 150_000).unref();
const B = "https://gametimepicks.yashwantbalaji.com";
const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, url] of [["live", `${B}/live/`], ["game", `${B}/nfl/game/${ev}/`]]) {
    const file = `${t}-${name}-${w}.png`;
    let ok = false, overflow = null, imgs = null, err = null;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500); // one client poll settles
      overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      imgs = await page.evaluate(() => { const all = [...document.images]; return { total: all.length, broken: all.filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).length, headshots: all.filter((i) => /headshot|\/i\/headshots\//.test(i.src)).length, logos: all.filter((i) => /teamlogos|\/logos?\//.test(i.src)).length }; });
      await page.screenshot({ path: `${out}/${file}`, fullPage: true });
      ok = true;
    } catch (e) { err = String(e?.message ?? e).slice(0, 200); }
    console.log(JSON.stringify({ t, name: `shot-${name}-${w}`, ok, file, horizontalOverflowPx: overflow, images: imgs, err }));
  }
  await ctx.close();
}
await browser.close();
