/**
 * NBA Simulation Theater · theme variables. Tokens only (globals.css): no raw colour literal here or in nba-theater.css
 * (nba-theater.test.mjs scans both). Extends the shared theater variables (theater-css.ts) with the court surfaces; the
 * percentages come from nba-team-colors.mjs so the contrast maths and the paint can never disagree.
 */
import { FLOOR_MIX, LINE_MIX } from "@/lib/simulation-theater/nba/nba-team-colors.mjs";
import { THEATER_VARS } from "../theater-css";

export const NBA_THEATER_VARS = {
  ...THEATER_VARS,
  "--st-floor-a": `color-mix(in srgb, var(--vault-crown) ${FLOOR_MIX.a}%, var(--bg))`,
  "--st-floor-b": `color-mix(in srgb, var(--vault-crown) ${FLOOR_MIX.b}%, var(--bg))`,
  "--st-floor-out": `color-mix(in srgb, var(--vault-crown) 9%, var(--bg))`,
  "--st-court-line": `color-mix(in srgb, var(--lava-text) ${LINE_MIX}%, var(--bg))`,
} as Record<string, string>;
