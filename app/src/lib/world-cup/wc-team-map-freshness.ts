/**
 * Freshness guard for the WC player→team map. Compares `player-team-map.json` against the current
 * `player-projections/latest.json` and reports whether the map is missing, stale (built for a different slate),
 * or does not cover both teams in every active fixture.
 *
 * Severity model: the resolver fails SAFE (an unresolved player gets a null team → the label is hidden, never a
 * WRONG team). So a gap DEGRADES gracefully (some labels hidden) rather than showing bad data. Missing map or
 * uncovered fixture teams ⇒ "fail" (the fix isn't fully active — regenerate the map); stale-but-fully-covered ⇒
 * "warn". Callers choose whether to fail-closed on "fail" or just surface it.
 */

export interface TeamMapArtifact {
  slate?: string | null;
  generatedAt?: string | null;
  teams?: Record<string, unknown>;
}
export interface ProjectionsArtifact {
  date?: string | null;
  generatedAt?: string | null;
  matches?: { fixture?: string | null }[];
}
export type FreshnessLevel = "ok" | "warn" | "fail";
export interface TeamMapFreshnessResult {
  ok: boolean; // no hard (coverage/missing) issues
  level: FreshnessLevel;
  slate: string | null;
  mapSlate: string | null;
  fixtureTeams: string[];
  missingTeams: string[];
  issues: string[];
}

const normTeam = (s: string) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

/** Pure evaluation — no fs. Pass the parsed map (or null if missing) and the parsed projections (or null). */
export function evaluateTeamMapFreshness(map: TeamMapArtifact | null, projections: ProjectionsArtifact | null): TeamMapFreshnessResult {
  const issues: string[] = [];
  const slate = projections?.date ?? null;
  const fixtureTeams = [
    ...new Set((projections?.matches ?? []).flatMap((m) => String(m.fixture ?? "").split(" vs ")).map((t) => t.trim()).filter(Boolean)),
  ];

  if (!projections || fixtureTeams.length === 0) {
    // Nothing to guard against (no active WC player-prop fixtures) → not an error.
    return { ok: true, level: "ok", slate, mapSlate: map?.slate ?? null, fixtureTeams, missingTeams: [], issues: ["no active WC player-prop fixtures to check"] };
  }
  if (!map) {
    issues.push("player-team-map.json is MISSING — every WC prop team label will be hidden until it is built");
    return { ok: false, level: "fail", slate, mapSlate: null, fixtureTeams, missingTeams: fixtureTeams, issues };
  }

  const mapSlate = map.slate ?? null;
  const mapTeamKeys = new Set(Object.keys(map.teams ?? {}).map(normTeam));
  const missingTeams = fixtureTeams.filter((t) => !mapTeamKeys.has(normTeam(t)));
  if (missingTeams.length > 0) issues.push(`map does not cover ${missingTeams.length} active fixture team(s): ${missingTeams.join(", ")} — their prop labels will be hidden`);

  const stale = !!(mapSlate && slate && mapSlate !== slate);
  if (stale) issues.push(`map slate ${mapSlate} != current slate ${slate} (stale)`);

  const level: FreshnessLevel = missingTeams.length > 0 ? "fail" : stale ? "warn" : "ok";
  if (level === "ok") issues.push(`map covers all ${fixtureTeams.length} active fixture teams for slate ${slate}`);
  return { ok: missingTeams.length === 0, level, slate, mapSlate, fixtureTeams, missingTeams, issues };
}
