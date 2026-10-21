/** Shapes of the possession playback payload (lib/simulation-theater/nba/possession/payload.mjs): plain JSON, server → client. */
import type { NbaPalette } from "../nba-types";

export type PbEvent = {
  i: number; q: number; c: number; type: string; poss: 0 | 1; team?: 0 | 1; player?: string | null; s: [number, number];
  lineups?: [string[], string[]]; in?: string; out?: string; value?: 2 | 3; made?: boolean; assist?: string | null; block?: string | null;
  n?: number; of?: number; kind?: string; steal?: string | null; on?: string | null; fouledOut?: boolean; final?: [number, number];
};
export type PbRun = {
  kind: string; title: string; role: "SUPPORTING_RUN" | "WHAT_IF"; hypothetical: boolean; runIndex: number; rule: string; distance: number | null;
  final: { home: number; away: number }; periods: [number[], number[]]; overtimePeriods: number; events: PbEvent[];
};
export type PbOfficialPlayer = { playerId: string; team: "home" | "away" | null; displayName: string | null; participation: string | null; medians: Record<string, number | null> };
export type PbOfficial = {
  snapshotId: string; eventId: string; publication: string | null; favouredSide: "HOME" | "AWAY" | null; sideRule: string | null;
  models: { game: string | null; players: string[] }; frozenAt: string | null; lockAt: string | null;
  withheld: Record<string, string>; players: PbOfficialPlayer[];
};
export type PbPayload = {
  schema: string; eventId: string; dateUtc: string | null; venue: string | null;
  teams: { home: { abbr: string; name: string }; away: { abbr: string; name: string } };
  engine: { id: string; label: string; inputAsOf: string; poolSize: number; poolChecked: number | null; poolViolations: number | null; checker: string };
  rosters: { home: { id: string; name: string | null }[]; away: { id: string; name: string | null }[] };
  selection: { rules: Record<string, string>; defaultKind: string | null };
  official: PbOfficial | null;
  runs: PbRun[];
};
export type PbLoad = { eventId: string; ok: boolean; error: { code: string; reason: string } | null; payload: PbPayload | null; palettes: { team: NbaPalette; neutral: NbaPalette } | null };
