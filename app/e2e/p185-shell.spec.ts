import { test, expect } from "@playwright/test";

/*
 * RELEASE C — the shell, asserted at real viewports.
 *
 * The bottom bar's overflow was invisible to every existing gate: the page did not scroll
 * horizontally (the bar is its own scroll container), the structural a11y audit passed, and the
 * unit tests cannot measure pixels. It took a viewport measurement to see that the trailing label
 * sat permanently half-cut behind a hidden scrollbar. So it gets a viewport guard.
 */

const PHONES = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
];

for (const p of PHONES) {
  test(`mobile bottom bar fits at ${p.name}px without clipping a label`, async ({ page }) => {
    await page.setViewportSize({ width: p.width, height: p.height });
    await page.goto("/today/");
    const ul = page.locator('nav[aria-label="Mobile bottom navigation"] ul');
    await expect(ul).toBeVisible();
    const m = await ul.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
      labels: [...el.querySelectorAll("li")].map((li) => (li as HTMLElement).innerText.trim()),
    }));
    expect(m.labels.length).toBeGreaterThanOrEqual(4);
    // The bar may still scroll as an escape hatch, but not by a whole item's width — that is the
    // state where a label is permanently cut and no affordance says so.
    expect(m.scroll - m.client, `bar overflows by ${m.scroll - m.client}px: ${m.labels.join(" · ")}`)
      .toBeLessThanOrEqual(8);
  });
}

test("bottom-bar tap targets clear the 44px class", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today/");
  const links = page.locator('nav[aria-label="Mobile bottom navigation"] a');
  const n = await links.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box!.height, `target ${i} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
  }
});

test("the visible short label is contained in the accessible name", async ({ page }) => {
  /* WCAG 2.5.3 Label in Name — a voice-control user says what they can see. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today/");
  const links = page.locator('nav[aria-label="Mobile bottom navigation"] a');
  for (let i = 0; i < (await links.count()); i++) {
    const l = links.nth(i);
    const visible = (await l.innerText()).trim().toLowerCase();
    const accessible = ((await l.getAttribute("aria-label")) ?? "").toLowerCase();
    expect(accessible, `"${visible}" is not inside "${accessible}"`).toContain(visible);
  }
});

test("the footer sitemap carries every live sport and product", async ({ page }) => {
  /*
   * The hand-written footer omitted UFC — a LIVE sport — along with EPL, Moonshot, Homer Nukes and
   * Mr. Dub. It is derived now; this asserts the rendered result, not the source.
   */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/today/");
  const map = page.locator('nav[aria-label="Site map"]');
  await expect(map).toBeVisible();
  // The static export writes trailing slashes ("/mlb/"), and production 308s to them — so match
  // both forms rather than pinning the one this build happens to emit.
  for (const href of ["/mlb", "/nfl", "/ufc", "/epl", "/bank-builder", "/moonshot", "/homer-nukes", "/mr-dub", "/results"]) {
    await expect(
      map.locator(`a[href="${href}"], a[href="${href}/"]`),
      `sitemap is missing ${href}`,
    ).toHaveCount(1);
  }
});

test("no page scrolls horizontally at any launch viewport", async ({ page }) => {
  for (const [w, h] of [[360, 780], [390, 844], [768, 1024], [1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const route of ["/", "/today/", "/markets/", "/bank-builder/"]) {
      await page.goto(route);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${route} at ${w}px overflows by ${over}px`).toBeLessThanOrEqual(0);
    }
  }
});
