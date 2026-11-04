/**
 * CHALLENGE LANES · PRICES FOR DISPLAY, ENCRYPTED AT REST. SERVER / BUILD TIME ONLY (node:crypto).
 *
 * Founder 2026-11-04: odds and calculated payouts may be shown in graphics and on site pages. Provider terms still bar
 * a downloadable file, so the plain public projection keeps every price withheld, and the site reads prices only from
 * `data/odds-display/challenge-lanes/<laneId>.json.enc` (`gtp.odds-display.enc@1`, lib/odds/display-crypto.mjs, key
 * GTP_ODDS_DISPLAY_KEY, aad `challenge-lanes/<laneId>`). The build decrypts it in memory; the plaintext never touches
 * disk in the repo or out/. Graphics read the private lane log directly (store.mjs) and need none of this.
 *
 * The plaintext is a pure function of the private run logs (deterministic, no clock), so the envelope is byte-stable.
 */
import { encryptDisplayArtifact, decryptDisplayArtifact } from "../odds/display-crypto.mjs";
import { laneState } from "./lanes.mjs";

export const PRICE_DISPLAY_SCHEMA = "gtp.challenge-lane.prices@1";
export const priceDisplayAad = (laneId) => `challenge-lanes/${laneId}`;
export const PRICE_DISPLAY_REPO_DIR = "data/odds-display/challenge-lanes";

/** Every priced day of every run: the book, each leg's price, the parlay, stake, gross, profit and the bankroll after. */
export function lanePriceDisplay(laneId, runs) {
  return {
    schema: PRICE_DISPLAY_SCHEMA, laneId,
    runs: runs.map((events) => {
      const s = laneState(events);
      const days = [];
      for (const pay of events.filter((e) => e.type === "PAYOUT_COMPUTED")) {
        const price = events.find((e) => e.sha256 === pay.inputs.priceEventSha256)?.price ?? null;
        const settled = events.find((e) => e.type === "STEP_SETTLED" && e.payoutEventSha256 === pay.sha256) ?? null;
        days.push({
          date: pay.date, step: pay.step, result: pay.result, refusals: pay.refusals?.map((r) => r.code) ?? null,
          book: pay.inputs.book, method: pay.inputs.method, estimate: pay.inputs.estimate === true, label: pay.inputs.label ?? null,
          legs: (price?.legs ?? []).map((l) => ({ legId: l.legId, selectionCode: l.selectionCode, oddsFormat: l.oddsFormat, price: l.price, line: l.line ?? null, fetchedAt: l.fetchedAt })),
          decimalPrice: pay.inputs.decimalPrice, pace: pay.inputs.pace, belowPace: pay.inputs.belowPace ?? null,
          stakeCents: pay.inputs.stakeCents, grossPayoutCents: pay.grossPayoutCents ?? null, profitCents: pay.profitCents ?? null,
          stepOutcome: settled?.outcome ?? null, bankrollAfterCents: settled?.bankrollAfterCents ?? null,
        });
      }
      return { runId: s.runId, trackedBankrollCents: s.bankrollCents, step: s.step, status: s.status, days };
    }),
  };
}

/** The committed envelope for one lane (one JSON line + "\n"). `key` is from readDisplayKey(), never an argument string. */
export const encryptLanePriceDisplay = (laneId, runs, key) => encryptDisplayArtifact(JSON.stringify(lanePriceDisplay(laneId, runs)), key, priceDisplayAad(laneId));

/** The site's reader: the plaintext doc, or null when the envelope was made under another key. Throws on tampering. */
export function readLanePriceDisplay(laneId, envelopeText, key) {
  const pt = decryptDisplayArtifact(envelopeText, key, priceDisplayAad(laneId));
  return pt == null ? null : JSON.parse(pt);
}
