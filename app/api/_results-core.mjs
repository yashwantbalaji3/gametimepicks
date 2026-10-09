/**
 * /api/results — READ side of the runtime results store (PILOT CORE; the deployable `api/results.mjs` entry is NOT
 * created until the founder approves the pilot. An underscore file is never deployed as a function by Vercel).
 *
 * Hosting: a project-root Vercel Function beside the static export, exactly as /api/live (verified in Production).
 * GET only; sport/family/event validated against an allow-list; serves only results/v1 keys through the store's
 * current pointer; never lists the store; never returns a token. Cached at the CDN for 60 s with a short
 * stale-while-revalidate, and every body carries publishedAt/manifestUpdatedAt/servedAt so a cached answer is never
 * presented as fresher than it is.
 */
import { readCurrent } from "../src/lib/results-store/core.mjs";

export const RESULTS_FAMILIES = Object.freeze({ nfl: ["wm2-grades"] });
export const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=120";

export async function handleResults(req, store, { now = () => new Date().toISOString() } = {}) {
  if (req.method !== "GET") return { status: 405, headers: { Allow: "GET" }, body: null };
  const { sport, family, event } = req.query ?? {};
  if (!RESULTS_FAMILIES[sport]?.includes(family) || !/^[0-9]{5,12}$/.test(String(event ?? ""))) {
    return { status: 400, headers: { "Cache-Control": "public, max-age=0, s-maxage=300" }, body: { error: "unsupported sport, family or event" } };
  }
  let cur = null;
  try { cur = await readCurrent(store, { sport, family, eventId: String(event) }); }
  catch { return { status: 503, headers: { "Cache-Control": "no-store" }, body: { error: "results store unavailable — use the published snapshot" } }; }
  if (!cur) return { status: 404, headers: { "Cache-Control": "public, max-age=0, s-maxage=60" }, body: { error: "no published result for this event" } };
  return { status: 200, headers: { "Cache-Control": CACHE, "Content-Type": "application/json" },
    body: { ...cur.result, publication: { versionKey: cur.versionKey, finality: cur.finality, publishedAt: cur.publishedAt, manifestUpdatedAt: cur.manifestUpdatedAt, versions: cur.versions, servedAt: now() } } };
}
