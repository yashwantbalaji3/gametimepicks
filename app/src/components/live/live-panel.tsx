"use client";
/**
 * THE LIVE PANEL (v1.1 · §5.2) — live fact beside frozen forecast, on a page that already owns both.
 *
 * LAYOUT IS THE CONTRACT. Two labelled regions, never interleaved:
 *
 *   LIVE NOW             what the feed says, with its age, refusable at any moment
 *   PREGAME GAMETIME     what the model said before kickoff, with its stamp, never recomputed
 *
 * The pregame side is rendered from props the SERVER read out of the committed artifact. It does not
 * depend on the live fetch at all, so a total provider outage leaves the forecast fully intact —
 * §21.8's requirement, satisfied structurally rather than by a fallback.
 *
 * The panel renders nothing when the flag is off: no markup, no request, no cost.
 */
import { etDateOf, liveReadyFor } from "@/lib/live/client";
import { comparisonSentence, joinNflPlayerBoard } from "@/lib/live/forecast-join.mjs";
import { useLiveEvent } from "./use-live-event";
import {
  FreshnessLine, LiveBadge, LivePeriodLine, LiveRangeRow, LiveScoreStrip, LiveUnavailable,
} from "./live-primitives";

const MONO = "var(--font-mono)";

/**
 * The frozen-at instant, in ET.
 *
 * Formatted HERE rather than by each caller: "frozen at 2026-09-16T01:35:10.000Z" is a checkable
 * claim that reads like a machine identifier, and a caller that forgets to format it publishes that
 * string. An unparseable instant returns null and the panel falls back to the timeless sentence —
 * never a half-rendered date.
 */
function frozenStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(t)) + " ET";
}

function Region({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      style={{ border: "1px solid var(--vault-border)", borderRadius: 4, padding: 12, background: "var(--vault-panel)", minWidth: 0 }}
    >
      <h3 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: "0 0 8px", fontWeight: 400 }}>
        {title}
      </h3>
      {children}
      {note && <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>{note}</p>}
    </section>
  );
}

export interface LivePanelProps {
  sport: "nfl" | "mlb";
  eventId: string;
  /** The frozen NFL player board for this event, read at build time from the committed artifact. */
  playerBoard?: any | null;
  /** The frozen MLB per-team run bands (never a combined total — MLB totals are PAUSED). */
  mlbForecast?: { runs: { home: any; away: any }; generatedAt: string | null } | null;
  /** When the pregame forecast was frozen, as a UTC ISO instant. Rendered in ET by this component. */
  forecastGeneratedAt?: string | null;
  /** The event's scheduled start (UTC ISO), used ONLY to scope the provider slate to its ET date. */
  startTime?: string | null;
  /** Render the "Live beta" heading strip. Off on the internal preview, which says so already. */
  showBetaHeading?: boolean;
}

export default function LivePanel({ sport, eventId, playerBoard, mlbForecast, forecastGeneratedAt, startTime, showBetaHeading }: LivePanelProps) {
  const players = sport === "nfl" && Boolean(playerBoard);
  const { envelope, unavailable, freshness, loading } = useLiveEvent(sport, eventId, {
    players,
    etDate: etDateOf(startTime),
  });

  if (!liveReadyFor(sport)) return null;

  const join = playerBoard ? joinNflPlayerBoard(playerBoard, envelope?.playerStats ?? []) : { rows: [] };
  // Rows a reader would learn nothing from are hidden until the game starts producing them.
  const visibleRows = envelope && envelope.state !== "PRE" ? join.rows.filter((r: any) => r.value !== null) : [];

  const grid = (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      <Region
        title="Live now"
        note={
          envelope?.provider === "mlb-statsapi"
            ? "Source: MLB StatsAPI"
            : envelope?.provider === "espn-public"
              ? "Source: ESPN public scoreboard"
              : undefined
        }
      >
        {loading && !envelope && !unavailable && (
          <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)", margin: 0 }}>Checking the live feed…</p>
        )}

        {unavailable && !envelope && <LiveUnavailable reason={unavailable.reason} />}

        {envelope && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <LiveBadge state={envelope.state} freshness={freshness} />
              {envelope.stateDetail && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{envelope.stateDetail}</span>
              )}
            </div>
            <LiveScoreStrip envelope={envelope} />
            <LivePeriodLine envelope={envelope} />
            <FreshnessLine state={envelope.state} freshness={freshness} />
            {/* A refusal arriving while a previous state is on screen is shown, not swallowed. */}
            {unavailable && (
              <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-warn)", margin: "6px 0 0" }}>
                The live feed did not answer the last request. The state above is the last we confirmed.
              </p>
            )}
          </>
        )}
      </Region>

      <Region
        title="Pregame GameTime · frozen"
        note={
          frozenStamp(forecastGeneratedAt)
            ? `Forecast frozen at ${frozenStamp(forecastGeneratedAt)}. It does not change during the game.`
            : "This forecast does not change during the game."
        }
      >
        {mlbForecast ? (
          <dl style={{ margin: 0 }}>
            {(["away", "home"] as const).map((side) => (
              <div key={side} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
                <dt style={{ fontSize: 12, color: "var(--vault-text-mute)", textTransform: "capitalize" }}>{side} runs</dt>
                <dd style={{ fontFamily: MONO, fontSize: 12, color: "var(--vault-text)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {mlbForecast.runs[side].median}{" "}
                  <span style={{ color: "var(--vault-text-faint)" }}>
                    ({mlbForecast.runs[side].rangeLow}–{mlbForecast.runs[side].rangeHigh})
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : playerBoard ? (
          visibleRows.length ? (
            <div>
              {visibleRows.map((r: any) => (
                <LiveRangeRow
                  key={`${r.playerId}:${r.market}`}
                  name={r.name}
                  label={r.label}
                  value={r.value}
                  rangeLow={r.rangeLow}
                  rangeHigh={r.rangeHigh}
                  position={r.position}
                  sentence={comparisonSentence(r)}
                />
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)", margin: 0 }}>
              {envelope?.state === "PRE"
                ? "Player comparisons appear once the game starts."
                : "No published player range has a live value yet."}
            </p>
          )
        ) : (
          <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)", margin: 0 }}>
            No GameTime pregame forecast for this game.
          </p>
        )}
      </Region>
    </div>
  );

  if (!showBetaHeading) return grid;

  return (
    <section aria-label="Live game state and frozen pregame forecast" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 15, color: "var(--vault-text)", margin: 0 }}>
          Live game state
        </h2>
        {/* Labelled a beta because it is one: a new provider path, publicly readable for the first time. */}
        <span
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--vault-text-faint)", border: "1px solid var(--vault-border)",
            borderRadius: 3, padding: "2px 6px",
          }}
        >
          Live beta
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "0 0 10px", maxWidth: 620, lineHeight: 1.55 }}>
        The left side is what the live source reports right now. The right side is the GameTime
        forecast made before first pitch — it is frozen and does not change while the game is played.
      </p>
      {grid}
    </section>
  );
}
