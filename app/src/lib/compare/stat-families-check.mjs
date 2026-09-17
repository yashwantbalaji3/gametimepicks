/**
 * BUILD-TIME cross-check (v1.4): every comparable family names a real v1.3 research column in the same sport.
 *
 * Kept OUT of stat-families.mjs on purpose: the research stat-group registry names Data Platform family keys
 * (`epl.espn-player-match`, …), and stat-families.mjs ships to the browser — importing the registry there put a
 * platform source key into a public chunk (caught by data-platform/export-leak.test.mjs EX1).
 */
import { PLAYER_GROUPS } from "../research-pages/stat-groups.mjs";
import { STAT_FAMILIES } from "./stat-families.mjs";

/** Throws when a family names a column research does not carry (a stat research lacks can never be compared). */
export function assertFamiliesMatchResearch() {
  for (const [sport, list] of Object.entries(STAT_FAMILIES)) {
    const cols = new Set((PLAYER_GROUPS[sport] ?? []).flatMap((g) => g.columns.map((c) => c.key)));
    for (const f of list) if (!cols.has(f.column)) throw new Error(`compare stat family ${f.key}: research has no ${sport} column ${f.column}`);
  }
  return true;
}
