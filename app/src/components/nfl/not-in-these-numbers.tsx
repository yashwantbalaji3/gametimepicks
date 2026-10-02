/*
 * MODEL DETAIL — WHO IS NOT IN THESE NUMBERS (Session 4).
 *
 * Replaces the "Recent signings — last season's usage" strip, which sat inside the current-game
 * scorecard and printed another club's per-game line ("2.1 rec · 16.9 yds/g at CAR") beside this
 * game's forecast. On PIT @ CLE it listed a player designated OUT, whom the weekly forecast already
 * modelled at PIT from this season's games.
 *
 * What a reader is owed instead is the board's own coverage receipt, in plain words: who is out, who
 * has no game for this club yet, and which quarterbacks are not this team's passer. A former club's
 * numbers appear only as a labelled HISTORICAL PRIOR, never as a current-game attribute, and only
 * here — closed by default, below the forecast, never in it.
 */
import type { NewArrival } from "@/components/nfl/player-board";

export interface CoverageRow {
  playerId: string;
  name: string;
  state: string;
  reason?: string;
  families?: string[];
  notModeled?: { family: string; state: string; reason: string }[];
}
export type BoardCoverage = Record<string, { counts: Record<string, number>; players: CoverageRow[] }>;

const priorLine = (a: NewArrival) => {
  const s = a.lastSeason;
  const parts: string[] = [];
  if (s.targetsPg > 0) parts.push(`${s.receptionsPg} rec · ${s.recYdsPg} rec yds`);
  if (s.rushAttPg >= 1) parts.push(`${s.rushYdsPg} rush yds`);
  if (s.passAttPg >= 1) parts.push(`${s.passYdsPg} pass yds`);
  return `${s.games} games for ${s.club}, ${parts.join(" · ")} per game`;
};

export function notInTheseNumbersRows(coverage: BoardCoverage | undefined, teams: string[]) {
  const out: { team: string; name: string; label: string; detail: string; playerId: string }[] = [];
  for (const team of teams) {
    for (const r of coverage?.[team]?.players ?? []) {
      if (r.state === "EXCLUDED_UNAVAILABLE") out.push({ team, playerId: r.playerId, name: r.name, label: "Not playing", detail: (r.reason ?? "").replace(/^designation: /, "Listed ") });
      else if (r.state === "WITHHELD_ROLE_UNCERTAIN") out.push({ team, playerId: r.playerId, name: r.name, label: "Role not yet observed", detail: r.reason ?? "" });
      else if (r.state === "EXCLUDED_NO_CURRENT_ROLE") out.push({ team, playerId: r.playerId, name: r.name, label: "Left the roster", detail: r.reason ?? "" });
      for (const n of r.notModeled ?? []) {
        if (n.family === "player_pass_yds") out.push({ team, playerId: r.playerId, name: r.name, label: "Not this team's passer", detail: "backup quarterback — the passing projection belongs to the depth chart's starter" });
        else if (n.family === "player_receptions") out.push({ team, playerId: r.playerId, name: r.name, label: "No receiving projection", detail: n.reason });
        /* Session 5 — one line per team for a withheld pool, not one per holder: it is a team-level decision. */
        else if (n.state === "WITHHELD_POOL_OVER_ALLOCATED" && !out.some((x) => x.team === team && x.playerId === `pool:${n.family}`)) {
          out.push({ team, playerId: `pool:${n.family}`, name: n.family === "player_rush_yds" ? "Rushing" : n.family === "player_pass_yds" ? "Passing" : "Receiving", label: "Withheld for this game", detail: "the players' modelled shares add up to more of the team's opportunity than exists; these numbers are not renormalised to fit" });
        }
      }
    }
  }
  return out;
}

export default function NotInTheseNumbers({ coverage, arrivals, teams, style }: {
  coverage?: BoardCoverage;
  arrivals?: Record<string, NewArrival[]>;
  teams: string[];
  style?: React.CSSProperties;
}) {
  const rows = notInTheseNumbersRows(coverage, teams);
  if (!rows.length) return null;
  const priorOf = new Map(Object.values(arrivals ?? {}).flat().map((a) => [`${a.team}:${a.playerId}`, a]));
  return (
    <details data-model-detail="not-in-these-numbers" style={{ borderTop: "1px solid var(--vault-rule)", paddingTop: 10, ...style }}>
      <summary className="font-mono" style={{ cursor: "pointer", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", minHeight: 32 }}>
        Model detail — who this forecast leaves out ({rows.length})
      </summary>
      <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {rows.map((r) => {
          const prior = r.label === "Role not yet observed" ? priorOf.get(`${r.team}:${r.playerId}`) : undefined;
          return (
            <li key={`${r.team}:${r.playerId}:${r.label}`} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
              <strong style={{ color: "var(--vault-text-mute)" }}>{r.name}</strong>{" "}
              <span className="font-mono" style={{ fontSize: 10.5 }}>{r.team}</span> — {r.label}: {r.detail}.
              {prior ? (
                <span style={{ display: "block" }}>Historical prior, not used in these numbers: {priorLine(prior)}.</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
