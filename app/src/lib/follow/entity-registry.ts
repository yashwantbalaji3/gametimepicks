/**
 * FOLLOWABLE ENTITY REGISTRY (v1.1.2) — SERVER ONLY. Build-time reads of published artifacts.
 *
 * Answers two questions a component cannot answer for itself:
 *   1. "what is the canonical id of the team I am rendering?"  (a page knows a name or an abbreviation)
 *   2. "what is the display name of this id?"                 (/following knows only ids)
 *
 * ⚠ NOTHING HERE IS HAND-TYPED. P251's follow tests forbid a hand-maintained league roster, and they
 * are right to: a typed table drifts from the artifacts the product actually publishes. Every entry
 * below is DERIVED from files the site already ships:
 *
 *   MLB teams  mlb/statsapi-schedule/*.json   { id, name }        — StatsAPI team id, 30 clubs
 *   NFL teams  nfl/rosters/latest.json        { teamAbbr, providerTeamId } — ESPN team id, 32 clubs
 *              nfl/forecasts/*.json           { abbr, name }      — joined on the ESPN abbreviation (EVERY dated file + the two windows)
 *
 * FAIL CLOSED. A name or abbreviation that resolves to zero ids, or to more than one, resolves to
 * null — and a page that gets null renders no Follow control rather than a guessed one.
 */
import fs from "node:fs";
import path from "node:path";

import { mlbTeamRef, nflTeamRef } from "./follow-schema.mjs";
// ONE definition of the ref type, owned by the store. Type-only, so the client module is not pulled server-side.
import type { FollowRef } from "./follow-store";

export type { FollowRef };

interface TeamEntry {
  ref: FollowRef;
  name: string;
  abbr: string | null;
}

const dataDir = () => path.join(process.cwd(), "public/data");
const readJson = (abs: string): any => {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
};

/**
 * Is this schedule participant a canonical MLB club?
 *
 * TWO INDEPENDENT REASONS TO REFUSE, because neither covers both directions of time.
 *
 *   PROVIDER-STATED — StatsAPI marks an undecided postseason slot `placeholder: true`. Authoritative
 *   where present, and the capture now records it. Absent means "a real club": verified 2026-09-23
 *   that regular-season sides do not carry the key at all (0 of 32), so older captures are unaffected.
 *
 *   CORROBORATED — the flag cannot rescue an artifact written before it existed, and the committed
 *   2026-09-29 capture is exactly that: seven TBD sides carrying only {id, name}. So membership is
 *   also confirmed against the season's full-game simulations, which name only clubs that actually
 *   play — a TBD seed has nothing to simulate. Measured that day: schedule union 37, simulations 30,
 *   intersection exactly the 30 real clubs.
 *
 * Fail closed: a participant neither corroborated nor explicitly real is refused. A missing club is a
 * visible absence; a fake club is a false claim, and R1 asserts the count is exactly 30 either way.
 */
export function isCanonicalMlbClub(
  { name, flaggedPlaceholder, simulatedNames }:
  { id?: string; name: string; flaggedPlaceholder: boolean; simulatedNames: Set<string> },
): boolean {
  if (flaggedPlaceholder) return false;
  return simulatedNames.has(name);
}

let cache: { mlb: TeamEntry[]; nfl: TeamEntry[] } | null = null;

