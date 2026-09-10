/**
 * The two clubs in a matchup, as crests — or nothing.
 *
 * Server component: it resolves through the shared team-mark index (which reads artifacts) and
 * hands TeamLogo an abbreviation, which is the only thing TeamLogo can use. A matchup where either
 * side cannot be resolved renders NOTHING rather than one crest, because a row wearing a single
 * badge reads as "this pick is on that team" when it is really "we only recognised one of them".
 */
import TeamLogo from "@/components/team-logo";
import { fighterPhotoFor, matchupMarksFor, teamMarkFor } from "@/lib/teams/load-team-marks";
import PlayerAvatar from "@/components/ui/player-avatar";

/* TeamLogo's own size scale — kept in step with it rather than inventing an "xs" it cannot draw. */
type Size = "sm" | "md" | "lg";

/** Both clubs of a matchup ("Colorado Rockies @ New York Yankees"). */
export function MatchupCrests({ matchup, size = "sm" }: { matchup: string | null | undefined; size?: Size }) {
  const marks = matchupMarksFor(matchup);
  if (!marks) {
    /* Not two clubs — perhaps two people. A UFC subject is "Fighter A vs Fighter B", and a bout row
       with no mark at all was the last team-bearing surface in the export rendering nothing. The
       photo comes from the current card when we have it and is null otherwise; PlayerAvatar draws
       initials rather than a guessed headshot URL. */
    const people = String(matchup ?? "").split(/\s+(?:vs\.?|v)\s+/i).map((p) => p.trim()).filter(Boolean);
    if (people.length === 2 && people.every((p) => /^[A-Za-z][A-Za-z.'\- ]{2,30}$/.test(p))) {
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
      <TeamLogo team={marks.away.abbr} sport={marks.away.sport as never} size={size} />
      <TeamLogo team={marks.home.abbr} sport={marks.home.sport as never} size={size} />
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
  size = "sm",
}: {
  selection: string | null | undefined;
  matchup?: string | null;
  size?: Size;
}) {
  const mark = teamMarkFor(selection);
  if (mark) {
    return (
      <span className="inline-flex shrink-0" aria-hidden>
        <TeamLogo team={mark.abbr} sport={mark.sport as never} size={size} />
      </span>
    );
  }
  return matchup ? <MatchupCrests matchup={matchup} size={size} /> : null;
}

export default MatchupCrests;
