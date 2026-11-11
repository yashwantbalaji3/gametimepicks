/**
 * NBA · POST-FREEZE AVAILABILITY (founder directive 2026-11-11, Mathurin BKN @ NO 401909972). PURE: no fs, no clock.
 *
 * A game's Official Forecast freezes once (the lane file, app/public/data/nba/experimental-public/<date>.json) and is
 * never edited. When a later injury report rules a PROJECTED player out, the game page keeps that player's projection
 * as recorded but demotes it and says why. This module derives the public facts that note needs, and nothing more:
 *   a change   a player with a published projection in the frozen lane game (players.away / players.home) whose
 *              injury status is "Out" in the capture, stated AFTER that game's frozenAt
 *   kept       providerEventId, providerAthleteId, the lane's name, side, "Out", statedAt — normalized status facts only
 *              (the capture's own license note: no editorial prose); no projection number, no price
 * Out → Day-To-Day changes are NOT changes here: a player already listed unavailable stays unavailable (conservative).
 * The output carries no wall-clock field (deterministic: same lane + same capture ⇒ byte-identical file).
 *
 * Writer: app/scripts/nba/build-nba-post-freeze-availability.mjs, from the internal injuries capture (which is not a
 * build input); the build reads only the public file this returns.
 */
export const POST_FREEZE_AVAILABILITY_SCHEMA = "gtp.nba.post-freeze-availability@1";
export const POST_FREEZE_OUT_STATUS = "Out";
export const POST_FREEZE_REL = (date) => `app/public/data/nba/post-freeze-availability/${date}.json`;

/* the capture writes minute precision ("2026-11-11T16:29Z"); Date.parse reads both forms */
const t = (iso) => (typeof iso === "string" ? Date.parse(iso) : NaN);

/**
 * @param lane     the frozen lane file (experimental-public/<date>.json)
 * @param capture  the injuries facts capture (data/internal/research/injuries/nba/latest.json)
 */
export function postFreezeAvailability(lane, capture) {
  const out = new Map();
  for (const e of capture?.entries ?? []) {
    if (e?.sport !== "nba" || String(e.status ?? "").trim().toLowerCase() !== "out") continue;
    out.set(String(e.athleteId), e);
  }
  const changes = [];
  for (const g of lane?.games ?? []) {
    const frozen = t(g.frozenAt);
    if (!Number.isFinite(frozen)) continue;
    for (const side of ["away", "home"]) {
      for (const p of g.players?.[side] ?? []) {
        const e = out.get(String(p.providerAthleteId));
        if (!e || !(t(e.statedAt) > frozen)) continue;
        changes.push({ providerEventId: String(g.providerEventId), providerAthleteId: String(p.providerAthleteId), name: p.name ?? e.athleteName ?? null, side, status: POST_FREEZE_OUT_STATUS, statedAt: e.statedAt });
      }
    }
  }
  changes.sort((a, b) => a.providerEventId.localeCompare(b.providerEventId) || a.side.localeCompare(b.side) || a.providerAthleteId.localeCompare(b.providerAthleteId));
  return {
    schema: POST_FREEZE_AVAILABILITY_SCHEMA,
    date: lane?.date ?? null,
    lane: { generatedAt: lane?.generatedAt ?? null },
    report: { sourceAsOf: capture?.sourceAsOf ?? null, source: capture?.source?.name ?? null },
    changes,
  };
}

/** This game's post-freeze "Out" changes by athlete id (empty when the file is absent, malformed or for another date). */
export function postFreezeOutFor(file, eventId, date = null) {
  if (!file || file.schema !== POST_FREEZE_AVAILABILITY_SCHEMA || (date && file.date !== date)) return new Map();
  return new Map((file.changes ?? []).filter((c) => c.providerEventId === String(eventId) && c.status === POST_FREEZE_OUT_STATUS).map((c) => [c.providerAthleteId, c]));
}

/** "Ruled out after this forecast froze (injury report 11:29 AM ET)". */
export function postFreezeNote(statedAt) {
  const ms = t(statedAt);
  const hhmm = Number.isFinite(ms) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + " ET" : null;
  return `Ruled out after this forecast froze${hhmm ? ` (injury report ${hhmm})` : ""}`;
}