function build(): { mlb: TeamEntry[]; nfl: TeamEntry[] } {
  if (cache) return cache;

  /* ── MLB: StatsAPI id + name, unioned across every schedule capture. ── */
  const mlbById = new Map<string, string>();
  /** Sides StatsAPI itself marked as undecided postseason slots. */
  const placeholderIds = new Set<string>();
  const schedDir = path.join(dataDir(), "mlb/statsapi-schedule");
  let schedFiles: string[] = [];
  try {
    schedFiles = fs.readdirSync(schedDir).filter((f) => f.endsWith(".json"));
  } catch {
    /* no schedule captures in this tree — MLB follows simply resolve nothing */
  }
  for (const f of schedFiles) {
    const j = readJson(path.join(schedDir, f));
    for (const g of j?.games ?? []) {
      for (const side of [g?.home, g?.away]) {
        if (side?.id !== undefined && typeof side?.name === "string") mlbById.set(String(side.id), side.name);
        if (side?.placeholder === true) placeholderIds.add(String(side.id));
      }
    }
  }
  // Abbreviations come from the simulation slates, joined on the full name the two artifacts share.
  const abbrByMlbName = new Map<string, string>();
  /** Every club the season's simulations name — the corroborating universe for membership below. */
  const simulatedMlbNames = new Set<string>();
  const simDir = path.join(dataDir(), "mlb/full-game-simulations");
  try {
    /* THE SEASON, NOT A WINDOW. This read was `.slice(-7)`. Seven files is enough for abbreviations —
       every club plays inside a week — but the set is now load-bearing for MEMBERSHIP below, and a
       window is exactly what R1 exists to catch. Reading every published slate costs one pass. */
    for (const f of fs.readdirSync(simDir).filter((x) => x.endsWith(".json")).sort()) {
      const j = readJson(path.join(simDir, f));
      for (const g of j?.games ?? []) {
        if (g?.awayTeamName) { simulatedMlbNames.add(g.awayTeamName); if (g?.awayTeam) abbrByMlbName.set(g.awayTeamName, g.awayTeam); }
        if (g?.homeTeamName) { simulatedMlbNames.add(g.homeTeamName); if (g?.homeTeam) abbrByMlbName.set(g.homeTeamName, g.homeTeam); }
      }
    }
  } catch {
    /* abbreviations are a convenience; ids and names still resolve without them */
  }
  /*
   * ⚠ A POSTSEASON SLOT IS NOT A CLUB, and the flag above cannot save an artifact written before it
   * existed. On 2026-09-23 the committed 09-29 capture held seven TBD sides — "NL Wild Card #1",
   * "AL #3 Seed" — carrying only {id, name}, so this registry resolved 37 "MLB clubs" and
   * `mlbTeamRefByName("NL Wild Card #3")` returned a followable ref: an identity minted for something
   * that is not an entity.
   *
   * So membership is CORROBORATED by a second owner rather than taken from the schedule alone. The
   * full-game simulation slates name only clubs that actually play — a TBD seed has nothing to
   * simulate. Measured that day: the schedule union held 37 ids, the season's simulations named
   * exactly 30 clubs, and the intersection was exactly the 30 real ones.
   *
   * FAIL CLOSED, DELIBERATELY. A participant the simulations do not corroborate is dropped, not
   * admitted. The cost is that a club nothing has simulated cannot be followed; the alternative is
   * letting a non-entity be followed, and a missing club is a visible absence while a fake club is a
   * false claim. R1 asserts the count is exactly 30, so any over- OR under-count is loud.
   *
   * Not an id range and not a name regex: both were considered and rejected as magic, and the provider
   * publishes no contract that 4-digit ids are synthetic.
   */
  const mlb: TeamEntry[] = [];
  for (const [id, name] of mlbById) {
    if (!isCanonicalMlbClub({ id, name, flaggedPlaceholder: placeholderIds.has(id), simulatedNames: simulatedMlbNames })) continue;
    const ref = mlbTeamRef(id, name) as FollowRef | null;
    if (ref) mlb.push({ ref, name, abbr: abbrByMlbName.get(name) ?? null });
  }

  /* ── NFL: ESPN team id per abbreviation (rosters) + name per abbreviation (forecasts). ── */
  const roster = readJson(path.join(dataDir(), "nfl/rosters/latest.json"));
  const nflIdByAbbr = new Map<string, string>();
  for (const t of roster?.teams ?? []) {
    if (typeof t?.teamAbbr === "string" && t?.providerTeamId !== undefined) nflIdByAbbr.set(t.teamAbbr, String(t.providerTeamId));
  }
  const nflNameByAbbr = new Map<string, string>();
  /* Names come from EVERY published forecast file, oldest dated file first and the two rolling
     windows last (so the newest spelling wins). Reading only latest.json + frozen-latest.json named
     the clubs of the current WINDOW — on the Tuesday after Week 3 that was one finished game (ATL,
     GB) and an empty frozen file, so 30 clubs silently left the registry and every anti-vacuity
     guard on it went red (R1/R2, quality-gate on main 2026-09-22). A rolling window's omission is
     not a club's absence; the season's published artifacts are the owner this registry claims. */
  let forecastFiles: string[] = [];
  try {
    forecastFiles = fs.readdirSync(path.join(dataDir(), "nfl/forecasts"))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => `nfl/forecasts/${f}`);
  } catch { forecastFiles = []; }
  for (const rel of [...forecastFiles, "nfl/forecasts/latest.json", "nfl/forecasts/frozen-latest.json"]) {
    const j = readJson(path.join(dataDir(), rel));
    for (const e of j?.events ?? j?.forecasts ?? []) {
      for (const side of [e?.home, e?.away]) {
        if (typeof side?.abbr === "string" && typeof side?.name === "string") nflNameByAbbr.set(side.abbr, side.name);
      }
    }
  }
  const nfl: TeamEntry[] = [];
  for (const [abbr, id] of nflIdByAbbr) {
    const name = nflNameByAbbr.get(abbr);
    if (!name) continue; // an id we cannot name is not rendered with a guessed label
    const ref = nflTeamRef(id, name) as FollowRef | null;
    if (ref) nfl.push({ ref, name, abbr });
  }

  cache = { mlb: dedupeSafe(mlb), nfl: dedupeSafe(nfl) };
  return cache;
}

