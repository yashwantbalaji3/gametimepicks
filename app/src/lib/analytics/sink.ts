/**
 * ANALYTICS SINK RESOLUTION — turns config into the single, approved outbound sink, defaulting to the NO-OP.
 *
 * Honesty + safety contract:
 *   • The app is a STATIC EXPORT, so the real sink is a first-party browser beacon (`navigator.sendBeacon`)
 *     to an APPROVED endpoint — no server, no vendor SDK, no cookie.
 *   • The sink stays OFF until BOTH a kill-switch flag enables it AND an endpoint is configured. With no
 *     provider approved/configured, `resolveSink` returns `NOOP_SINK` and NOTHING leaves the browser.
 *   • Every event is validated (`emitEvent` → `validateEvent`) before it can reach any sink; invalid events
 *     are DROPPED whole, never partially sent.
 *   • A sink failure is swallowed — analytics must NEVER break the site — and is never retried into an
 *     unbounded queue.
 *
 * Activation (documented in `docs/ANALYTICS_ACTIVATION_DECISION.md`): set `NEXT_PUBLIC_ANALYTICS_ENABLED=1`
 * AND `NEXT_PUBLIC_ANALYTICS_ENDPOINT=<approved first-party endpoint>` at build time. The kill switch is
 * `NEXT_PUBLIC_ANALYTICS_ENABLED` (unset/0 → hard off, no code change).
 */
import { NOOP_SINK, emitEvent, type AnalyticsEvent, type AnalyticsEventSink } from "./event-contract";

export interface SinkConfig {
  /** Outbound analytics is active ONLY when this is true AND `endpoint` is set. */
  enabled: boolean;
  /** The approved first-party endpoint, or null when none is configured. */
  endpoint: string | null;
}

/**
 * Read the sink config from build-time public env. Provider is OFF unless BOTH the kill-switch is on AND a
 * non-empty endpoint is present — so an accidental half-configuration can never send.
 */
export function readSinkConfig(env?: Record<string, string | undefined>): SinkConfig {
  const e = env ?? (typeof process !== "undefined" && process.env ? process.env : {});
  const flag = e.NEXT_PUBLIC_ANALYTICS_ENABLED;
  const on = flag === "1" || flag === "true";
  const endpoint = typeof e.NEXT_PUBLIC_ANALYTICS_ENDPOINT === "string" && e.NEXT_PUBLIC_ANALYTICS_ENDPOINT.trim() ? e.NEXT_PUBLIC_ANALYTICS_ENDPOINT.trim() : null;
  return { enabled: on && endpoint != null, endpoint };
}

/**
 * A first-party beacon sink: best-effort, non-blocking, no queue, never throws. `send` is injectable so tests
 * can capture payloads without any network.
 */
export function createBeaconSink(endpoint: string, opts?: { send?: (url: string, body: string) => boolean }): AnalyticsEventSink {
  const send =
    opts?.send ??
    ((url: string, body: string): boolean => {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") return navigator.sendBeacon(url, body);
      } catch {
        /* swallow — analytics must never break the site */
      }
      return false;
    });
  return (event: AnalyticsEvent) => {
    try {
      send(endpoint, JSON.stringify(event));
    } catch {
      /* swallow */
    }
  };
}

/** Resolve the active sink from config. Returns `NOOP_SINK` unless enabled AND an endpoint exists. */
export function resolveSink(config: SinkConfig): AnalyticsEventSink {
  if (!config.enabled || !config.endpoint) return NOOP_SINK;
  return createBeaconSink(config.endpoint);
}

/**
 * THE guarded track call the client bootstrap uses. Validates (drops invalid), then forwards to the resolved
 * sink via `emitEvent`. Never throws. Returns whether a valid event was forwarded.
 */
export function track(event: AnalyticsEvent, sink: AnalyticsEventSink): boolean {
  try {
    return emitEvent(event, sink);
  } catch {
    return false;
  }
}
