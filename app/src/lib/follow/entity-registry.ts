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

let cache: { mlb: TeamEntry[]; nfl: TeamEntry[] } | null = null;

function build(): { mlb: TeamEntry[]; nfl: TeamEntry[] } {
  if (cache) return cache;

  /* ── MLB: StatsAPI id + name, unioned across every schedule capture. ── */
  const mlbById = new Map<string, string>();
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
      }
    }
  }
  // Abbreviations come from the simulation slates, joined on the full name the two artifacts share.
  const abbrByMlbName = new Map<string, string>();
  const simDir = path.join(dataDir(), "mlb/full-game-simulations");
  try {
    for (const f of fs.readdirSync(simDir).filter((x) => x.endsWith(".json")).sort().slice(-7)) {
      const j = readJson(path.join(simDir, f));
      for (const g of j?.games ?? []) {
        if (g?.awayTeamName && g?.awayTeam) abbrByMlbName.set(g.awayTeamName, g.awayTeam);
        if (g?.homeTeamName && g?.homeTeam) abbrByMlbName.set(g.homeTeamName, g.homeTeam);
      }
    }
  } catch {
    /* abbreviations are a convenience; ids and names still resolve without them */
  }
  const mlb: TeamEntry[] = [];
  for (const [id, name] of mlbById) {
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
