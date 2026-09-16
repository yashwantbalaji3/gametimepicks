/**
 * GAMETIME LIVE GATEWAY — the only place a live provider is called. HTTP transport only.
 *
 * WHY A FUNCTION AND NOT A REBUILD. Live state changes every few seconds; forecast artifacts are
 * built by a pipeline. Triggering a deployment to carry a score is the shortcut §8 prohibits, and a
 * static artifact that claims something about the present is precisely the Phase 6 defect. So the
 * present is served at request time and the past stays static.
 *
 * WHY THIS IS SAFE BESIDE `output: export`. Vercel deploys project-root `/api/*.mjs` as functions
 * independently of the Next build (the Next app lives under src/, so this directory is Vercel's, not
 * Next's). Two crons and the analytics collector already run this way — verified in production on
 * 2026-09-15: `/api/collect/` answers 204 while `/api/zzz-not-real/` 404s. NOTHING about the static
 * export changes to add this endpoint.
 *
 * COST SHAPE (§12). Readers never touch a provider; they touch this endpoint, which the CDN caches
 * for `s-maxage`. One upstream refresh per TTL serves every concurrent reader of that slate. MLB
 * serves a whole slate from ONE schedule call in both modes.
 *
 * FAIL CLOSED. Kill switch first; unknown sport, bad id or malformed upstream answers a typed
 * refusal envelope, never a fabricated event. No key is required or read, so nothing can leak.
 */
import {
  MAX_UPSTREAM_BYTES,
  UPSTREAM_TIMEOUT_MS,
  cacheHeaderFor,
  gatewayDisabled,
  planRequest,
  scoreboardTtl,
  upstreamUrls,
} from "./_live-core.mjs";
import { makeUnavailable } from "../src/lib/live/contract.mjs";
import { refreshPolicyFor } from "../src/lib/live/freshness.mjs";
import { normalizeMlbSchedule } from "../src/lib/live/adapters/mlb-statsapi.mjs";
import {
  normalizeNflPlayerStats,
  normalizeNflScoreboard,
  summaryEventId,
} from "../src/lib/live/adapters/espn-nfl.mjs";

/** A bounded read: timed out, size-capped, and never followed to another host's redirect chain. */
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR" };
    const text = await res.text();
    if (text.length > MAX_UPSTREAM_BYTES) return { ok: false, reason: "PROVIDER_MALFORMED" };
    return { ok: true, json: JSON.parse(text) };
  } catch {
    // A provider failure is never retried here. A retry loop across many readers is the request
    // storm §14 forbids; the CDN's stale-while-revalidate already covers a single slow response.
    return { ok: false, reason: "PROVIDER_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

function refuse(res, reason, extra = {}) {
  // A refusal is cached briefly too: an outage must not turn every reader into an upstream attempt.
  res.setHeader("Cache-Control", cacheHeaderFor(30));
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(makeUnavailable({ reason, fetchedAt: new Date().toISOString(), ...extra }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  if (gatewayDisabled()) return refuse(res, "FEATURE_DISABLED");

  const plan = planRequest(req.query ?? {});
  if (!plan.ok) return refuse(res, plan.reason);

  const urls = upstreamUrls(plan);
  const board = await getJson(urls.scoreboard);
  if (!board.ok) return refuse(res, board.reason, { sport: plan.sport, eventId: plan.eventId });

  const fetchedAt = new Date().toISOString();
  let envelopes;
  try {
    envelopes =
      plan.sport === "mlb"
        ? normalizeMlbSchedule(board.json, fetchedAt)
        : normalizeNflScoreboard(board.json, fetchedAt);
  } catch {
    return refuse(res, "PROVIDER_MALFORMED", { sport: plan.sport, eventId: plan.eventId });
  }

  if (plan.mode === "scoreboard") {
    res.setHeader("Cache-Control", cacheHeaderFor(scoreboardTtl(envelopes)));
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ schemaVersion: 1, sport: plan.sport, fetchedAt, events: envelopes });
  }

  const matches = envelopes.filter((e) => e.eventId === plan.eventId);
  // Two events answering to one id is the ambiguity §9 says must fail closed. It cannot happen with
  // either provider's id space today, which is exactly why it is checked rather than assumed.
  if (matches.length > 1) return refuse(res, "AMBIGUOUS_EVENT_MAPPING", { sport: plan.sport, eventId: plan.eventId });
  if (matches.length === 0) return refuse(res, "EVENT_NOT_FOUND", { sport: plan.sport, eventId: plan.eventId });

  const envelope = matches[0];

  // Player stats are fetched ONLY for a live or finished NFL game that a reader has open. A pregame
  // box score is empty, so asking for one would spend 567 KB upstream to learn nothing.
  if (urls.summary && envelope.state !== "PRE") {
    const summary = await getJson(urls.summary);
    if (summary.ok) {
      const declared = summaryEventId(summary.json);
      // A summary that names a different event is discarded. Attaching another game's box score to
      // this envelope is the wrong-join failure the whole identity contract exists to prevent.
      if (declared === null || declared === plan.eventId) {
        try {
          envelope.playerStats = normalizeNflPlayerStats(summary.json, {
            eventId: plan.eventId,
            fetchedAt,
          });
        } catch {
          envelope.playerStats = null; // partial coverage is stated as absent, never as zeroes
        }
      }
    }
  }

  const policy = refreshPolicyFor(envelope, Date.parse(fetchedAt));
  res.setHeader("Cache-Control", cacheHeaderFor(policy.ttlSeconds));
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ schemaVersion: 1, sport: plan.sport, fetchedAt, event: envelope, policy });
}
