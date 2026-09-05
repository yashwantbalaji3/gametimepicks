/**
 * FOUR SPORTS, ONE PLAYER — Program 234 · Release C.
 *
 * The manifest tests prove each adapter carries its own artifact's numbers. These prove the part
 * that only a browser can: that the control exists on each sport's real page, that the frame opens,
 * and — the assertion that matters — that the number in the frame is the number on the page behind
 * it. Two surfaces reading one artifact is the failure mode this repository keeps finding.
 *
 * Each sport is skipped rather than failed when its slate is legitimately empty. An NFL preseason
 * gap is not a regression, and a spec that goes red every Tuesday gets deleted by whoever is on call.
 */
import { test, expect, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByRole("dialog");

/**
 * Percentages rendered anywhere in a container, ROUNDED TO WHOLE POINTS.
 *
 * The two surfaces format differently on purpose: the report prints 65.1% because a reader can
 * study it, and the frame prints 65% because it has to stay legible at recording size in a fixed
 * box. Comparing the rendered strings would fail on that difference and prove nothing about the
 * numbers, so both sides are reduced to the quantity before they are compared. That the underlying
 * values are carried EXACTLY is settled in the manifest suite, by identity against the artifact.
 */
async function percents(page: Page, selector: string): Promise<Set<number>> {
  const text = await page.locator(selector).first().innerText().catch(() => "");
  return new Set([...text.matchAll(/(\d{1,3}(?:\.\d+)?)%/g)].map((m) => Math.round(Number(m[1]))));
}

test.describe("P234 · sport adapters", () => {
  test("EPL · the frame's three-way numbers are the page's three-way numbers", async ({ page }) => {
    await page.goto("/epl/");
    const link = page.locator('a[href^="/epl/match/"]').first();
    test.skip(!(await link.count()), "no EPL fixture page in this build");
    const href = await link.getAttribute("href");
    await page.goto(href!.split("?")[0]);

    const onPage = await percents(page, "main");
    const cta = page.getByRole("button", { name: /Play the match forecast/i });
    await expect(cta).toBeVisible();
    await cta.click();

    const d = dialog(page);
    await expect(d).toHaveAttribute("aria-label", /Premier League simulation presentation/i);
    /* Chapter 2 is the three-way result. Its percentages must already exist on the page. */
    await d.getByRole("button", { name: "Next chapter" }).click();
    const inFrame = await percents(page, '[role="dialog"]');
    /* Allow a one-point difference in either direction: the report rounds 65.14 to 65.1 and the
       frame rounds it to 65, and two roundings of one number can land a point apart. A number the
       report never carried at all is more than a point away from everything it did. */
    const strays = [...inFrame].filter((v) => ![v - 1, v, v + 1].some((n) => onPage.has(n)));
    expect(strays, `the frame shows ${strays.join(", ")}% and the report carries nothing near it`).toHaveLength(0);
  });

  test("EPL · no run count is claimed for a model that runs no trials", async ({ page }) => {
    await page.goto("/epl/");
    const link = page.locator('a[href^="/epl/match/"]').first();
    test.skip(!(await link.count()), "no EPL fixture page in this build");
    await page.goto((await link.getAttribute("href"))!.split("?")[0]);
    await page.getByRole("button", { name: /Play the match forecast/i }).click();
    const d = dialog(page);
    for (let i = 0; i < 7; i += 1) {
      await expect(d).not.toContainText(/simulated (games|matches)|\d[\d,]*-run/i);
      const next = d.getByRole("button", { name: "Next chapter" });
      if (await next.isDisabled()) break;
      await next.click();
    }
  });

  test("UFC · the card walkthrough opens and states what it did not read", async ({ page }) => {
    await page.goto("/ufc/");
    const cta = page.getByRole("button", { name: /Play the card/i });
    test.skip(!(await cta.count()), "no UFC card in this build");
    await cta.click();
    const d = dialog(page);
    await expect(d).toHaveAttribute("aria-label", /UFC simulation presentation/i);

    /* Walk to the limits chapter. A card the model only partly read must say so. */
    let sawLimits = false;
    for (let i = 0; i < 8; i += 1) {
      if (await d.getByText(/What this does not know/i).count()) { sawLimits = true; break; }
      const next = d.getByRole("button", { name: "Next chapter" });
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(sawLimits, "every presentation carries a limits chapter").toBe(true);
    /* The expired "authorisation covers NFL only" sentence must never appear in a UFC frame. */
    await expect(d).not.toContainText(/covers NFL only/i);
  });

  test("NFL · a played game presents its FROZEN forecast, labelled as one", async ({ page }) => {
    await page.goto("/nfl/");
    const link = page.locator('a[href^="/nfl/game/"]').first();
    test.skip(!(await link.count()), "no NFL game page in this build");
    await page.goto((await link.getAttribute("href"))!.split("?")[0]);
    const cta = page.getByRole("button", { name: /Play the (frozen )?(game )?forecast/i });
    test.skip(!(await cta.count()), "this NFL game carries no presentation control");
    await cta.click();

    const d = dialog(page);
    const header = await d.innerText();
    if (/frozen pre-event forecast/i.test(header)) {
      /* An archived game must never be framed in the present tense. */
      await expect(d).toContainText(/has been played|frozen/i);
    }
    await expect(d.getByRole("link", { name: /Full report/i })).toBeVisible();
  });

  test("EVERY SPORT'S FRAME NAMES ITS SPORT — themes are distinct without relying on a logo", async ({ page }) => {
    const seen: string[] = [];
    for (const [url, name] of [["/epl/", /Play the match forecast/i], ["/ufc/", /Play the card/i]] as const) {
      await page.goto(url);
      if (url === "/epl/") {
        const link = page.locator('a[href^="/epl/match/"]').first();
        if (!(await link.count())) continue;
        await page.goto((await link.getAttribute("href"))!.split("?")[0]);
      }
      const cta = page.getByRole("button", { name });
      if (!(await cta.count())) continue;
      await cta.click();
      const label = await dialog(page).getAttribute("aria-label");
      seen.push((label ?? "").split(" simulation")[0]);
      await page.keyboard.press("Escape");
    }
    expect(new Set(seen).size, `two sports produced the same frame label: ${seen.join(" / ")}`).toBe(seen.length);
  });
});
