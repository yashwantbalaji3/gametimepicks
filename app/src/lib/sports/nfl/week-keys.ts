/**
 * WHICH NFL WEEK PAGES EXIST — one rule, read by the route register AND by every link to a week page.
 *
 * /nfl/week/[key] exports a page for every period with a committed weekly-boards artifact. A link built from any
 * other source (the hub's "Week permalink" was built from the slate's first game) can point at a week that has no
 * page yet — the Monday after a week closes, the slate already reads next week while its boards are still to come —
 * and the export then ships a dead link (post-build guard, 2026-09-15).
 */
import fs from "node:fs";
import path from "node:path";

/** Every `<seasonType>-<week>` key with a committed weekly-boards artifact, sorted. */
export function availableWeekKeys(): string[] {
  try {
    return fs.readdirSync(path.join(process.cwd(), "public/data/nfl/weekly-boards"))
      .filter((f) => /^\d+-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch { return []; }
}

export const weekKeyOf = (seasonType: number, week: number): string => `${seasonType}-${String(week).padStart(2, "0")}`;
