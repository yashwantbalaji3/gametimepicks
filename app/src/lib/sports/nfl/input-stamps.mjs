/**
 * NFL · INPUTS MUST PRECEDE KICKOFF — the event-window contract's stamp rule, shared by every pre-kickoff producer.
 *
 * The contract (current-event-contract.mjs) refuses an artifact when any evidence stamp sits at/after kickoff. A
 * producer that checks only its own `--now` against kickoff misses the case that happened on 2026-10-25: the
 * 13:29:54Z window (now < the 13:30Z PIT @ NO kickoff) read an injuries capture whose provider stamp `sourceAsOf`
 * was 13:30:12Z. `--now` was pre-kickoff; the evidence was not. So the stamp that decides is the input's OWN
 * `sourceAsOf` — what the provider says the data is as of — and `generatedAt` (the window's logical clock, which a
 * capture copies from `--now`) only when a document carries no `sourceAsOf`.
 *
 * Pure. Used by build-nfl-participation, build-nfl-public-forecasts and build-nfl-player-board (refuse to revise,
 * rewrite or restamp an event), by the readers of record (forecastOfRecord), and by the read-only season sweep.
 */
export const INPUT_AFTER_KICKOFF = "INPUT_AFTER_KICKOFF";

/** The stamp an input is judged by: `sourceAsOf`, else `generatedAt`. */
export function inputStamp(doc) {
  if (!doc || typeof doc !== "object") return { field: null, stamp: null };
  if (doc.sourceAsOf != null) return { field: "sourceAsOf", stamp: String(doc.sourceAsOf) };
  if (doc.generatedAt != null) return { field: "generatedAt", stamp: String(doc.generatedAt) };
  return { field: null, stamp: null };
}

/** `{ name: stamp }` for the documents given (null for an absent document) — what an artifact records about its inputs. */
export function inputStampsOf(inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([k, d]) => [k, inputStamp(d).stamp]));
}

/**
 * Inputs that may NOT feed a pre-kickoff artifact for this kickoff: a present document whose stamp is at/after
 * kickoff, or whose stamp is missing / unparseable (an undated input cannot be shown to precede kickoff).
 * Absent documents are not judged here — each producer already refuses or degrades on a missing input.
 * @param {Record<string, object|null|undefined>} inputs
 * @param {string} kickoffUtc
 * @returns {Array<{ input: string, field: string|null, stamp: string|null, reason: string }>}
 */
export function postKickoffInputs(inputs, kickoffUtc) {
  const k = Date.parse(kickoffUtc ?? "");
  if (!Number.isFinite(k)) return [{ input: "kickoff", field: null, stamp: kickoffUtc ?? null, reason: `kickoff ${kickoffUtc} unparseable` }];
  const out = [];
  for (const [name, doc] of Object.entries(inputs)) {
    if (doc == null) continue;
    const { field, stamp } = inputStamp(doc);
    const t = Date.parse(stamp ?? "");
    if (!Number.isFinite(t)) out.push({ input: name, field, stamp, reason: `${name} carries no parseable sourceAsOf/generatedAt` });
    else if (t >= k) out.push({ input: name, field, stamp, reason: `${name} ${field} ${stamp} is at/after kickoff ${kickoffUtc}` });
  }
  return out;
}

/** Same rule over recorded stamps (`{ name: iso|null }`, e.g. an artifact's `inputStamps`): null = not recorded. */
export function postKickoffStamps(stamps, kickoffUtc) {
  const k = Date.parse(kickoffUtc ?? "");
  if (!stamps || !Number.isFinite(k)) return [];
  return Object.entries(stamps)
    .filter(([, s]) => s != null && !(Date.parse(s) < k))
    .map(([input, stamp]) => ({ input, field: "recorded", stamp, reason: `${input} ${stamp} is at/after kickoff ${kickoffUtc}` }));
}

/** One log line for a refused event (typed, greppable). */
export function refusalLine(producer, eventId, kickoffUtc, late) {
  return `REFUSED ${INPUT_AFTER_KICKOFF} ${producer} ${eventId} (kickoff ${kickoffUtc}): ${late.map((x) => x.reason).join("; ")} — no revision, rewrite or restamp`;
}
