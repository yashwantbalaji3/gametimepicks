/**
 * Saved-forecast settlement projection, emitted as a static file at build time (v1.1.4).
 *
 * My GameTime fetches this literal path ONLY when this device has at least one saved forecast, to tell whether
 * a forecast saved before the last visit has since been graded. It is a compaction of the four ledgers /saved
 * already reads (saved-settlements.mjs) — about 15 KB instead of the ~950 KB MLB + NFL + EPL + UFC ledgers — and
 * the Saved owner's own resolveResult decides every answer. The literal path is what keeps the post-build /data
 * sweep from pruning it.
 *
 * PUBLIC product data only: graded outcomes that /results and /saved already publish. No reader's saves are in it.
 */
import { buildMySavedSettlements } from "@/lib/my/read-model";

export const dynamic = "force-static";

export function GET() {
  return Response.json(buildMySavedSettlements());
}
