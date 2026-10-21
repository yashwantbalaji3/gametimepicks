/**
 * NBA PROP PRICES · PLAYER IDENTITY — provider name string → ESPN providerAthleteId. Pure.
 *
 * The Odds API names a player only by a display string in `outcome.description` ("Jaren Jackson Jr"). A name is
 * evidence, never identity. Resolution is allowed through exactly two doors, and both are scoped to the two teams of
 * the event the price was joined to:
 *
 *   1. REVIEWED ALIAS (wins). `REVIEWED_PLAYER_ALIASES` maps a provider spelling to one athlete id, with who reviewed
 *      it and when. An alias whose athlete is not on either roster of this event REFUSES (a traded player's stale
 *      alias must not attach a price to the wrong game).
 *   2. EXACT NORMALISED NAME against the event's two rosters (normalizePlayerName from lib/nba/identity-contract —
 *      diacritics, periods, apostrophes and hyphens folded; nothing else). Exactly one roster row → RESOLVED.
 *
 * Zero rows → PLAYER_UNRESOLVED. Two or more rows (two players with one normalised name, or one name on both
 * rosters) → PLAYER_AMBIGUOUS. Neither is ever resolved by "closest", initials, or a surname-only match.
 *
 * The alias table ships EMPTY: entries are added only after a human reviews a real capture's unresolved list (the
 * coverage report names every unresolved string). No entry was invented for this PR.
 */
import { normalizePlayerName } from "../../../nba/identity-contract.ts";
import { REFUSAL } from "./contract.mjs";

/**
 * @type {ReadonlyArray<{ providerName: string, providerAthleteId: string, reviewedBy: string, reviewedAt: string, note: string }>}
 */
export const REVIEWED_PLAYER_ALIASES = Object.freeze([]);

export const IDENTITY_METHOD = Object.freeze({ ALIAS: "REVIEWED_ALIAS", EXACT_NAME: "ROSTER_EXACT_NAME" });

/**
 * @param {string} providerName  outcome.description
 * @param {Array<{ providerAthleteId: string, displayName: string, team?: string }>} eventRoster  BOTH teams' players
 * @param {{ aliases?: typeof REVIEWED_PLAYER_ALIASES }} [opts]
 * @returns {{ state: "RESOLVED", providerAthleteId: string, method: string, team: string|null }
 *         | { state: "REFUSED", reason: string, detail: string, candidates?: string[] }}
 */
export function resolvePlayer(providerName, eventRoster, { aliases = REVIEWED_PLAYER_ALIASES } = {}) {
  const key = normalizePlayerName(providerName);
  if (!key) return { state: "REFUSED", reason: REFUSAL.PLAYER_UNRESOLVED, detail: "empty provider player name" };
  const roster = (eventRoster ?? []).filter((p) => p && p.providerAthleteId != null && /^\d+$/.test(String(p.providerAthleteId)));

  const aliasHits = (aliases ?? []).filter((a) => normalizePlayerName(a.providerName) === key);
  const aliasIds = [...new Set(aliasHits.map((a) => String(a.providerAthleteId)))];
  if (aliasIds.length > 1) {
    return { state: "REFUSED", reason: REFUSAL.PLAYER_AMBIGUOUS, detail: `alias table maps "${providerName}" to ${aliasIds.length} athletes`, candidates: aliasIds };
  }
  if (aliasIds.length === 1) {
    const onRoster = roster.filter((p) => String(p.providerAthleteId) === aliasIds[0]);
    if (onRoster.length !== 1) {
      return { state: "REFUSED", reason: REFUSAL.PLAYER_UNRESOLVED, detail: `reviewed alias for "${providerName}" points to ${aliasIds[0]}, who is not on either roster of this event` };
    }
    return { state: "RESOLVED", providerAthleteId: aliasIds[0], method: IDENTITY_METHOD.ALIAS, team: onRoster[0].team ?? null };
  }

  const hits = roster.filter((p) => normalizePlayerName(p.displayName) === key);
  const ids = [...new Set(hits.map((p) => String(p.providerAthleteId)))];
  if (ids.length === 0) return { state: "REFUSED", reason: REFUSAL.PLAYER_UNRESOLVED, detail: `no roster player of this event is named "${providerName}"` };
  if (ids.length > 1) return { state: "REFUSED", reason: REFUSAL.PLAYER_AMBIGUOUS, detail: `${ids.length} roster players of this event normalise to "${key}"`, candidates: ids.sort() };
  return { state: "RESOLVED", providerAthleteId: ids[0], method: IDENTITY_METHOD.EXACT_NAME, team: hits[0].team ?? null };
}
