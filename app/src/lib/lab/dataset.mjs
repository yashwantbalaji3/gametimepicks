/**
 * RESEARCH LAB DATASET (v1.5) — turn ONE loaded index + ONE loaded row partition into the plain object the pure
 * engine executes against. PURE: no filesystem, no clock, no network.
 *
 * Packed 5-tuples become named records exactly once, here, so neither the engine nor a component reads a tuple by
 * index. A document whose artifact or sport does not answer the query is REFUSED rather than coerced.
 */
import { assertLabVersion } from "./contract.mjs";

const ARTIFACT = Object.freeze({ games: "lab-games", players: "lab-players", seasons: "lab-seasons" });

/** `[slug|null, id, label, abbr|null, path|null]` → a named record. A null slug means "label only, not selectable". */
export const entityOf = (t) => (t ? { slug: t[0] ?? null, id: t[1], label: t[2], abbr: t[3] ?? null, path: t[4] ?? null } : null);

/** `[slug, id, label, hint|null, path|null, familyIdx[]]` → a named player record. */
export const playerOf = (p, families) => (p ? { slug: p[0], id: p[1], label: p[2], hint: p[3] ?? null, path: p[4] ?? null, families: (p[5] ?? []).map((i) => families[i]).filter(Boolean) } : null);

/**
 * @param {string} mode
 * @param {any} index  the loaded `/data/lab/v1/<mode>/<sport>/index.json`
 * @param {any} part   the loaded row partition
 * @param {number} partitions how many assets the loader actually fetched (the cost receipt's own count)
 */
export function labDataset(mode, index, part, partitions = 2) {
  assertLabVersion(index, `lab ${mode} index`);
  assertLabVersion(part, `lab ${mode} partition`);
  if (part.artifact !== ARTIFACT[mode]) throw new Error(`lab dataset: ${part.artifact} is not a ${mode} partition`);
  if (index.mode !== mode) throw new Error(`lab dataset: index mode ${index.mode} is not ${mode}`);
  if (index.sport !== part.sport) throw new Error(`lab dataset: index sport ${index.sport} does not match partition ${part.sport}`);

  const base = { mode, sport: part.sport, seasons: part.seasons, coverage: index.coverage, partitions, rows: part.rows };
  if (mode === "players") {
    const families = part.families;
    return { ...base, families, players: part.players.map((p) => playerOf(p, families)), teams: part.teams.map(entityOf) };
  }
  return { ...base, teams: part.teams.map(entityOf) };
}
