/**
 * Phase 16 — PropsComingSoon.
 *
 * Premium empty state rendered ABOVE the props-unavailable card when the
 * board is in `ScheduleLiveOddsUnavailable` mode (real schedule, no
 * model leans). Replaces the previous "schedule live · odds API key not
 * set · re-run pipeline" admin-y copy with a public-friendly story:
 *
 *   1. The schedule for tonight is live (visible in the games strip).
 *   2. Player props will appear once the next refresh activates.
 *   3. Subscribe to be notified when leans land.
 *
 * Pure presentational. No tooling exposure. No env vars. No file paths.
 */
import Link from "next/link";

interface Props {
  /** Number of NBA games on the schedule. Drives the headline. */
  gameCount: number;
  /** Optional list of game labels (e.g. "CLE @ DET") to surface. */
  gameLabels?: string[];
}

export default function PropsComingSoon({ gameCount, gameLabels }: Props) {
  const hasGames = gameCount > 0;
  const labels = (gameLabels ?? []).slice(0, 6);

  return (
    <div
      className="relative rounded-[3px] p-6 sm:p-10 overflow-hidden vault-rise"
      style={{
        background:
          "linear-gradient(180deg, var(--vault-panel) 0%, var(--vault-panel-elevated) 100%)",
        border: "1px solid var(--vault-border-strong)",
        boxShadow: "0 0 60px rgba(212, 175, 55, 0.04)",
      }}
    >
      {/* Faint grid texture */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--vault-gold) 1px, transparent 1px), linear-gradient(90deg, var(--vault-gold) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      {/* Soft gold radial glow */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none opacity-50"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(212, 175, 55, 0.10), transparent 55%)",
        }}
        aria-hidden
      />

      <div className="relative">
        {/* Status pill */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-gold-bright)",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
            style={{ background: "var(--vault-gold-bright)" }}
            aria-hidden
          />
          {hasGames
            ? "schedule live · awaiting props"
            : "awaiting next slate"}
        </div>

        {/* Heading */}
        <h2
          className="mt-6 font-display text-[26px] sm:text-[34px] md:text-[42px] tracking-tightest font-semibold leading-[1.05] max-w-3xl"
          style={{ color: "var(--vault-text)" }}
        >
          {hasGames ? (
            <>
              Tonight&apos;s schedule is in.{" "}
              <span style={{ color: "var(--vault-gold-bright)" }}>
                Model leans land next.
              </span>
            </>
          ) : (
            <>The next slate is on the way.</>
          )}
        </h2>

        {/* Lead */}
        <p
          className="mt-4 text-[14px] sm:text-[15px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {hasGames ? (
            <>
              The schedule for tonight is live — {gameCount} NBA{" "}
              {gameCount === 1 ? "game" : "games"} confirmed. Player props,
              projections, and edge analysis publish on the next refresh
              cycle. Want to know the moment leans go live?
            </>
          ) : (
            <>
              The model board refreshes throughout the day. Once the next
              slate is generated, projections, edges, and confidence tiers
              land here automatically.
            </>
          )}
        </p>

        {/* Game labels strip */}
        {labels.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center px-3 py-1.5 rounded-[2px] font-mono text-[11px] tracking-tight"
                style={{
                  background: "var(--vault-panel)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text)",
                }}
              >
                {label}
              </span>
            ))}
            {gameCount > labels.length && (
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-[2px] font-mono text-[11px]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                +{gameCount - labels.length} more
              </span>
            )}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="#newsletter-signup"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] font-medium text-[14px] tracking-tight transition-all vault-glow-hover"
            style={{
              background: "var(--vault-gold)",
              color: "#06070A",
            }}
          >
            Notify me when leans land
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
            style={{
              border: "1px solid var(--vault-border-strong)",
              color: "var(--vault-text)",
            }}
          >
            How the model works
          </Link>
        </div>
      </div>
    </div>
  );
}
