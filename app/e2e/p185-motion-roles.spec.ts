import { test, expect } from "@playwright/test";

/*
 * P185 · B4 — the motion contract, asserted as COMPUTED values in a real engine.
 *
 * The charter asks that reduced motion be honoured "globally and component-by-component", that it
 * keep "focus, progress, state and loading feedback understandable", and that computed durations be
 * tested in Chromium, Firefox and WebKit. A source-only check cannot prove any of that — the media
 * query has to actually apply.
 */

const KEPT = ["hover-focus", "state-change", "progress"];
const REMOVED = ["entrance", "exit", "emphasis", "number-transition", "chart-draw", "ambient", "route-transition"];

const read = (names: string[]) =>
  `(() => { const cs = getComputedStyle(document.documentElement);
     return Object.fromEntries(${JSON.stringify(names)}.map(n => [n, cs.getPropertyValue('--motion-' + n + '-duration').trim()])); })()`;

test("every role resolves to a real duration at :root", async ({ page }) => {
  await page.goto("/today/");
  const all = await page.evaluate(read([...KEPT, ...REMOVED, "disclosure"]));
  for (const [role, v] of Object.entries(all as Record<string, string>)) {
    expect(v, `--motion-${role}-duration is unset`).not.toBe("");
  }
  expect((all as Record<string, string>)["hover-focus"]).toBe("160ms");
  expect((all as Record<string, string>)["state-change"]).toBe("200ms");
});

test("reduced motion removes decoration and KEEPS feedback", async ({ browser }) => {
  /* The half of the rule a blanket off-switch fails. */
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/today/");
  const v = (await page.evaluate(read([...KEPT, ...REMOVED, "disclosure"]))) as Record<string, string>;

  for (const role of REMOVED) {
    expect(v[role], `${role} is spatial/looping decoration and must be removed`).toBe("0.01ms");
  }
  for (const role of KEPT) {
    expect(v[role], `${role} carries feedback and must survive reduced motion`).not.toBe("0.01ms");
  }
  expect(v["hover-focus"], "focus feedback is an accessibility affordance").toBe("160ms");
  expect(v["disclosure"], "disclosure is shortened, not removed").toBe("80ms");
  await ctx.close();
});

test("the decelerate curve is one value, not four near-identical ones", async ({ page }) => {
  await page.goto("/today/");
  const easings = await page.evaluate(`(() => { const cs = getComputedStyle(document.documentElement);
    return ["hover-focus","state-change","disclosure","entrance"].map(n => cs.getPropertyValue('--motion-' + n + '-easing').trim()); })()`);
  /* An all-empty result is trivially "unique" — that is a pass for the wrong reason, and it is
     exactly what this test did against an export built before the tokens existed. */
  for (const e of easings as string[]) expect(e, "an easing token is unset").not.toBe("");
  const uniq = new Set(easings as string[]);
  expect(uniq.size, `four roles should share one decelerate curve, saw ${[...uniq].join(" | ")}`).toBe(1);
});
