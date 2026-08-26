import Link from "next/link";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import { mlbHeadshotUrl } from "@/lib/player-headshots";
import { type HomerNukesBoard, sharedPitcher } from "@/lib/mlb/homer-nukes-board";

/**
 * HOMER NUKES — the model's five most likely home runs today.
 *
 * A LIST, not a parlay. The retired product bundled five longshots into one +3547 ticket that paid
 * only if every leg landed; this publishes five independent probabilities, each of which settles on
 * its own. That is both the more useful read and the more honest one — a 30% pick that misses is
 * the model working as described, whereas a five-leg ticket hides which leg was wrong.
 *
 * Each row carries the number, the portrait, both crests, and the sentence that produced the number.
 * The reasoning is not decoration: it names the season line, the opposing starter's homer rate and
 * the league baseline, so a reader can check the claim rather than trust it.
 */

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Widest bar in the set fills the track, so the eye compares picks against each other. */
function Gauge({ value, max }: { value: number; max: number }) {
  const share = max > 0 ? Math.max(0.06, value / max) : 0;
  return (
    <div
      className="relative overflow-hidden rounded-full"
      style={{ height: 6, background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", border: "1px solid var(--vault-rule)" }}
      aria-hidden
    >
      <div
        className="gtp-hr-gauge-fill absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${share * 100}%`,
          background: "linear-gradient(90deg, var(--sport-theme) 0%, var(--vault-heat, var(--vault-accent)) 100%)",
          boxShadow: "0 0 10px var(--sport-theme-glow)",
        }}
      />
    </div>
  );
}

export default function HomerNukesBoardSection({ board }: { board: HomerNukesBoard | null }) {
  if (!board || board.picks.length === 0) return null;
  const picks = board.picks;
  const max = Math.max(...picks.map((p) => p.probability));
  const shared = sharedPitcher(picks);

  return (
    <section aria-labelledby="homer-nukes-heading" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="font-mono uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--sport-theme-ink)", fontSize: 10 }}>
            <span aria-hidden>💣</span> Homer Nukes · {board.slate.games} games
          </div>
          <h2 id="homer-nukes-heading" className="mt-1" style={{ color: "var(--vault-text)", fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>
            Most likely to go deep today
          </h2>
          <p className="m-0 mt-1.5 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13.5, lineHeight: 1.55 }}>
            The model&apos;s five highest home-run probabilities from {board.slate.candidatesRanked} batter-vs-starter
            pairings. Each is its own number — this is not a card, and the five are not combined.
          </p>
        </div>
        <Link href="/mlb/board" className="font-mono uppercase tracking-[0.14em] shrink-0" style={{ color: "var(--sport-theme-ink)", fontSize: 10.5 }}>
          Full model board →
        </Link>
      </div>

      {/* The model concentrating on one arm is a finding, so it is stated rather than smoothed away. */}
      {shared ? (
        <p className="m-0 mb-3 rounded-[8px] px-3 py-2" style={{ background: "var(--sport-theme-wash)", border: "1px solid var(--sport-theme-rule)", color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          {shared.count} of these {picks.length} face <strong style={{ color: "var(--vault-text)" }}>{shared.pitcher}</strong> — the model reads him as
          today&apos;s most homer-prone start, so the board clusters there on purpose.
        </p>
      ) : null}

      <ol className="flex flex-col gap-2 list-none p-0 m-0">
        {picks.map((p, i) => (
          <li
            key={`${p.playerId}-${p.gamePk}`}
            className="gtp-hr-row rounded-[14px] px-3.5 py-3"
            style={{ border: "1px solid var(--vault-border-strong)", background: i === 0 ? "var(--sport-theme-wash)" : "color-mix(in srgb, var(--vault-wash-base) 1.8%, transparent)" }}
          >
            <div className="flex items-start gap-3">
              <span
                className="font-mono shrink-0 inline-flex items-center justify-center rounded-full"
                style={{ width: 22, height: 22, marginTop: 20, fontSize: 11, fontWeight: 700, color: "var(--sport-theme-ink)", border: "1px solid var(--sport-theme-rule)" }}
                aria-label={`Rank ${i + 1}`}
              >
                {i + 1}
              </span>

              <PlayerAvatar
                playerId={p.playerId}
                photoUrl={mlbHeadshotUrl(p.playerId)}
                playerName={p.player}
                team={p.teamAbbr ?? undefined}
                sport="mlb"
                size="lg"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontWeight: 700, fontSize: 15 }}>{p.player}</span>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <TeamLogo team={p.teamAbbr ?? undefined} sport="mlb" size="sm" />
                    <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>vs</span>
                    <TeamLogo team={p.opponentAbbr ?? undefined} sport="mlb" size="sm" />
                  </span>
                </div>

                <div className="mt-0.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
                  {p.matchup}{p.opposingPitcher ? ` · off ${p.opposingPitcher}` : ""}{p.venue ? ` · ${p.venue}` : ""}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <span className="font-display tabular-nums shrink-0" style={{ color: "var(--vault-text)", fontWeight: 800, fontSize: 19, minWidth: 62 }}>
                    {pct(p.probability)}
                  </span>
                  <span className="flex-1"><Gauge value={p.probability} max={max} /></span>
                </div>

                <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.55 }}>{p.reason}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Stated in the open, not folded away: the limits are what tell a reader how far to trust the number. */}
      <details className="mt-3 rounded-[10px] px-3.5 py-2.5" style={{ border: "1px solid var(--vault-rule)" }}>
        <summary className="cursor-pointer" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
          How these are calculated, and what they leave out
        </summary>
        <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>{board.model.method}</p>
        <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          League baseline is {pct(board.model.leagueHrPerPa)} of plate appearances, over {board.model.expectedPlateAppearances} trips
          per lineup slot. A batter needs {board.model.minimumPa} plate appearances to be ranked at all, and every rate is pulled
          toward the league mean so a hot fortnight cannot top the board on its own.
        </p>
        <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          <strong style={{ color: "var(--vault-text)" }}>Not in the model:</strong> {board.model.notModelled.join(", ")}.
        </p>
        <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>{board.model.honestLimit}</p>
      </details>
    </section>
  );
}
