/**
 * THE FIXED-FRAME SIMULATION PLAYER — Program 234 · Release B.
 *
 * The unit suite proves the manifest carries the artifact's values and that the machine refuses the
 * transitions it must. What it cannot prove is the thing the charter actually asks for: that a
 * reader presses one control and gets a complete narrative in one bounded frame, without scrolling
 * and without moving the pointer again. That is a browser question, so it is asked here.
 *
 * The assertions worth having are the ones about failure:
 *   · the frame must not need a scrollbar to show a chapter
 *   · auto-play must advance with the pointer held still
 *   · Escape must return the reader to a page that still works
 *   · the full report must be reachable at every moment, including from a refusal
 *   · two plays of the same event must show the same numbers
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * The first MLB game on today's board that offers the reveal, resolved from the live slate.
 *
 * The `?play=1` the /simulate card carries is stripped here on purpose: these tests are about the
 * CLICK path, and arriving with the intent already expressed opens the player before the trigger
 * can be found. The deep link has its own test below.
 */
async function openAGame(page: Page): Promise<boolean> {
  await page.goto("/simulate/");
  const link = page.locator('a[href^="/games/mlb/"]').first();
  if (!(await link.count())) return false;
  const href = await link.getAttribute("href");
  if (!href) return false;
  await page.goto(href.split("?")[0]);
  return true;
}

/** The same game, reached the way a reader actually reaches it from /simulate. */
async function deepLinkToAGame(page: Page): Promise<boolean> {
  await page.goto("/simulate/");
  const link = page.locator('a[href^="/games/mlb/"]').first();
  if (!(await link.count())) return false;
  const href = await link.getAttribute("href");
  if (!href || !href.includes("play=1")) return false;
  await page.goto(href);
  return true;
}

const generate = (page: Page) => page.getByRole("button", { name: /Generate Simulation/i });
const dialog = (page: Page) => page.getByRole("dialog");

test.describe("P234 · the simulation player", () => {
  test("ONE ACTION OPENS A BOUNDED, LABELLED FRAME", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");

    await cta.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("aria-modal", "true");
    await expect(d).toHaveAttribute("aria-label", /simulation presentation/i);

    /* The frame is bounded: it fits the viewport and never scrolls internally to show a chapter. */
    const box = await d.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box!.width).toBeLessThanOrEqual(vp.width + 1);
  });

  test("THE POINTER CAN STAY STILL — chapters advance on their own", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    const d = dialog(page);
    await expect(d.getByText(/Chapter 1 of/)).toBeVisible();

    /* No click, no hover, no key — only time. */
    await expect(d.getByText(/Chapter 2 of/)).toBeVisible({ timeout: 12_000 });
  });

  test("every chapter fits the frame without an internal scrollbar", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    const d = dialog(page);
    await expect(d).toBeVisible();

    const skip = d.getByRole("button", { name: "Next chapter" });
    for (let i = 0; i < 10; i += 1) {
      /* Nothing inside the frame may overflow its own box — shrinking text to fit is not allowed
         either, so this checks the container rather than the font size. */
      const overflow = await d.evaluate((el) => {
        const scroller = [...el.querySelectorAll("*")].find(
          (n) => n.scrollHeight > n.clientHeight + 2 && getComputedStyle(n).overflowY !== "visible",
        );
        return scroller ? (scroller as HTMLElement).className : null;
      });
      expect(overflow, `a chapter needed an internal scrollbar (${overflow})`).toBeNull();
      if (await skip.isDisabled()) break;
      await skip.click();
    }
  });

  test("ESCAPE CLOSES AND THE REPORT IS UNDERNEATH", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    /* Closing lands on the full dashboard rather than back at a second Generate ceremony. */
    await expect(generate(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("the full report is reachable from inside the frame", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    await expect(dialog(page).getByRole("link", { name: /Full report/i })).toBeVisible();
  });

  test("REPLAY SHOWS THE SAME PREDICTION — a presentation is not a new simulation", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    const d = dialog(page);

    await d.getByRole("button", { name: "Next chapter" }).click();
    const first = await d.locator('[role="status"]').first().innerText();

    /* Back to the start, forward again — the same chapter must say the same thing. */
    await d.getByRole("button", { name: "Previous chapter" }).click();
    await d.getByRole("button", { name: "Next chapter" }).click();
    expect(await d.locator('[role="status"]').first().innerText()).toBe(first);
  });

  test("keyboard alone drives the presentation", async ({ page }) => {
    test.skip(!(await openAGame(page)), "no MLB game on the built board");
    const cta = generate(page);
    test.skip(!(await cta.count()), "this game has no reveal");
    await cta.click();
    const d = dialog(page);
    await expect(d.getByText(/Chapter 1 of/)).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(d.getByText(/Chapter 2 of/)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(d.getByText(/Chapter 1 of/)).toBeVisible();

    /* Space pauses; a paused player does not advance on its own. */
    await page.keyboard.press(" ");
    await expect(d.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.waitForTimeout(7_000);
    await expect(d.getByText(/Chapter 1 of/)).toBeVisible();
  });

  test("FROM /simulate IT IS ONE CLICK — the card's link opens the presentation on arrival", async ({ page }) => {
    test.skip(!(await deepLinkToAGame(page)), "no MLB game carrying the play link");
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByText(/Chapter 1 of/)).toBeVisible();
    /* And the reader is not then made to sit through a second ceremony to reach the report. */
    await page.keyboard.press("Escape");
    await expect(generate(page)).toHaveCount(0);
  });
});
