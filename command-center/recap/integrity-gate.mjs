/**
 * THE INTEGRITY GATE — deterministic, and the only thing that can let a game become content.
 *
 * It passes a candidate only when every claim the recap would make is (1) the published, unwithdrawn forecast of
 * record, (2) frozen before kickoff, (3) settled against a canonical final, (4) from a public-eligible source and
 * (5) in a family this template is cleared to show. Anything else is a refusal with a reason code — never a
 * softened post. An engagement score can never override it (spec §7); it runs before anything is ranked.
 *
 * Warnings do not block but travel with the verdict to the founder's decision card, so a known gap is seen rather
 * than assumed away: Phase 1 runs offline and does not consult served-revision deployment evidence (Option B,
 * app/src/lib/publication-evidence/served-revision.mjs); the NFL model is published as PUBLIC_EXPERIMENTAL — an
 * Official Forecast that is not eligible for prediction products (recap/public-registry.mjs).
 */
import { REASON } from "../contracts/index.mjs";
import { GAME_FAMILIES } from "./select-game.mjs";

/** Families recap template nfl-recap@0 may print. Player families are not cleared for this template at all. */
export const RECAP_FAMILIES = Object.freeze(new Set(GAME_FAMILIES));

const PRIVATE_PATH = /(^|\/)data\/internal\/research\//;
const before = (a, b) => Date.parse(a) < Date.parse(b);

/** @returns {{ pass: boolean, refusals: Array<{code:string, detail:string}>, warnings: Array<{code:string, detail:string}> }} */
export function runIntegrityGate(c) {
  const refusals = [];
  const warnings = [];
  const refuse = (code, detail) => refusals.push({ code, detail });

  const rows = [c.winner, c.total, ...(c.teamScores ?? [])].filter(Boolean);
  if (!c.winner || !c.total || (c.teamScores ?? []).length !== 2) {
    refuse(REASON.MISSING_CLAIM, "needs the winner, total and both team-score rows of one event");
  }

  // Source eligibility: never research lanes or PRIVATE_RESEARCH artifacts, whatever they contain.
  for (const p of [c.ledgerPath, c.receiptPath].filter(Boolean)) {
    if (PRIVATE_PATH.test(p)) refuse(REASON.PRIVATE_SOURCE, `${p} is a private research path`);
  }
  if (c.receipt?.dataClass === "PRIVATE_RESEARCH") refuse(REASON.PRIVATE_SOURCE, "receipt is PRIVATE_RESEARCH");

  // Publication state of every row the recap uses.
  for (const r of rows) {
    if (r.withdrawal || r.publicationStatus === "WITHDRAWN") refuse(REASON.WITHDRAWN, `${r.family} ${r.forecastId} was withdrawn`);
    else if (r.publicationStatus !== "PUBLISHED") refuse(REASON.NOT_PUBLISHED, `${r.family} is ${r.publicationStatus}`);
  }

  // The receipt must exist, be this event's, carry the same number the ledger graded, and be frozen pregame.
  const rc = c.receipt;
  if (!rc) {
    refuse(REASON.RECEIPT_MISSING, `no receipt at ${c.receiptPath ?? "(none named)"}`);
  } else {
    if (String(rc.providerEventId) !== String(c.eventId)) refuse(REASON.RECEIPT_MISMATCH, `receipt is for ${rc.providerEventId}`);
    const side = c.winner?.direction === "AWAY_WIN" ? "away" : "home";
    const receiptP = rc.forecastSummary?.winProbability?.[side];
    if (c.winner && receiptP !== c.winner.probability) {
      refuse(REASON.RECEIPT_MISMATCH, `receipt ${side} win ${receiptP} ≠ ledger ${c.winner.probability}`);
    }
    const kickoff = rc.kickoffUtc ?? c.eventStart;
    const frozenAt = rc.sideDecision?.frozenAt ?? rc.generatedAt;
    if (!before(rc.generatedAt, kickoff) || !before(frozenAt, kickoff)) {
      refuse(REASON.POST_START_REVISION, `receipt generated ${rc.generatedAt}, frozen ${frozenAt}, kickoff ${kickoff}`);
    }
  }
  for (const r of rows) {
    if (r.publishedAt && !before(r.publishedAt, c.eventStart)) refuse(REASON.POST_START_REVISION, `${r.family} published ${r.publishedAt} at/after start`);
  }

  // Results: settled, canonical, uncorrected.
  for (const r of rows) {
    const s = r.settlement;
    if (!s || s.state !== "SETTLED") refuse(REASON.NOT_SETTLED, `${r.family} settlement is ${s?.state ?? "missing"}`);
    else if (s.finality !== "CANONICAL") refuse(REASON.NOT_CANONICAL, `${r.family} finality is ${s.finality}`);
    else if ((s.corrections ?? 0) > 0) refuse(REASON.CORRECTED_RESULT, `${r.family} result has ${s.corrections} correction(s); needs human review`);
  }

  // Families: everything the bundle would print must be cleared for this template.
  for (const extra of c.extraClaims ?? []) {
    if (!RECAP_FAMILIES.has(extra.family)) refuse(REASON.FAMILY_NOT_CLEARED, `${extra.family} is not cleared for nfl-recap@0`);
  }

  warnings.push({ code: "SERVED_REVISION_NOT_CHECKED", detail: "Phase 1 is offline: deployment (Option B) evidence for this revision was not consulted" });
  if (c.winner?.modelStatusAtPublish === "PUBLIC_EXPERIMENTAL") {
    warnings.push({ code: "MODEL_EXPERIMENTAL", detail: "published as PUBLIC_EXPERIMENTAL: an Official Forecast that is not product-eligible — never call it a pick or a bet; the graphic carries the registry's Model Performance sentence" });
  }

  // De-duplicate identical refusals (one row can trip the same rule through two paths).
  const seen = new Set();
  const unique = refusals.filter((r) => (seen.has(r.code + r.detail) ? false : seen.add(r.code + r.detail)));
  return { pass: unique.length === 0, refusals: unique, warnings };
}
