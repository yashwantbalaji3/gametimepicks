/**
 * THE BRAND ASSETS AND THE CODE THAT SIZES THEM MUST AGREE.
 *
 * BrandMark derives the logo's rendered width from a hardcoded aspect ratio. That ratio was
 * 1672x941 for the previous mark; the current one is 600x450 — a stacked lockup rather than a wide
 * one, a 33% difference. A logo swapped without updating the constant renders visibly stretched or
 * leaves a gap beside itself, and nothing fails: the image loads, the page builds, the layout is
 * just wrong.
 *
 * These read the committed files rather than trusting the constants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const BRAND = path.join(APP, "public", "brand");
const SRC = fs.readFileSync(path.join(APP, "src", "components", "brand-mark.tsx"), "utf8");

/** PNG dimensions straight from the IHDR — no image library needed for a header read. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString("ascii"), "PNG", `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test("the hardcoded logo ratio matches the committed asset", () => {
  const { width, height } = pngSize(path.join(BRAND, "gametime-picks-logo.png"));
  const declaredW = Number(/const LOGO_W = (\d+)/.exec(SRC)?.[1]);
  const declaredH = Number(/const LOGO_H = (\d+)/.exec(SRC)?.[1]);
  assert.ok(declaredW && declaredH, "BrandMark must declare the logo's dimensions");
  assert.equal(declaredW, width, `BrandMark says ${declaredW}px wide; the asset is ${width}px`);
  assert.equal(declaredH, height, `BrandMark says ${declaredH}px tall; the asset is ${height}px`);
});

test("the WebP source and the PNG fallback are the same mark", () => {
  const webp = path.join(BRAND, "gametime-picks-logo.webp");
  if (!fs.existsSync(webp)) return;              // PNG-only is a valid state
  // A <source> the browser prefers must not be a different image from the <img> it replaces.
  const b = fs.readFileSync(webp);
  assert.equal(b.subarray(0, 4).toString("ascii"), "RIFF", "not a WebP");
  assert.equal(b.subarray(8, 12).toString("ascii"), "WEBP", "RIFF container is not WebP");

  /*
   * Dimensions are only read for the VP8X extended header, which is what an alpha WebP uses and
   * what is committed here. The first version of this check assumed VP8L offsets and reported a
   * correct asset as mismatched — a parser that cannot read the format it is given condemns working
   * files, which is how a guard earns the right to be ignored. Other chunk types are skipped
   * rather than guessed at.
   */
  const png = pngSize(path.join(BRAND, "gametime-picks-logo.png"));
  if (b.subarray(12, 16).toString("ascii") === "VP8X") {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    assert.equal(w, png.width, "the WebP is a different width from the PNG it replaces");
    assert.equal(h, png.height, "the WebP is a different height from the PNG it replaces");
  }
  // And it must actually be smaller, or it is complexity buying nothing.
  assert.ok(fs.statSync(webp).size < fs.statSync(path.join(BRAND, "gametime-picks-logo.png")).size,
    "the WebP is not smaller than the PNG — the <picture> element is pure overhead");
});

test("the logo the site loads is sized for the site, not for print", () => {
  /*
   * The source mark was 1536px and 2.1MB, for something whose largest render is the 104px desktop
   * rail. It loads on every page. A brand asset an order of magnitude bigger than any surface that
   * draws it is a page-weight problem wearing a design label.
   */
  const png = path.join(BRAND, "gametime-picks-logo.png");
  const { width } = pngSize(png);
  const biggestRender = Math.max(...[...SRC.matchAll(/is(?:Rail|Hero|Compact)\s*\?\s*(\d+)/g)].map((m) => Number(m[1])), 54);
  assert.ok(width <= biggestRender * 8,
    `the logo is ${width}px for a largest render of ${biggestRender}px — more than 8x is waste on every page load`);
  assert.ok(width >= biggestRender * 2, `the logo is ${width}px for a ${biggestRender}px render — too small for a 2x display`);
});

test("the social card is flattened and correctly proportioned", () => {
  const og = path.join(BRAND, "gametime-picks-og.png");
  assert.ok(fs.existsSync(og), "no social card — scrapers would fall back to the transparent mark");
  const { width, height } = pngSize(og);
  assert.equal(width, 1200, "Open Graph cards are 1200x630");
  assert.equal(height, 630);

  // Metadata must point at the CARD, not the transparent mark: scrapers composite onto white,
  // where a dark chrome logo with a green glow largely disappears.
  const layout = fs.readFileSync(path.join(APP, "src", "app", "layout.tsx"), "utf8");
  assert.match(layout, /gametime-picks-og\.png/, "layout metadata must use the social card");
  const ogBlock = layout.slice(layout.indexOf("openGraph"), layout.indexOf("robots"));
  assert.doesNotMatch(ogBlock, /gametime-picks-logo\.png/, "the transparent mark must not be the social image");
});

test("the CSS lockup is still there as the last-resort fallback", () => {
  // The image branch has an onError. If the asset ever 404s the site must still read its own name,
  // and that fallback is real text so a screen reader gets it either way.
  assert.match(SRC, /setImgErrored\(true\)/, "the image must fall back on error");
  assert.match(SRC, /gtp-neon-wordmark/, "the CSS wordmark fallback must not be deleted");
  assert.match(SRC, /alt="GameTime Picks"/, "the logo needs a real alt");
});