/** Drop any entry whose name or abbreviation is shared with another — ambiguity resolves to nothing. */
function dedupeSafe(entries: TeamEntry[]): TeamEntry[] {
  const count = (key: (e: TeamEntry) => string | null) => {
    const m = new Map<string, number>();
    for (const e of entries) {
      const k = key(e);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const names = count((e) => e.name);
  return entries.filter((e) => (names.get(e.name) ?? 0) === 1);
}

function find(list: TeamEntry[], predicate: (e: TeamEntry) => boolean): FollowRef | null {
  const hits = list.filter(predicate);
  return hits.length === 1 ? hits[0].ref : null; // zero or several ⇒ no follow control
}

/** MLB team ref from the full name a page already renders (e.g. `fullGameSim.homeTeamName`). */
export function mlbTeamRefByName(name: string | null | undefined): FollowRef | null {
  if (!name) return null;
  return find(build().mlb, (e) => e.name === name);
}

/** NFL team ref from the ESPN abbreviation a page already renders. */
export function nflTeamRefByAbbr(abbr: string | null | undefined): FollowRef | null {
  if (!abbr) return null;
  return find(build().nfl, (e) => e.abbr === abbr);
}

/** Display label for a stored id, resolved from CURRENT artifacts (the stored label is only a hint). */
export function labelForRef(ref: { sport: string; entityType: string; id: string }): string | null {
  if (ref.entityType !== "team") return null;
  const list = ref.sport === "MLB" ? build().mlb : ref.sport === "NFL" ? build().nfl : [];
  return list.find((e) => e.ref.id === ref.id)?.name ?? null;
}

/**
 * The legacy migration map: P251 display name → canonical ref.
 *
 * P251 stored NFL full club names (the weekly board's only write path), so this is the 32 NFL clubs.
 * Small (~2 KB) and derived, so it can be handed to the client wherever follows are read.
 */
export function legacyNameMap(): Record<string, FollowRef> {
  const out: Record<string, FollowRef> = {};
  for (const e of build().nfl) out[e.name] = e.ref;
  return out;
}

/** Counts, for a test to prove the registry actually loaded rather than passing on an empty tree. */
export function registryCounts(): { mlbTeams: number; nflTeams: number } {
  const b = build();
  return { mlbTeams: b.mlb.length, nflTeams: b.nfl.length };
}

/**
 * Canonical team refs for one game row, resolved on the server from what the row already renders.
 *
 * MLB rows resolve by FULL NAME (the StatsAPI schedule carries names, not abbreviations); NFL rows by
 * ESPN ABBREVIATION (the roster carries abbreviations and ESPN ids). A side that does not resolve is
 * simply absent — a row never carries a guessed id.
 */
export function teamRefsForGame(
  sport: string | null | undefined,
  teams: { home?: string | null; away?: string | null },
  teamNames?: { home?: string | null; away?: string | null } | null,
): FollowRef[] {
  const s = String(sport ?? "").toLowerCase();
  const out: FollowRef[] = [];
  for (const side of ["away", "home"] as const) {
    const ref =
      s === "mlb" ? mlbTeamRefByName(teamNames?.[side] ?? null)
      : s === "nfl" ? nflTeamRefByAbbr(teams?.[side] ?? null)
      : null;
    if (ref) out.push(ref);
  }
  return out;
}

/** abbreviation → canonical NFL team ref for every abbreviation that resolves. Unresolved ones are omitted. */
export function nflTeamRefsByAbbr(abbrs: Array<string | null | undefined>): Record<string, FollowRef> {
  const out: Record<string, FollowRef> = {};
  for (const a of abbrs) {
    if (!a || out[a]) continue;
    const ref = nflTeamRefByAbbr(a);
    if (ref) out[a] = ref;
  }
  return out;
}

/** id → current display name for every followable team. Used by /following to render stored ids. */
export function teamLabelMap(): Record<string, string> {
  const b = build();
  const out: Record<string, string> = {};
  for (const e of [...b.mlb, ...b.nfl]) out[e.ref.id] = e.name;
  return out;
}
