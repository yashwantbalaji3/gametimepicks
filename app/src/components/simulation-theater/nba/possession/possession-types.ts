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
export type PbOfficialPlayer = { playerId: string; team: "home" | "away" | null; displayName: string | null; participation: string | null; medians: Record<string, number | null>; expectedMinutes: number | null };
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
/**
 * The island's props: the payload PACKED for the wire (lib/simulation-theater/nba/possession/wire.mjs). Each run's event
 * log is an event-codec.mjs ledger (`nba-possession-events@1`): one row per event, `[typeIndex, c, poss,
 * ...cols[typeIndex]]`, player ids interned into `ids`; `i`, `q` (except on period_start), `s` and game_end `final` are
 * rebuilt by the fold. A run's `rule` is omitted when it is `selection.rules[kind]`.
 */
export type PbPackedEvents = { schema: string; types: string[]; cols: string[][]; ids: string[]; words: string[]; rows: (number | null | (number | null)[][])[][] };
export type PbWire = Omit<PbPayload, "runs"> & {
  wire: number;
  runs: (Omit<PbRun, "events" | "rule"> & { rule?: string; log: PbPackedEvents })[];
};
/** The lane's projection-unavailable players for this game (PR 1230 `players.unavailable`): a reason, never a number. */
export type PbUnavailable = { away: { providerAthleteId: string; name: string | null; reason: string }[]; home: { providerAthleteId: string; name: string | null; reason: string }[] } | null;
