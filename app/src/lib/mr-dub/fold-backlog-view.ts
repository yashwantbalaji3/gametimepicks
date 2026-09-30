/**
 * The fold backlog for a surface (Bank Builder V2 · G-2) — the ONE loader, so no page opens the record owner inline.
 * Reads the fold's own `foldedThrough` and the settled receipts after it, and asks protected-fold.mjs foldBacklog.
 * Read-only: nothing is credited and no money changes. Null when either input is missing (said as nothing, never 0).
 */
import fs from "node:fs";
import path from "node:path";

import { foldBacklog } from "./protected-fold.mjs";

export type FoldBacklog = ReturnType<typeof foldBacklog>;

export function loadFoldBacklog(dataRoot: string): FoldBacklog | null {
  try {
    const after = JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8"))?.protectedFold?.foldedThrough;
    if (!after) return null;
    const dir = path.join(dataRoot, "mr-dub", "settled");
    const receipts = fs.readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) > after)
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    return foldBacklog(receipts, { after });
  } catch {
    return null;
  }
}
