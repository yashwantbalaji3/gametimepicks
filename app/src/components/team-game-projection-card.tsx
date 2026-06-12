/**
 * TeamGameProjectionCard — compact "team view" that sits above the
 * player projection grid on `/nba/board`. Pure server component.
 *
 * Honest framing:
 *   - The projected PTS is the sum of just the players who carry prop
 *     lines on tonight's board. Bench scoring isn't modeled, so the
 *     totals are SCORING-RATE estimates, not full team box scores. The
 *     card calls this out below the headline so readers don't mistake
 *     them for predicted final scores.
 *   - When `dataQualityFlag` is set, the headline downgrades to a
 *     "partial data" treatment instead of presenting a bogus margin.
 *   - When `marketSpread` / `marketMoneyline` are null, the right-side
 *     column shows "market line pending" — never a fabricated number.
 *
 * Confidence colors:
 *   high   = gold authority
 *   medium = neutral blue
 *   low    = subdued amber
 *
 * No links, no CTAs — this is informational density above the player
 * grid, not a navigation surface.
 */
import type { TeamGameProjection } from "@/lib/data-team-projection";
import StatusPill, { type StatusPillKind } from "@/components/status-pill";
import TeamBadge from "@/components/team-badge";

interface Props {
  projection: TeamGameProjection;
}

const CONFIDENCE_STYLE: Record<
  TeamGameProjection["confidence"],
  { label: string; pill: StatusPillKind; accent: string }
> = {
  high: { label: "Confidence: high", pill: "settled", accent: "var(--vault-gold-bright)" },
  medium: { label: "Confidence: medium", pill: "upcoming", accent: "rgba(170, 205, 255, 1)" },
  low: { label: "Confidence: low", pill: "warn", accent: "var(--vault-warn-amber)" },
};

