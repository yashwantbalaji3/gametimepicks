/**
 * /preview/live — INTERNAL preview of GameTime Live (v1.1 Stage 1).
 *
 * `guardInternalRoute()` 404s it in the production export and `prune-internal-routes.mjs` deletes
 * `out/preview/` outright — but "internal" on a statically exported site has meant "world-readable
 * at its URL" before now, so every line here already meets the public-copy bar.
 *
 * WHAT THIS PAGE IS FOR. To show, against real events, that a live feed and a frozen forecast can sit
 * side by side without either corrupting the other: the forecast is read from the committed artifact
 * at build time and the live half is fetched at read time from the gateway. Turn the flag off and the
 * left column simply is not there; the forecast is untouched.
 */
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import LivePanel from "@/components/live/live-panel";
import { latestMlbSlateDate, mlbPreviewEvents, nflPreviewEvents, nflRecentlyPlayedEvents } from "@/lib/live/preview-data";

export const metadata = withRouteMetadata("/preview/live/", {
  title: "Internal Preview · GameTime Live",
  robots: { index: false, follow: false },
});

const MONO = "var(--font-mono)";

function etStamp(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(t)) + " ET";
}

export default function LivePreviewPage() {
  guardInternalRoute();

  const slateDate = latestMlbSlateDate();
  // Played games first: they are the only rows on which the player-range comparison has values.
  const events = [
    ...nflRecentlyPlayedEvents(2),
    ...nflPreviewEvents(2),
    ...(slateDate ? mlbPreviewEvents(slateDate, 3) : []),
  ];

  return (
    <main className="mx-auto px-4 py-10" style={{ maxWidth: 960 }}>
      <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
        Internal preview · not public
      </p>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--vault-text)", margin: "6px 0 10px" }}>
        GameTime Live
      </h1>
      <p style={{ fontSize: 13, color: "var(--vault-text-mute)", maxWidth: 640, lineHeight: 1.6, margin: "0 0 6px" }}>
        Each game below shows the live feed on one side and the pregame GameTime forecast on the other.
        The forecast was frozen before the game and is not recalculated while the game is played; the
        live side reports only what the source states, with the age of that statement.
      </p>
      <p style={{ fontSize: 13, color: "var(--vault-text-mute)", maxWidth: 640, lineHeight: 1.6, margin: "0 0 24px" }}>
        Comparisons say where a current value sits relative to the published pregame range. They are not
        probabilities and they do not update the forecast.
      </p>

      {events.length === 0 && (
        <p style={{ fontFamily: MONO, fontSize: 12, color: "var(--vault-text-faint)" }}>
          No committed forecast artifact is available to preview against.
        </p>
      )}

      {events.map((e) => (
        <section key={`${e.sport}-${e.eventId}`} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
            <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 17, color: "var(--vault-text)", margin: 0 }}>{e.matchup}</h2>
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {e.sport} · {e.eventId}
            </span>
            {etStamp(e.startTime) && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{etStamp(e.startTime)}</span>
            )}
          </div>
          <LivePanel
            sport={e.sport}
            eventId={e.eventId}
            playerBoard={e.playerBoard}
            mlbForecast={e.mlbForecast}
            forecastGeneratedAt={e.forecastGeneratedAt}
            startTime={e.startTime}
          />
        </section>
      ))}
    </main>
  );
}
