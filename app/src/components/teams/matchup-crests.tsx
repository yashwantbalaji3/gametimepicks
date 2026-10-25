/**
 * The two clubs in a matchup, as crests — or nothing.
 *
 * Server component: it resolves through the shared team-mark index (which reads artifacts) and
 * hands TeamLogo an abbreviation, which is the only thing TeamLogo can use. A matchup where either
 * side cannot be resolved renders NOTHING rather than one crest, because a row wearing a single
 * badge reads as "this pick is on that team" when it is really "we only recognised one of them".
 */
import TeamLogo from "@/components/team-logo";
import { fighterPhotoFor, teamMarkFor } from "@/lib/teams/load-team-marks";
import PlayerAvatar from "@/components/ui/player-avatar";

/* TeamLogo's own size scale — kept in step with it rather than inventing an "xs" it cannot draw. */
type Size = "sm" | "md" | "lg";

/** Sports whose crests TeamLogo draws from a team code. Soccer crests need a numeric id the index does not carry. */
const CREST_SPORTS = new Set(["nba", "mlb", "nhl", "nfl"]);
type CrestSport = "nba" | "mlb" | "nhl" | "nfl";

/**
 * One side of a matchup → its code IN THE CALLER'S SPORT, or null. NBA launch day (2026-10-24): crests were inferred
 * from the team code alone, and NBA codes collide with NFL and MLB ones, so "DET @ CLE" on an NBA archive card drew the
 * Lions and the Guardians. The sport now always comes from the caller: the name index is used only when it agrees on
 * that sport (it resolves full names like "New York Yankees"), a bare code is drawn in the caller's sport, and
 * anything else draws nothing — never another sport's crest.
 */
function sideCode(side: string, sport: CrestSport): string | null {
  const mark = teamMarkFor(side);
  if (mark && mark.sport === sport) return mark.abbr;
  const code = side.trim();
  return /^[A-Z]{2,4}$/.test(code) ? code : null;
}

/** Both clubs of a matchup ("Colorado Rockies @ New York Yankees"), drawn in the sport the caller names. */
export function MatchupCrests({ matchup, sport, size = "sm" }: { matchup: string | null | undefined; sport: string; size?: Size }) {
  const sides = String(matchup ?? "").split(/\s+(?:@|at)\s+/i).map((x) => x.trim()).filter(Boolean);
  const crestSport = CREST_SPORTS.has(sport) ? (sport as CrestSport) : null;
  const codes = crestSport && sides.length === 2 ? sides.map((x) => sideCode(x, crestSport)) : null;
  if (!crestSport || !codes || codes.some((c) => !c)) {
    /* Not two clubs — perhaps two people. A UFC subject is "Fighter A vs Fighter B", and a bout row
       with no mark at all was the last team-bearing surface in the export rendering nothing. The
       photo comes from the current card when we have it and is null otherwise; PlayerAvatar draws
       initials rather than a guessed headshot URL. */
    const people = String(matchup ?? "").split(/\s+(?:vs\.?|v)\s+/i).map((p) => p.trim()).filter(Boolean);
    if (sport === "ufc" && people.length === 2 && people.every((p) => /^[A-Za-z][A-Za-z.'\- ]{2,30}$/.test(p))) {
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
          {people.map((p) => <PlayerAvatar key={p} name={p} photo={fighterPhotoFor(p)} size={18} />)}
        </span>
      );
    }
    return null;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
      <TeamLogo team={codes[0]!} sport={crestSport} size={size} />
      <TeamLogo team={codes[1]!} sport={crestSport} size={size} />
    </span>
  );
}

/**
 * The single club a selection is about ("New York Yankees to win").
 *
 * Falls back to the matchup's two crests when the selection names no team — a total or a run line
 * on the game rather than on a side. That is honest: the row IS about both clubs.
 */
export function SelectionCrest({
  selection,
  matchup,
  sport,
  size = "sm",
}: {
  selection: string | null | undefined;
  matchup?: string | null;
  sport: string;
  size?: Size;
}) {
  const mark = teamMarkFor(selection);
  if (mark && mark.sport === sport) {
    return (
      <span className="inline-flex shrink-0" aria-hidden>
        <TeamLogo team={mark.abbr} sport={mark.sport as never} size={size} />
      </span>
    );
  }
  return matchup ? <MatchupCrests matchup={matchup} sport={sport} size={size} /> : null;
}

export default MatchupCrests;
