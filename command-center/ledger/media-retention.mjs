/**
 * MEDIA RETENTION (hosted) — which graphic BYTES may be removed from the private Blob store, and why. Pure: it plans;
 * deploy/media-retention.mjs applies (dry run by default). Evidence is never removed: every key keeps its reference
 * row and hash (stored_object_refs), and the ledger keeps every package, decision and receipt.
 *
 *   KEEP forever   media of any post that was APPROVED (published, scheduled, invalidated or not) — the exact images
 *                  an approval bound and X received
 *   KEEP while open media of undecided drafts that are still current (not superseded)
 *   REMOVE after   media referenced only by superseded drafts, rejected / deferred / revise drafts, or by nothing at
 *   `keepDays`     all, once the object is older than keepDays (default 14)
 * Graphics are ~1 MB each and a busy NBA night renders ~40, so this keeps storage flat at roughly the last two weeks of
 * drafts plus everything ever approved.
 */
export const DEFAULT_KEEP_DAYS = 14;

/** Media keys ("media/<file>") a post's package points at. */
const keysOf = (pkg) => [...(pkg?.mediaSet ?? []), ...(pkg?.media ? [pkg.media] : [])].map((m) => `media/${String(m.file).split("/").pop()}`);

/**
 * @param {{ posts: object[], refs: {key: string, createdAt: string, size: number, deleted: boolean}[], now: string, keepDays?: number }} p
 * @returns {{ keep: {key: string, why: string}[], remove: {key: string, why: string, size: number}[], bytes: number }}
 */
export function planRetention({ posts, refs, now, keepDays = DEFAULT_KEEP_DAYS }) {
  const forever = new Map();
  const open = new Map();
  const closed = new Map();
  for (const p of posts) {
    const keys = keysOf(p.package);
    const approved = p.resolution?.verdict === "approve" || Boolean(p.receipt);
    for (const k of keys) {
      if (approved) forever.set(k, p.receipt ? `published ${p.receipt.canonicalUrl}` : `approved in ${p.decisionId}`);
      else if (!p.resolution && p.lifecycle !== "superseded") open.set(k, `open draft ${p.decisionId}`);
      else closed.set(k, `${p.lifecycle} ${p.decisionId}`);
    }
  }
  const cutoff = Date.parse(now) - keepDays * 86_400_000;
  const keep = [];
  const remove = [];
  for (const r of refs.filter((x) => !x.deleted && x.key.startsWith("media/"))) {
    if (forever.has(r.key)) { keep.push({ key: r.key, why: forever.get(r.key) }); continue; }
    if (open.has(r.key)) { keep.push({ key: r.key, why: open.get(r.key) }); continue; }
    if (!(Date.parse(r.createdAt) < cutoff)) { keep.push({ key: r.key, why: `younger than ${keepDays} days` }); continue; }
    remove.push({ key: r.key, size: r.size, why: closed.has(r.key) ? `only used by ${closed.get(r.key)}` : "not used by any post" });
  }
  return { keep, remove, bytes: remove.reduce((a, x) => a + (x.size ?? 0), 0) };
}
