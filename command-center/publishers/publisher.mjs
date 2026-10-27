/**
 * THE SEND BOUNDARY — every check that matters happens here, immediately before a provider is called.
 *
 * Order: pause → approval exists → approval binds THIS bundle's exact digest → budget covers the quoted cost →
 * idempotency claim. Only then is provider.publish() called, and its receipt is stored under the claim, so a
 * second attempt (double click, retry, concurrent worker) returns the first receipt instead of posting twice.
 *
 * No provider is selected for real use. Candidates are named in PUBLISHER_CANDIDATES so the contract is stable;
 * which one ships is checkpoint CP2, after the friend-interview evidence (docs/x-publishing-evaluation.md).
 *
 * @typedef {object} PublisherProvider
 * @property {string} name
 * @property {() => {supportsText:boolean, supportsImage:boolean, supportsVideo:boolean, supportsReplies:boolean, network:boolean}} capabilities
 * @property {(bundle:object) => {maxUsd:number, assumptions:string[]}} quoteCost
 * @property {(bundle:object, idempotencyKey:string) => Promise<{providerPostId:string, canonicalUrl:string|null, publishedAt:string, state:string}>} publish
 */
import { REASON, publishIdempotencyKey, validatePublishBundle } from "../contracts/index.mjs";
import { digestOf } from "../lib/util.mjs";

export const PUBLISHER_CANDIDATES = Object.freeze([
  { id: "mock", status: "ACTIVE (Phase 1 only)" },
  { id: "x-api", status: "CANDIDATE — official X API, pay-per-use; not selected" },
  { id: "scheduler", status: "CANDIDATE — third-party scheduler/connector; not selected" },
  { id: "grok-connector", status: "CANDIDATE — only if xAI documents write access; read-only today" },
  { id: "manual-handoff", status: "CANDIDATE — founder posts by hand from an approved draft; $0" },
]);

/**
 * @param {{ provider: PublisherProvider, store: object, bundle: object, approval: object|null,
 *           paused: boolean, budgetRemainingUsd: number }} p
 * @returns {Promise<{ ok: true, receipt: object, duplicate: boolean } | { ok: false, code: string, detail: string }>}
 */
export async function publishAtBoundary({ provider, store, bundle, approval, paused, budgetRemainingUsd }) {
  const v = validatePublishBundle(bundle);
  if (!v.ok) return { ok: false, code: "INVALID_BUNDLE", detail: v.errors.join(", ") };
  if (paused) return { ok: false, code: REASON.PAUSED, detail: "publishing is paused" };
  if (!approval) return { ok: false, code: REASON.APPROVAL_MISSING, detail: "no founder approval for this bundle" };
  const digest = digestOf(bundle);
  if (approval.approvedExactDigest !== digest) {
    return { ok: false, code: REASON.APPROVAL_DIGEST_MISMATCH, detail: `approved ${approval.approvedExactDigest.slice(0, 12)}…, bundle is ${digest.slice(0, 12)}…` };
  }
  const quote = provider.quoteCost(bundle);
  if (quote.maxUsd > budgetRemainingUsd) {
    return { ok: false, code: REASON.BUDGET_EXCEEDED, detail: `quote $${quote.maxUsd} > remaining $${budgetRemainingUsd}` };
  }

  const key = publishIdempotencyKey(bundle);
  const existing = store.readClaim(key);
  if (existing?.value?.receipt) return { ok: true, receipt: existing.value.receipt, duplicate: true };

  const result = await provider.publish(bundle, key);
  const receipt = {
    schema: "gtp.cc.publish-receipt@1",
    provider: provider.name,
    channel: bundle.channel,
    accountId: bundle.accountId,
    bundleDigest: digest,
    idempotencyKey: key,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    costUsd: quote.maxUsd,
    costAssumptions: quote.assumptions,
    ...result,
  };
  const claim = store.claim(key, { receipt });
  if (!claim.won) return { ok: true, receipt: claim.record.value.receipt, duplicate: true };
  return { ok: true, receipt, duplicate: false };
}
