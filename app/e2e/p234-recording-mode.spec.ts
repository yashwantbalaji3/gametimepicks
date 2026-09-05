/**
 * RECORDING MODE — Program 234 · Release D.
 *
 * The workflow the charter asks for is: choose an event, choose a format, press Start, record the
 * frame. What makes that possible is a split the eye cannot verify from a screenshot — every control
 * must sit OUTSIDE the rectangle a person would crop to, while everything a viewer needs to judge
 * the content stays inside it. So that split is measured here in coordinates, not asserted in prose.
 *
 * The other assertions are about what a recording must never do: change ratio mid-take, hide the
 * event date or the paper-only disclosure, or show different numbers on a second run.
 */
import { test, expect, type Page } from "@playwright/test";

const frame = (page: Page) => page.locator("[data-capture-frame]");

async function openRecording(page: Page): Promise<boolean> {
  await page.goto("/simulate/");
  const link = page.locator('a[href^="/games/mlb/"]').first();
  if (!(await link.count())) return false;
  await page.goto((await link.getAttribute("href"))!.split("?")[0]);
  const cta = page.getByRole("button", { name: /Generate Simulation/i });
  if (!(await cta.count())) return false;
  await cta.click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: /^Recording layout$/ }).click();
  return true;
}

test.describe("P234 · recording mode", () => {
  test("EVERY CONTROL SITS OUTSIDE THE CAPTURE FRAME", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");

    const box = (await frame(page).boundingBox())!;
    const bottom = box.y + box.height;

    /* Play/pause, chapter navigation, the format chooser and Start must all be below the crop.
       A recording of the frame rectangle then contains none of them. */
    for (const name of [/^(Play|Pause|Resume|Replay)$/, /Previous chapter/, /Next chapter/, /^Recording layout on$/, /Start presentation/]) {
      const control = page.getByRole("button", { name });
      if (!(await control.count())) continue;
      const cb = (await control.first().boundingBox())!;
      expect(cb.y, `a control (${name}) is inside the capture frame`).toBeGreaterThanOrEqual(bottom - 1);
    }
  });

  test("THE FRAME KEEPS THE EVENT, ITS DATE AND THE DISCLOSURE — a recording must be attributable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    const f = frame(page);
    await expect(f).toContainText(/\d{4}-\d{2}-\d{2}/);            // the event's date
    await expect(f).toContainText(/gametimepicks/i);               // where it came from
    await expect(f).toContainText(/Paper-only/i);                  // what it is not
    await expect(f).toContainText(/Chapter \d+ of \d+/);           // where in the story
  });

  test("each composition holds its aspect ratio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    for (const [label, ratio] of [["9:16", 9 / 16], ["4:5", 4 / 5], ["16:9", 16 / 9]] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(150);
      const b = (await frame(page).boundingBox())!;
      expect(b.width / b.height, `${label} rendered at ${(b.width / b.height).toFixed(3)}`).toBeCloseTo(ratio, 1);
    }
  });

  test("THE RATIO DOES NOT DRIFT AS THE PRESENTATION PLAYS", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    await page.getByRole("button", { name: "9:16", exact: true }).click();
    const first = (await frame(page).boundingBox())!;
    /* Chapters differ in density — a frame that resized between them would ruin a take. */
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole("button", { name: "Next chapter" }).click();
      await page.waitForTimeout(120);
      const b = (await frame(page).boundingBox())!;
      expect(Math.abs(b.width - first.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - first.height)).toBeLessThanOrEqual(1);
    }
  });

  test("nothing inside the frame is clipped or scrolled away", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    for (const label of ["9:16", "4:5", "16:9"] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      for (let i = 0; i < 8; i += 1) {
        const overflowing = await frame(page).evaluate((el) => {
          const bad = [...el.querySelectorAll("*")].find(
            (n) => n.scrollHeight > n.clientHeight + 2 && getComputedStyle(n).overflowY !== "visible",
          );
          return bad ? (bad as HTMLElement).className : null;
        });
        expect(overflowing, `${label} clipped content (${overflowing})`).toBeNull();
        const next = page.getByRole("button", { name: "Next chapter" });
        if (await next.isDisabled()) break;
        await next.click();
      }
      await page.getByRole("button", { name: "Replay" }).or(page.getByRole("button", { name: "Resume" })).first().click();
      await page.getByRole("button", { name: "Pause" }).click().catch(() => {});
    }
  });

  test("START COUNTS DOWN AND BEGINS AT CHAPTER ONE, with the pointer then still", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(frame(page)).toContainText("Chapter 2 of");

    await page.getByRole("button", { name: /Start presentation/ }).click();
    /* Three, two, one — inside the crop, so a take that starts on the count still looks deliberate. */
    await expect(frame(page)).toContainText("3");
    await expect(frame(page)).toContainText("Chapter 1 of", { timeout: 8_000 });
    /* And from here the pointer never moves again. */
    await expect(frame(page)).toContainText("Chapter 2 of", { timeout: 12_000 });
  });

  test("A SECOND TAKE SHOWS THE SAME NUMBERS — a presentation is not a new simulation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    await page.getByRole("button", { name: "Next chapter" }).click();
    const take1 = await frame(page).innerText();
    await page.getByRole("button", { name: /Start presentation/ }).click();
    await expect(frame(page)).toContainText("Chapter 1 of", { timeout: 8_000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Next chapter" }).click();
    expect(await frame(page).innerText()).toBe(take1);
  });

  test("reduced motion keeps every chapter and its numbers", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 950 });
    test.skip(!(await openRecording(page)), "no MLB game on the built board");
    const f = frame(page);
    await expect(f).toContainText("Chapter 1 of");
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(f).toContainText(/\d+%/);
    await expect(f).toContainText(/Paper-only/i);
  });
});
