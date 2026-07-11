/**
 * loadHomepageSpotlight — the fs-reading composition layer over the pure spotlight selector
 * (./spotlight-event). Reads the real UFC artifacts and returns the highest-priority live event to
 * spotlight, or null. Priority: UFC major event → (future) World Cup knockout → MLB slate. Used by both the
 * homepage and the Today page so they stay in sync. No money, no fabrication.
 */
import fs from "node:fs";
import path from "node:path";
import { buildUfcSpotlight, selectHomepageSpotlight, type SpotlightEvent } from "./spotlight-event";
import { ufcEventToReports } from "../multi-sport-report/ufc-adapter";

/** ET "tomorrow"/"today" label for a candidate event date vs the caller's ET date (both YYYY-MM-DD-based). */
export function relativeDayLabel(today: string, eventDate?: string): string | undefined {
  if (!eventDate) return undefined;
  try {
    const evDay = new Date(eventDate).toISOString().slice(0, 10);
    if (evDay === today) return "today";
    const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    if (evDay === tomorrow) return "tomorrow";
  } catch { /* ignore */ }
  return undefined;
}

export function loadHomepageSpotlight(today: string): SpotlightEvent | null {
  const dir = path.join(process.cwd(), "public", "data", "ufc");
  const read = (n: string): any => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")); } catch { return null; } };
  const ops = read("ops-status-latest.json");
  const proj = read("projections-latest.json");
  const sched = read("schedule-latest.json");
  const settle = read("results-settled-latest.json");
  const odds = read("odds-latest.json");

  const eventName: string = proj?.eventName ?? ops?.nextCard?.eventName ?? "";
  const eventDate: string | undefined = sched?.eventDate ?? ops?.nextCard?.eventDate;
  const oddsBackedCount = proj ? ufcEventToReports(proj, odds).length : 0;

  const ufc = proj
    ? buildUfcSpotlight({
        moneylineV1Ready: Boolean(proj.moneylineV1Ready),
        projectionCount: proj.projections?.length ?? 0,
        oddsBackedCount,
        fightCount: sched?.fightCount ?? ops?.nextCard?.fightCount ?? 0,
        eventName,
        eventDate,
        gradedRows: ops?.cleanGradedRows ?? 0,
        gradedTarget: ops?.targetRowsForPublicMoneyline ?? 150,
        isSettled: settle?.status === "final" && (settle?.event ?? "") === eventName,
        whenLabel: relativeDayLabel(today, eventDate),
      })
    : null;

  // Priority order (Phase 6): UFC major event, then World Cup knockout, then today's MLB slate.
  return selectHomepageSpotlight([ufc /*, wcKnockout, mlbSlate */]);
}
