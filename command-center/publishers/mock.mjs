/**
 * MOCK PUBLISHER — the only publisher in Phase 1. It has no network code at all: publish() derives a fake post id
 * from the idempotency key and returns. capabilities().network is false, and tests/no-network.test.mjs runs the
 * whole flow with fetch, http(s), net and tls stubbed to throw.
 */
import { sha256 } from "../lib/util.mjs";

/** @param {{ clock: () => string }} opts */
export function createMockPublisher({ clock }) {
  return {
    name: "mock",
    capabilities: () => ({ supportsText: true, supportsImage: true, supportsVideo: false, supportsReplies: false, network: false }),
    quoteCost: () => ({ maxUsd: 0, assumptions: ["mock publisher: no external request, no charge"] }),
    async publish(_bundle, idempotencyKey) {
      return {
        providerPostId: `mock-${sha256(idempotencyKey).slice(0, 16)}`,
        canonicalUrl: null,
        publishedAt: clock(),
        state: "PUBLISHED_MOCK",
      };
    },
  };
}
