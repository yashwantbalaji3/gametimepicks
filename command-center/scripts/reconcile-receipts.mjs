/**
 * Read-only: X receipts against publish results in a ledger folder. No X calls; opens no store, writes nothing.
 *   node command-center/scripts/reconcile-receipts.mjs <ledgerDir> [2026-10 2026-11]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") ? [path.join(d, e.name)] : []));
export const readEntries = (dir) => walk(dir).filter((f) => /(publish-receipt|publish-result)\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

/** Pure: compare receipts with PUBLISHED results by provider post id. */
export function reconcile(entries, months) {
  const id = (d) => String(d.providerPostId ?? d.canonicalUrl?.split("/").pop() ?? "");
  const month = (e) => String(e.data?.publishedAt ?? e.data?.at ?? e.at ?? e.data?.recordedAt ?? "").slice(0, 7);
  const inScope = entries.filter((e) => !months?.length || months.includes(month(e)));
  const receipts = inScope.filter((e) => e.kind === "publish-receipt"), results = inScope.filter((e) => e.kind === "publish-result" && e.data.state === "PUBLISHED");
  const R = new Set(receipts.map((e) => id(e.data))), S = new Set(results.map((e) => id(e.data)));
  const counts = (list) => list.reduce((m, e) => { const k = e.data.postId?.replace(/:v\d+$/, ""); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const byMonth = {};
  for (const e of receipts) { const m = month(e); byMonth[m] = byMonth[m] ?? { receipts: 0, costUsd: 0 }; byMonth[m].receipts += 1; byMonth[m].costUsd = Number((byMonth[m].costUsd + (e.data.costUsd ?? 0)).toFixed(4)); }
  return {
    byMonth, receipts: receipts.length, publishedResults: results.length,
    receiptWithoutResult: receipts.filter((e) => !S.has(id(e.data))).map((e) => ({ postId: e.data.postId, url: e.data.canonicalUrl, note: e.data.warnings ?? null })),
    resultWithoutReceipt: results.filter((e) => !R.has(id(e.data))).map((e) => ({ postId: e.data.postId, url: e.data.canonicalUrl })),
    sameSlotMoreThanOnce: Object.entries(counts(receipts)).filter(([, n]) => n > 1),
    duplicateUrls: receipts.length - R.size,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(JSON.stringify(reconcile(readEntries(process.argv[2]), process.argv.slice(3)), null, 1));
