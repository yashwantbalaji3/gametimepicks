/**
 * LIVE CLIENT CONFIG — how a browser reaches the gateway, and whether it may at all.
 *
 * ⚠ `process.env.NEXT_PUBLIC_*` must be read as a LITERAL member expression for Next to inline it
 * into the client bundle. A computed read (`process.env[name]`) compiles to `undefined` in the
 * browser and the feature silently never turns on. Both reads below are literal on purpose.
 */

/** Is the live UI allowed to render and poll at all? Off unless the build explicitly enabled it. */
export function liveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_ENABLED === "1";
}

/**
 * The gateway origin. Same-origin by default — the function is deployed beside the static export, so
 * no cross-origin request and no CORS surface exists in the normal case.
 */
export function liveEndpoint(): string {
  return process.env.NEXT_PUBLIC_LIVE_ENDPOINT || "/api/live";
}

/**
 * The event's date in America/New_York — the ONLY date shape either provider is asked for.
 *
 * ⚠ Not the UTC date. A Thursday-night kickoff at 2026-09-18T00:15Z belongs to ET date 2026-09-17,
 * and ESPN returns zero events for 20260918. Deriving this from `toISOString().slice(0,10)` would
 * silently lose every late-evening game.
 */
export function etDateOf(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  // en-CA renders ISO-shaped YYYY-MM-DD, so no manual part assembly can transpose month and day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t));
}

/** Build a gateway URL. Only these parameters exist; nothing from a page can add another. */
export function liveUrl(params: { sport: "nfl" | "mlb"; event?: string; players?: boolean; date?: string }): string {
  const q = new URLSearchParams({ sport: params.sport });
  if (params.event) q.set("event", params.event);
  if (params.players) q.set("players", "1");
  if (params.date) q.set("date", params.date);
  return `${liveEndpoint()}?${q.toString()}`;
}