export default function TeamGameProjectionCard({ projection }: Props) {
  const c = CONFIDENCE_STYLE[projection.confidence];
  const partial = projection.dataQualityFlag === "team_attribution_partial";
  const ctx = projection.playoffContext;
  // Why "withheld" can fire:
  //   1) explicit publicDisplayMode === "withheld" from the artifact
  //   2) one team has 0 contributing players (attribution gap)
  //   3) dataQualityFlag is set
  //   4) **(new, 2026-05-20)** no real market spread on disk —
  //      summing player-prop projections without a market reference
  //      can produce unrealistic margins like "SA favored by 16.1",
  //      so the projected score / margin / winner are withheld
  //      from the public UI until real market lines exist
  const noMarketLine = projection.marketSpread === null;
  const isWithheld =
    projection.publicDisplayMode === "withheld" ||
    projection.home.contributingPlayerCount <= 0 ||
    projection.away.contributingPlayerCount <= 0 ||
    partial ||
    noMarketLine;

  // Pick the user-facing reason that best explains the withheld state.
  // We surface the most specific cause first so a reader knows whether
  // it's an attribution problem vs a market-data problem.
  const withheldReasonHeadline = partial
    ? "Team view unavailable · player-team attribution incomplete"
    : projection.home.contributingPlayerCount <= 0 ||
        projection.away.contributingPlayerCount <= 0
      ? "Team view unavailable · player-team attribution incomplete"
      : "Team view pending market line";
  const withheldReasonBody = partial
    ? "Player props are live, but the team projection is withheld until both sides have complete team attribution. The player board below is unaffected and still shows every model lean."
    : projection.home.contributingPlayerCount <= 0 ||
        projection.away.contributingPlayerCount <= 0
      ? "Player props are live, but the team projection is withheld until both sides have complete team attribution. The player board below is unaffected and still shows every model lean."
      : "Player props are live below. The projected score and margin unlock once a real market spread / total is on disk so the model has a market reference. We refuse to publish an unrealistic derived margin without one.";

  // Early withheld branch — show an honest panel that names the
  // exact reason. The player-prop board below this card on /nba/board
  // is unaffected and continues to render the 86 May 20 leans.
  if (isWithheld) {
    const wMatchParts = projection.matchup.split("@").map((p) => p.trim());
    const wAway = wMatchParts[0] || projection.away.teamAbbr;
    const wHome = wMatchParts[1] || projection.home.teamAbbr;
    return (
      <article
        className="gtp-premium-tile relative p-4 sm:p-5 reveal"
        aria-label={`Team-view unavailable for ${projection.matchup}`}
      >
        <header className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Matchup view · educational
          </span>
          {ctx.round && ctx.gameNumber != null && (
            <StatusPill
              kind="neutral"
              label={`${ctx.round} · Game ${ctx.gameNumber}`}
            />
          )}
          <StatusPill kind="warn" label="Unavailable" hideDot />
        </header>

        {/* Matchup hero — team badges are always shown so the
            withheld panel still feels like a real game card. */}
        <div className="flex items-center gap-3 mb-4">
          <TeamBadge team={wAway} size="lg" />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            @
          </span>
          <TeamBadge team={wHome} size="lg" />
          <div className="ml-auto flex flex-col items-end gap-0.5">
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              {projection.date}
            </span>
          </div>
        </div>

        <h3
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: 18,
            lineHeight: 1.25,
            letterSpacing: "-0.005em",
          }}
        >
          {withheldReasonHeadline}
        </h3>
        <p
          className="mt-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {withheldReasonBody}
        </p>
        <p
          className="mt-3 text-[10.5px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Educational analytics — not betting advice. Audit details
          are preserved in the underlying artifact for future review.
        </p>
      </article>
    );
  }

  // Parse matchup "AWAY @ HOME" into the two abbrevs so the hero
  // matchup row shows team badges + the "@".
  const matchParts = projection.matchup.split("@").map((p) => p.trim());
  const awayAbbr = matchParts[0] || projection.away.teamAbbr;
  const homeAbbr = matchParts[1] || projection.home.teamAbbr;

  return (
    <article
      className="gtp-premium-tile relative p-4 sm:p-5 reveal"
      aria-label={`Team-view projection for ${projection.matchup}`}
    >
      {/* Top row — eyebrow + status pills */}
      <header className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Matchup view · educational
        </span>
        {ctx.round && ctx.gameNumber != null && (
          <StatusPill
            kind="neutral"
            label={`${ctx.round} · Game ${ctx.gameNumber}`}
          />
        )}
        <StatusPill kind={c.pill} label={c.label} />
      </header>

      {/* Matchup hero — large team badges with "@" between */}
      <div className="flex items-center gap-3 mb-4">
        <TeamBadge
          team={awayAbbr}
          size="lg"
          highlight={projection.projectedWinner === projection.away.teamAbbr}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          @
        </span>
        <TeamBadge
          team={homeAbbr}
          size="lg"
          highlight={projection.projectedWinner === projection.home.teamAbbr}
        />
        <div className="ml-auto flex flex-col items-end gap-0.5">
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            {projection.date}
          </span>
        </div>
      </div>

      {/* Matchup row — team sides + projected points */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-stretch">
        <TeamSide
          team={projection.away}
          favored={
            projection.projectedWinner === projection.away.teamAbbr
          }
          partial={partial}
        />
        <div className="flex flex-col items-center justify-center gap-1 py-1">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{
              color: "var(--vault-text-mute)",
              fontSize: 10,
            }}
          >
            Projected margin
          </span>
          <span
            className="font-display font-semibold gtp-stat-value"
            style={{
              color: partial
                ? "var(--vault-text-faint)"
                : "var(--vault-gold-bright)",
              fontSize: "clamp(26px, 4.5vw, 32px)",
              lineHeight: 1,
            }}
          >
            {partial
              ? "—"
              : projection.projectedMargin === 0
              ? "EVEN"
              : (projection.projectedMargin > 0 ? "+" : "") +
                projection.projectedMargin.toFixed(1)}
          </span>
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            {partial
              ? "data incomplete"
              : projection.projectedWinner
              ? `→ ${projection.projectedWinner} favored`
              : "no edge"}
          </span>
        </div>
        <TeamSide
          team={projection.home}
          favored={
            projection.projectedWinner === projection.home.teamAbbr
          }
          partial={partial}
        />
      </div>

      {/* Market line row — populated only when real odds exist */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MarketCell
          label="Market spread (home)"
          value={
            projection.marketSpread !== null
              ? `${projection.marketSpread > 0 ? "+" : ""}${projection.marketSpread.toFixed(1)}`
              : null
          }
          fallback="Spread pending"
        />
        <MarketCell
          label="Moneyline"
          value={
            projection.marketMoneyline
              ? `${formatMl(projection.marketMoneyline.home)} home · ${formatMl(projection.marketMoneyline.away)} away`
              : null
          }
          fallback="Moneyline pending"
        />
        <MarketCell
          label="Total (O/U)"
          value={
            projection.marketTotal !== null && projection.marketTotal !== undefined
              ? projection.marketTotal.toFixed(1)
              : null
          }
          fallback="Total pending"
        />
      </div>

      {/* Model PTS sum vs market total — honest framing.
          The model sum is just the primary-rotation projected PTS;
          bench scoring isn't modeled, so it nearly always trails the
          market O/U. We show the gap so readers see exactly that
          instead of mistaking the model number for a final-score call. */}
      {projection.marketTotal !== null && projection.marketTotal !== undefined && (
        <div
          className="mt-3 rounded-[6px] px-3 py-2"
          style={{
            background: "rgba(26, 16, 11, 0.45)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            Model PTS sum vs market total
          </span>
          <div
            className="mt-0.5 text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Primary-rotation sum{" "}
            <strong style={{ color: "var(--vault-text)" }}>
              {(projection.home.projectedPts + projection.away.projectedPts).toFixed(1)}
            </strong>{" "}
            vs market{" "}
            <strong style={{ color: "var(--vault-text)" }}>
              {projection.marketTotal.toFixed(1)}
            </strong>
            . The model sum reflects only players carrying prop lines —
            bench scoring is not modeled, so it usually trails the market.
          </div>
        </div>
      )}

      {/* Reasons — always shown so readers see exactly what feeds the
          team view. Honest about partial data + missing market lines. */}
      <ul
        className="mt-4 text-[11.5px] leading-relaxed space-y-1"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {projection.reasons.map((r, i) => (
          <li
            key={i}
            className="flex gap-2"
            style={{
              alignItems: "flex-start",
            }}
          >
            <span
              aria-hidden
              style={{
                color: "var(--vault-gold)",
                lineHeight: 1.6,
                fontSize: 11,
              }}
            >
              ·
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <p
        className="mt-3 text-[10.5px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Educational analytics — not betting advice. Projected points are
        the sum of just the players with model leans on tonight's board;
        bench scoring is not modeled. See{" "}
        <span style={{ color: "var(--vault-gold)" }}>methodology</span>{" "}
        for the inputs.
      </p>
    </article>
  );
}

function TeamSide({
  team,
  favored,
  partial,
}: {
  team: TeamGameProjection["home"];
  favored: boolean;
  partial: boolean;
}) {
  const isThin = team.contributingPlayerCount < 3;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[8px] px-3 py-3"
      style={{
        background: "rgba(26, 16, 11, 0.55)",
        border: favored && !partial
          ? "1px solid rgba(240, 199, 94, 0.40)"
          : "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <TeamBadge team={team.teamAbbr} size="md" highlight={favored && !partial} />
        <div className="flex flex-col gap-0.5">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{
              color: "var(--vault-text-mute)",
              fontSize: 10,
            }}
          >
            {team.isHome === true
              ? "Home"
              : team.isHome === false
              ? "Away"
              : "Side"}
          </span>
          <span
            className="font-display font-semibold tracking-tight inline-flex items-center gap-1.5"
            style={{
              color: "var(--vault-text)",
              fontSize: 22,
              lineHeight: 1,
              letterSpacing: "-0.01em",
            }}
          >
            {team.teamAbbr}
            {favored && !partial && (
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 6px rgba(240, 199, 94, 0.6)",
                }}
              />
            )}
          </span>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-display font-semibold gtp-stat-value"
          style={{
            color: isThin
              ? "var(--vault-text-faint)"
              : "var(--vault-text)",
            fontSize: "clamp(28px, 5vw, 38px)",
            lineHeight: 1,
          }}
        >
          {team.projectedPts.toFixed(1)}
        </span>
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 10,
          }}
        >
          proj pts
        </span>
      </div>
      <span
        className="font-mono"
        style={{
          color: "var(--vault-text-mute)",
          fontSize: 10,
        }}
      >
        {team.contributingPlayerCount} player
        {team.contributingPlayerCount === 1 ? "" : "s"} on board
        {isThin ? " · thin" : ""}
      </span>
    </div>
  );
}

function MarketCell({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null;
  fallback: string;
}) {
  return (
    <div
      className="rounded-[6px] px-3 py-2.5"
      style={{
        background: "rgba(26, 16, 11, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-display"
        style={{
          color:
            value === null
              ? "var(--vault-text-faint)"
              : "var(--vault-text)",
          fontSize: 14,
          letterSpacing: "-0.005em",
        }}
      >
        {value ?? fallback}
      </div>
    </div>
  );
}

function formatMl(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}
