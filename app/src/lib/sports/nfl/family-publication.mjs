/**
 * NFL PLAYER-FAMILY PUBLICATION TRUTH (P330). The per-game player boards are the owner of what each family
 * actually publishes this week (state + model + basis); the public status/index used to describe families from
 * the v1 evaluation receipt alone, so the hub could say "model ready, awaiting live inputs" while every board
 * on the slate published the share-level model. This derives the public family rows from the boards of the
 * CURRENT PERIOD only — a played week's boards stay on disk, frozen (P320), and never speak for this week.
 *
 * Pure. `boards` are per-game board documents, `period` is { seasonType, week } (null when the window has no
 * regular period), `families` are the evaluation-derived rows the status script already builds (fallback copy).
 */
export const FAMILY_KEYS = ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"];

const uniq = (xs) => [...new Set(xs)];

/** The boards that constitute the period, or [] when the period is unknown. */
export function constituentBoards(boards, period) {
  if (!period || !Number.isFinite(period.seasonType) || !Number.isFinite(period.week)) return [];
  return (boards ?? []).filter((b) => b && b.seasonType === period.seasonType && b.week === period.week && Array.isArray(b.players));
}

/** One family's public row: the boards' publication where every constituent agrees, else an honest mixed/fallback row. */
export function familyPublication(key, evaluated, constituents) {
  const label = evaluated?.label ?? key;
  if (!constituents.length) return { ...evaluated, key, label, publication: null, source: "evaluation" };
  const entries = constituents.map((b) => b.families?.[key] ?? null);
  const states = uniq(entries.map((e) => e?.state ?? "ABSENT"));
  const models = uniq(entries.map((e) => e?.model ?? null).filter(Boolean));
  const boardsN = constituents.length;
  const base = { key, label, publication: { boards: boardsN, states, models }, source: "boards", nextGate: evaluated?.nextGate ?? null };
  if (states.length === 1 && states[0] === "PUBLISHED" && models.length === 1) {
    return { ...base, state: "PUBLISHED", modelId: models[0], headline: `${label}: published this week by ${models[0]}`, detail: entries[0]?.basis ?? `Every game on this week's slate publishes this family from ${models[0]}.`, nextGate: null };
  }
  if (states.length === 1 && states[0] === "ESTIMATE") {
    const e = entries[0] ?? {};
    return { ...base, state: evaluated?.state === "ESTIMATE_NEAR_BAR" ? "ESTIMATE_NEAR_BAR" : "ESTIMATE_BELOW_BAR", modelId: models[0] ?? null, headline: `${label}: displayed as an unvalidated estimate`, detail: [e.reason, e.caveat].filter(Boolean).join(" — ") || evaluated?.detail || "Displayed as an unvalidated estimate." };
  }
  if (states.length === 1 && states[0] === "WITHHELD") {
    return { ...base, state: "RESEARCH_ONLY", headline: `${label}: withheld this week`, detail: entries[0]?.reason ?? evaluated?.detail ?? "Withheld: the family has not cleared its bar." };
  }
  /* Mixed or absent across the slate: say so; never round up to PUBLISHED. */
  const counts = {};
  for (const s of entries.map((e) => e?.state ?? "ABSENT")) counts[s] = (counts[s] ?? 0) + 1;
  return { ...base, state: "MIXED", headline: `${label}: publication differs across this week's games`, detail: `Across ${boardsN} boards: ${Object.entries(counts).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ")}. Each game page states its own.` };
}

export function derivePlayerFamilyPublication({ boards, period, families }) {
  const constituents = constituentBoards(boards, period);
  return (families ?? []).map((f) => familyPublication(f.key, f, constituents));
}
