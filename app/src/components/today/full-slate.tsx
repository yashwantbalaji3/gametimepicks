/**
 * TodayFullSlate — the "every game on the slate" board on the Daily Model Hub. Where the featured-sim row
 * is a CAPPED highlight reel (top 5), this lists EVERY game so none is stranded — but organized by
 * READINESS (Simulations ready › Model reads › Market context › Reports/awaiting inputs) so a user can
 * pick something useful without a fabricated "top pick". Each row carries the matchup, an honest
 * availability chip, the real scheduled first pitch, a NEUTRAL "why open this" explanation, and a clear
 * per-game action linking to the canonical, doubleheader-distinct report. A factual summary line and a
 * /learn trust link sit at the top.
 *
 * Presentational only: it renders the grouped `SlateGamesResult` the server page derived via
 * slateGames(...). Every label/explanation/action/tier comes from the shared availability contract — this
 * component decides nothing about availability and fabricates nothing.
 */
import Link from "next/link";
import MatchupIdentity from "@/components/ui/matchup-identity";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import { firstOfRun, sharedValue } from "@/lib/ui/repeat-suppression";
import type { SlateGameRow, SlateGroup, SlateSummary } from "@/lib/today/slate-games";

const CHIP: Record<SlateGameRow["tone"], { color: string; bg: string }> = {
  success: { color: "var(--vault-success)", bg: "var(--vault-success-dim)" },
  gold: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  mute: { color: "var(--vault-text-mute)", bg: "var(--vault-wash)" },
};

function SlateRow({ g, showExplanation }: { g: SlateGameRow; showExplanation: boolean }) {
  const chip = CHIP[g.tone];
  const time = formatEtTime(g.firstPitchIso);
  const meta = [time ? `First pitch ${time}` : null, g.startState === "started" ? "Started" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={g.href}
      aria-label={`${g.teams.away} at ${g.teams.home} — ${g.label}. ${g.explanation}`}
      className="vault-glow-hover vault-press flex flex-col gap-1.5 rounded-[12px] px-3.5 py-3"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <MatchupIdentity homeName={g.teams.home} awayName={g.teams.away} homeLogo={g.homeLogo} awayLogo={g.awayLogo} size="sm" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
              {g.teams.away} @ {g.teams.home}
            </span>
            {meta ? <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{meta}</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap" style={{ fontSize: 8.5, color: chip.color, background: chip.bg }}>
            {g.label}
          </span>
          <span className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>
            {g.actionLabel}
          </span>
        </div>
      </div>
      {/* Neutral "why open this game?" line — never a pick or a confidence claim. Hidden on the row
          when the group above already states it for every game it covers; the aria-label keeps it
          on the row either way, so a reader landing on one row alone is never short of it. */}
      {showExplanation ? (
        <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.3 }}>{g.explanation}</span>
      ) : null}
      {/* Compact canonical prediction (Sprint 009) — the SAME decision the Game Report hero states. */}
      {g.predictionLine ? (
        <span className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 10, letterSpacing: "0.02em" }}>
          <span style={{ color: "var(--vault-text-faint)" }}>Prediction: </span>
          {g.predictionLine}
        </span>
      ) : null}
    </Link>
  );
}

/*
 * SAY IT ONCE FOR THE GROUP, NOT ONCE PER GAME (P287).
 *
 * The explanation is a property of the availability LEVEL, not of the game — every simulation-ready
 * game that has kicked off carries the identical sentence. On a fifteen-game slate that printed
 * "Game started — the pregame simulation and its uncertainty range are preserved for review." ten
 * times and "Simulation report and uncertainty range are available." five more, under one heading,
 * beside a chip and a "Started" stamp that already said the same thing. Around 1,100 characters of
 * the board, repeating two facts.
 *
 * ONE RULE, in one place: a row never repeats the sentence the line above it already said. The rule
 * itself lives in lib/ui/repeat-suppression so /results' per-date accounting collapses identically.
 *
 * When every game in the group says the same thing, that is the group's header — one sentence for
 * the whole block. Otherwise the sentence prints at the head of each run of games that share it, so
 * it still introduces the rows it describes and still distinguishes them from the rows that follow.
 * A group of one always prints it: there is no line above to have said it.
 *
 * Nothing is dropped. The contract still carries `explanation` per game, and each row's aria-label
 * still reads it, so a screen reader on one row hears exactly the words it always did.
 */
function Group({ group }: { group: SlateGroup }) {
  const notes = group.games.map((g) => g.explanation);
  const headerNote = sharedValue(notes);
  const showOnRow = firstOfRun(notes);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <h3 className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{group.heading}</h3>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{group.games.length}</span>
        </div>
        {headerNote ? (
          <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.35 }}>{headerNote}</p>
        ) : null}
      </div>
      {group.games.map((g, i) => (
        <SlateRow key={g.slug} g={g} showExplanation={headerNote === null && showOnRow[i]} />
      ))}
    </div>
  );
}

export default function TodayFullSlate({
  groups,
  summary,
  readinessNote,
}: {
  groups: SlateGroup[];
  summary: SlateSummary;
  readinessNote?: string | null;
}) {
  if (groups.length === 0) return null; // no slate today → the slate header / liveness banner already says so
  return (
    <section aria-label="Every game on the slate" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
          Every game on the slate
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {summary.total} {summary.total === 1 ? "game" : "games"}
        </span>
      </div>
      {/* Explicit fresh-and-complete vs fresh-and-partial readiness (stale/no-games handled by the banner). */}
      {readinessNote ? (
        <p className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 11.5, lineHeight: 1.3 }}>{readinessNote}</p>
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* Factual count line — grouped by readiness, never a performance or confidence claim. */}
        <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.35 }}>{summary.text}</p>
        {/* Trust: a first-timer can learn what each availability tier means in one tap. */}
        <Link href="/learn" className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>
          How these reads are built →
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <Group key={group.level} group={group} />
        ))}
      </div>
    </section>
  );
}
