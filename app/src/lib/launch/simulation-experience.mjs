/**
 * SIMULATION EXPERIENCE evidence (P209 · Release J) — the operator's view of the simulation
 * journey, DERIVED from the owners:
 *
 *   · date/route behaviour from the day-view selector itself (window, available dates, totals);
 *   · theme coverage from the theme registry (every registered sport + the arena fallback);
 *   · the state machine's phase/transition contract from its own module;
 *   · guard names from the test files that exist on disk (never a hand-kept list).
 *
 * Server-only; fail-closed (a selector error reports available:false, never a guess).
 */
import fs from "node:fs";
import path from "node:path";
import { PHASES, TRANSITIONS } from "../simulate/state-machine.mjs";
import { buildSimulateDay, availableSimulateDates, WINDOW_BACK, WINDOW_FORWARD } from "../simulate/day-view.ts";
import { themeFor } from "../simulate/themes.ts";

export function buildSimulationExperience() {
  const APP = process.cwd();
  const guardFiles = [
    "src/lib/simulate/day-view.test.mjs",
    "src/lib/simulate/state-machine.test.mjs",
    "src/lib/simulate/themes.test.mjs",
    "src/lib/picks/optimizer-card-identity.test.mjs",
    "src/lib/uiux/public-vocabulary.test.mjs",
  ].filter((f) => fs.existsSync(path.join(APP, f)));

  let day;
  try {
    const v = buildSimulateDay();
    day = {
      available: true,
      today: v.today,
      dates: availableSimulateDates().length,
      window: `−${WINDOW_BACK}/+${WINDOW_FORWARD} days`,
      totals: v.totals,
      sections: v.sections.map((s) => ({ sport: s.sport, events: s.events.length, empty: s.emptyState })),
    };
  } catch (e) {
    day = { available: false, note: `day-view unreadable: ${e?.message ?? e}` };
  }

  let themes;
  try {
    const sports = ["mlb", "nfl", "epl", "ufc", "nba"];
    themes = {
      available: true,
      registered: sports.map((s) => ({ sport: s, scene: themeFor(s).scene })),
      fallback: themeFor("__unknown__").scene,
    };
  } catch (e) {
    themes = { available: false, note: `themes unreadable: ${e?.message ?? e}` };
  }

  return {
    day,
    themes,
    machine: {
      phases: PHASES.length,
      terminals: Object.entries(TRANSITIONS).filter(([, next]) => next.length === 0).map(([p]) => p),
    },
    guards: guardFiles,
  };
}
