/**
 * TonightMatchupCard — large visual "what's on tonight" card.
 *
 * The homepage tonight rail and Projections hub previously rendered
 * small label-heavy SportCard tiles. Friends-test feedback: too
 * dashboard-y, too small, not visually exciting. This component
 * replaces it with a single big matchup card per live game:
 *
 *   - large team badges (gradient color rings)
 *   - matchup AWAY @ HOME in big display type
 *   - playoff context / tipoff time
 *   - projection count + (when present) the market line
 *   - one strong CTA into the model board
 *
 * Pure presentation — every value is passed in, no fabricated stats.
 */
import Link from "next/link";
import TeamLogo from "./team-logo";

interface Props {
  /** Sport label and emoji (🏀 NBA / ⚾ MLB / etc.) */
  sportEmoji: string;
  sportLabel: string;
  /** Sport key used to pick the right ESPN logo CDN path. */
  sportKey: "nba" | "mlb" | "nhl";
  /** Away team abbreviation (or null for "team TBD" rendering). */
  awayTeam: string | null;
  homeTeam: string | null;
  /** Optional full team names for screen-reader-friendly title. */
  awayTeamFull?: string | null;
  homeTeamFull?: string | null;
  /** Optional context line — playoff round / Game N / pitcher matchup */
  contextLine?: string | null;
  /** Tipoff time string, e.g. "8:00 PM ET" */
  tipoff?: string | null;
  /** Projection count + side stats */
  projectionCount?: number;
  strongerSignalCount?: number;
  /** Market line strings (already formatted, e.g. "NY -6.5" / "O/U 215.5") */
  spread?: string | null;
  total?: string | null;
  moneyline?: string | null;
  /** Where the primary CTA links */
  ctaHref: string;
  ctaLabel?: string;
  /** "live" pulses the dot; "upcoming" is solid; "pending" is muted */
  status?: "live" | "upcoming" | "pending";
}

export default function TonightMatchupCard({
  sportEmoji,
  sportLabel,
  sportKey,
  awayTeam,
  homeTeam,
  awayTeamFull,
  homeTeamFull,
  contextLine,
  tipoff,
  projectionCount,
  strongerSignalCount,
  spread,
  total,
  moneyline,
  ctaHref,
  ctaLabel,
  status = "live",
}: Props) {
  const statusColor =
    status === "live"
      ? "var(--vault-success)"
      : status === "upcoming"
        ? "var(--vault-gold-bright)"
        : "var(--vault-text-faint)";
  const statusLabel =
    status === "live"
      ? "Live tonight"
      : status === "upcoming"
        ? "Pregame"
        : "Lines pending";

  const hasMarketRow = Boolean(spread || total || moneyline);

  return (
    <article
      className="gtp-aurora-halo rounded-[12px] relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(26, 16, 11,0.92) 0%, rgba(26, 16, 11,0.55) 100%)",
        border: "1px solid var(--vault-border)",
      }}
      aria-label={`${sportLabel}: ${awayTeam ?? "TBD"} at ${homeTeam ?? "TBD"} tonight`}
    >
      {/* Top accent rule */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${statusColor}, transparent)`,
          opacity: 0.65,
        }}
      />

      <div className="px-5 sm:px-7 py-5 sm:py-7">
        {/* Eyebrow row: sport + status pill + tipoff */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden
              role="img"
              style={{ fontSize: 22, lineHeight: 1 }}
            >
              {sportEmoji}
            </span>
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 11 }}
            >
              {sportLabel} · tonight
            </span>
          </div>
          <div className="inline-flex items-center gap-3">
            {tipoff && (
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
              >
                {tipoff}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
              style={{
                background:
                  status === "live"
                    ? "rgba(74, 222, 128, 0.10)"
                    : status === "upcoming"
                      ? "var(--vault-warn-dim)"
                      : "rgba(26, 16, 11,0.55)",
                color: statusColor,
                fontSize: 10,
                border: `1px solid ${statusColor}`,
              }}
            >
              <span
                aria-hidden
                className={`inline-block w-1.5 h-1.5 rounded-full ${status === "live" ? "gtp-neon-pulse" : ""}`}
                style={{ background: statusColor }}
              />
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Big matchup row — official ESPN team logos with TeamBadge
            monogram fallback on load error. */}
        <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
          <TeamLogo team={awayTeam} sport={sportKey} size="xl" />
          <div className="flex-1 min-w-0">
            <h2
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(26px, 4.5vw, 38px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontWeight: 600,
              }}
            >
              <span>{awayTeam ?? "TBD"}</span>
              <span
                style={{
                  color: "var(--vault-text-mute)",
                  fontSize: "0.55em",
                  margin: "0 12px",
                  fontWeight: 400,
                }}
              >
                @
              </span>
              <span>{homeTeam ?? "TBD"}</span>
            </h2>
            {(awayTeamFull || homeTeamFull) && (
              <div
                className="font-mono"
                style={{
                  color: "var(--vault-text-mute)",
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {awayTeamFull}
                {awayTeamFull && homeTeamFull ? " · " : ""}
                {homeTeamFull}
              </div>
            )}
            {contextLine && (
              <div
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  color: "var(--vault-gold)",
                  fontSize: 10,
                  marginTop: 6,
                }}
              >
                {contextLine}
              </div>
            )}
          </div>
          <TeamLogo team={homeTeam} sport={sportKey} size="xl" />
        </div>

        {/* Market line row (only when present) */}
        {hasMarketRow && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            {spread && (
              <MarketChip
                label={sportKey === "mlb" ? "Run line" : "Spread"}
                value={spread}
              />
            )}
            {total && <MarketChip label="Total" value={total} />}
            {moneyline && <MarketChip label="ML" value={moneyline} />}
          </div>
        )}

        {/* Bottom row: stats + CTA */}
        <div
          className="mt-5 flex items-center justify-between gap-3 flex-wrap pt-4"
          style={{ borderTop: "1px solid var(--vault-rule)" }}
        >
          <div className="flex items-baseline gap-5">
            {typeof projectionCount === "number" && (
              <div>
                <div
                  className="font-display font-semibold tabular tracking-tight"
                  style={{
                    color: "var(--vault-gold-bright)",
                    fontSize: 26,
                    lineHeight: 1,
                  }}
                >
                  {projectionCount}
                </div>
                <div
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  Projections
                </div>
              </div>
            )}
            {typeof strongerSignalCount === "number" &&
              strongerSignalCount > 0 && (
                <div>
                  <div
                    className="font-display font-semibold tabular tracking-tight"
                    style={{
                      color: "var(--vault-success)",
                      fontSize: 26,
                      lineHeight: 1,
                    }}
                  >
                    {strongerSignalCount}
                  </div>
                  <div
                    className="font-mono uppercase tracking-[0.16em]"
                    style={{
                      color: "var(--vault-text-mute)",
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    Category A rows
                  </div>
                </div>
              )}
          </div>
          <Link href={ctaHref} className="gtp-btn-primary">
            {ctaLabel ?? `Open ${sportLabel}`}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function MarketChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-2 px-3 py-1.5 rounded-[5px]"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
      >
        {value}
      </span>
    </span>
  );
}
