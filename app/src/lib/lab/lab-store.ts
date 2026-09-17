/**
 * RESEARCH LAB PROJECTION READER (v1.5) — SERVER / BUILD TIME ONLY.
 *
 * Reads the committed Lab projection (data/lab-projection/v1) so a research page can offer "Open in Research Lab"
 * for an entity the Lab can actually answer about — and offer NOTHING for one it cannot, rather than a link to an
 * empty search. The browser never imports this module (it fetches the emitted public assets instead); a projection
 * whose schemaVersion this reader does not know is refused.
 */
import fs from "node:fs";
import path from "node:path";

import { LAB_MODE_SPORTS, LAB_PROJECTION_DIR, LAB_ROUTE, assertLabVersion, labModeSupports } from "./contract.mjs";

type Mode = "games" | "players" | "seasons";
type LabIndexDoc = { seasons: string[]; entities: Array<[string, string, string, string | null, string | null, number[]?]> };

const ROOT = () => path.join(process.cwd(), "..", LAB_PROJECTION_DIR);
const cache = new Map<string, LabIndexDoc | null>();

function labIndex(mode: Mode, sport: string): LabIndexDoc | null {
  const key = `${mode}/${sport}`;
  if (!cache.has(key)) {
    const abs = path.join(ROOT(), `indexes/${mode}-${sport.toLowerCase()}.json`);
    cache.set(key, fs.existsSync(abs) ? (assertLabVersion(JSON.parse(fs.readFileSync(abs, "utf8")), `lab ${key} index`) as LabIndexDoc) : null);
  }
  return cache.get(key)!;
}

/** The canonical slug the Lab knows this id by, or null when the Lab has no rows for it. */
export function labSlug(mode: Mode, sport: string, id: string): string | null {
  if (!labModeSupports(mode, sport)) return null;
  return labIndex(mode, sport)?.entities.find((e) => e[1] === id)?.[0] ?? null;
}

/**
 * A Research Lab link with an entity preselected, or null. The season is deliberately LEFT OUT: the Lab fills in
 * its own newest recorded season, so this link cannot go stale against a refreshed projection.
 */
export function labHref(mode: Mode, sport: string, id: string, extra?: Record<string, string>): string | null {
  const slug = labSlug(mode, sport, id);
  if (!slug) return null;
  const key = mode === "players" ? "player" : "team";
  const params = [["mode", mode], ["sport", sport.toLowerCase()], [key, slug], ...Object.entries(extra ?? {})];
  return `${LAB_ROUTE}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** Sports whose Lab mode ships, for a directory or an explanatory line. */
export const labSports = (mode: Mode) => LAB_MODE_SPORTS[mode];
