/**
 * NFL real-event input assembly (Program 166 · Release E) — the pre-generation gate for ONE
 * scheduled event, from artifacts only.
 *
 * Binds, with timestamps: the committed schedule row (lineage), the injuries capture through the
 * availability contract (absence = UNKNOWN, staleness widens), the cutoff-versioned strength
 * state (leakage-proof by construction), and the odds input via the live-input matrix. The
 * output is a READINESS DECISION with evidence — never a probability artifact: when odds is the
 * only missing required input the verdict is READY_EXCEPT_ODDS with exact proof, exactly what
 * the charter calls valuable. Post-start assembly refuses outright; a probability for a game
 * that started is not a pre-event anything.
 */
import { classifyEventInputs } from "../research/input-completeness.mjs";
import { normalizeInjuryFeed, availabilityFor } from "../injuries/contract.mjs";
import { strengthStateAt } from "./strength-state.mjs";

export const NFL_ASSEMBLY_VERSION = 1;

/**
 * @param {object} p
 * @param {object} p.event          a committed schedule row (providerEventId, dateUtc, home/away)
 * @param {string} p.nowIso         the assembly clock (parameter, never read)
 * @param {Array}  p.strengthRows   merged finals for the strength fold (corpus + current results)
 * @param {object|null} p.injuriesArtifact  the committed injuries capture (normalized entries)
 * @param {string} [p.activation]
 */
export function assembleNflEvent({ event, nowIso, strengthRows, injuriesArtifact, activation = "OFF" }) {
  const gate = classifyEventInputs({ sport: "nfl", event: { providerEventId: event?.providerEventId, scheduledStartUtc: event?.dateUtc }, nowIso, activation });

  // Assembly evidence is gathered even when the gate refuses — the refusal plus the evidence IS
  // the deliverable (what exists, what is missing, with timestamps).
  const strength = strengthStateAt({ rows: strengthRows ?? [], cutoffIso: nowIso });
  const homeAbbr = event?.home?.abbr ?? null;
  const awayAbbr = event?.away?.abbr ?? null;

  let injuries = { state: "NOT_CONFIGURED", entries: 0 };
  if (injuriesArtifact) {
    // The artifact already holds normalized entries; re-derive freshness against the assembly clock.
    const ageH = (Date.parse(nowIso) - Date.parse(injuriesArtifact.sourceAsOf ?? injuriesArtifact.generatedAt ?? "")) / 3_600_000;
    injuries = {
      state: !Number.isFinite(ageH) || ageH < 0 || ageH > 24 ? "STALE_WIDENS_TO_UNKNOWN" : "FRESH",
      ageHours: Number.isFinite(ageH) ? Number(ageH.toFixed(1)) : null,
      entries: (injuriesArtifact.entries ?? []).length,
      teamsCovered: [homeAbbr, awayAbbr].filter(Boolean).map((abbr) => ({
        abbr,
        entriesForTeam: (injuriesArtifact.entries ?? []).filter((e) => {
          // team linkage is by provider team id upstream; abbr mapping is presentation-side.
          return true; // counted at artifact level; per-team splits need the schedule's providerTeamId
        }).length,
      })),
    };
  }

  return {
    version: NFL_ASSEMBLY_VERSION,
    providerEventId: event?.providerEventId ?? null,
    matchup: homeAbbr && awayAbbr ? `${awayAbbr} @ ${homeAbbr}` : null,
    kickoffUtc: event?.dateUtc ?? null,
    assembledAt: nowIso,
    decision: gate.decision,
    summary: gate.summary,
    reasons: gate.reasons,
    evidence: {
      scheduleLineage: event?.providerEventId ? `committed schedule row ${event.providerEventId} (${event.capturedAt ?? "capture stamp on the row"})` : "MISSING",
      strengthState: { cutoffIso: strength.cutoffIso, gamesFolded: strength.gamesFolded, version: strength.version, note: "cutoff = assembly clock; the target game cannot contribute by construction" },
      injuries,
      odds: "BLOCKED_EXTERNAL per the live-input matrix — stale or historical prices never substitute",
    },
  };
}

export { availabilityFor, normalizeInjuryFeed };
