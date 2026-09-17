/**
 * EXPORT LINK INDEX (v1.4.1 · CI headroom) — one walk of the built export instead of one walk PER ROUTE.
 *
 * The orphan-route guards (nfl/route-reachability, epl/archive-reachability) asked, for every generated route,
 * "does any exported index.html other than the route's own page contain `<prefix><route>`?" — by re-walking and
 * re-reading the whole export each time. With 2,441 pages that was ~190,000 file reads and 130 s of the rendered phase.
 *
 * This reads every page ONCE and keeps, for each occurrence of `prefix`, the text that follows it (as long as the
 * longest route asked about). `html.includes(prefix + route)` is true exactly when some occurrence's following text
 * starts with `route`, so `linkedFrom` returns the same pages, in the same walk order, as the per-route scan did:
 * same file set (index.html, `_next` directories skipped), same substring semantics, same self-page exclusion.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} outDir   built export root
 * @param {string} prefix   e.g. "/nfl/game/"
 * @param {number} maxRouteLength  longest route that will be queried (the captured tail length)
 * @returns {(route: string, selfDir: string) => string[]} pages (relative to outDir) linking to `prefix + route`,
 *          excluding any page whose path contains `selfDir` (the route's own page)
 */
export function buildPrefixLinkIndex(outDir, prefix, maxRouteLength) {
  /** @type {Array<{ abs: string, rel: string, tails: Set<string> }>} */
  const pages = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "_next") walk(p); continue; }
      if (e.name !== "index.html") continue;
      let html;
      try { html = fs.readFileSync(p, "utf8"); } catch { continue; }
      const tails = new Set();
      for (let i = html.indexOf(prefix); i !== -1; i = html.indexOf(prefix, i + 1)) {
        tails.add(html.slice(i + prefix.length, i + prefix.length + maxRouteLength));
      }
      pages.push({ abs: p, rel: path.relative(outDir, p), tails });
    }
  };
  walk(outDir);
  return (route, selfDir) => {
    if (route.length > maxRouteLength) throw new Error(`export link index: route "${route}" is longer than the indexed tail (${maxRouteLength})`);
    const hits = [];
    for (const page of pages) {
      if (page.abs.includes(selfDir)) continue;
      for (const t of page.tails) if (t.startsWith(route)) { hits.push(page.rel); break; }
    }
    return hits;
  };
}
