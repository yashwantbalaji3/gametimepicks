/**
 * CHALLENGE LANES · PRICES FOR DISPLAY, ENCRYPTED AT REST. SERVER / BUILD TIME ONLY (node:crypto).
 *
 * Founder 2026-11-04: odds and calculated payouts may be shown in graphics and on site pages. Provider terms still bar
 * a downloadable file, so the plain public projection keeps every price withheld, and the site reads prices only from
 * `data/odds-display/challenge-lanes/<laneId>.json.enc` (`gtp.odds-display.enc@1`, lib/odds/display-crypto.mjs, key
 * GTP_ODDS_DISPLAY_KEY, aad `challenge-lanes/<laneId>`). The build decrypts it in memory; the plaintext never touches
 * disk in the repo or out/. Both the writer and the reader require the committed display record to authorize NBA
 * "site" (lib/odds/display-authorization.mjs: on since 2026-10-29). Graphics read the private lane log (store.mjs);
 * prices on a social graphic need that record's NBA "social" surface, which is still off (a founder change).
 *
 * The plaintext is a pure function of the private run logs (deterministic, no clock), so the envelope is byte-stable.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptDisplayArtifact, decryptDisplayArtifact, readDisplayKey } from "../odds/display-crypto.mjs";
import { displayAuthorization } from "../odds/display-authorization.mjs";
import { laneState, LANES, MILESTONES } from "./lanes.mjs";
import { laneProjection } from "./projection.mjs";

export const PRICE_DISPLAY_SCHEMA = "gtp.challenge-lane.prices@1";
export const priceDisplayAad = (laneId) => `challenge-lanes/${laneId}`;
export const PRICE_DISPLAY_REPO_DIR = "data/odds-display/challenge-lanes";

/** Every priced day of every run: the book, each leg's price, the parlay, stake, gross, profit and the bankroll after. */
export function lanePriceDisplay(laneId, runs) {
  return {
    schema: PRICE_DISPLAY_SCHEMA, laneId,
    /* Bound to the public projection made from the same logs: a stale or foreign price file is refused by the fold. */
    projectionSha256: laneProjection(laneId, runs).contentSha256,
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
      const won = days.filter((d) => d.stepOutcome === "WIN").length;
      const remaining = Math.max(s.steps - s.step + 1, 0);
      const milestoneCents = won > 0 ? MILESTONES[s.product][Math.min(won, s.steps) - 1] : s.baseCents;
      const pace = { milestoneCents, requiredMultiplier: remaining ? Math.round((s.targetCents / s.bankrollCents) ** (1 / remaining) * 1e4) / 1e4 : null, behindByCents: Math.max(0, milestoneCents - s.bankrollCents), onPace: s.bankrollCents >= milestoneCents };
      return { runId: s.runId, trackedBankrollCents: s.bankrollCents, step: s.step, status: s.status, pace, days };
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

/**
 * The site's reader, beside readLaneProjection: the decrypted prices doc, or null with no key, another key or no file.
 * Throws (DisplayArtifactTamperedError) on a tampered envelope. Build time only.
 */
export function readLanePrices({ appDir = process.cwd(), laneId, env = process.env, dir = path.join(appDir, "..", PRICE_DISPLAY_REPO_DIR), record }) {
  if (!LANES[laneId]) return null;
  if (!displayAuthorization("nba", "site", ...(record ? [record] : [])).ok) return null;
  const k = readDisplayKey(env);
  if (!k.ok) return null;
  const file = path.join(dir, `${laneId}.json.enc`);
  if (!fs.existsSync(file)) return null;
  return readLanePriceDisplay(laneId, fs.readFileSync(file, "utf8"), k.key);
}

/** Prices may appear on a social graphic only when the display record authorizes NBA "social" (off today). */
export const socialPricesAuthorized = (record) => displayAuthorization("nba", "social", ...(record ? [record] : []));
