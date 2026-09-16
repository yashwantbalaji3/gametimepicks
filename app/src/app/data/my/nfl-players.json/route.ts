/**
 * My GameTime's followed-player rows, emitted as a static file at build time (v1.1.3).
 *
 * Measured before the split: these rows were 108 KB of a 142 KB inline page payload, sent to every
 * reader although only a reader who follows an NFL player can use one. The page now fetches this
 * literal path only in that case — the same delivery pattern as data/build/explorer-slate.json, and
 * the literal path is what keeps the post-build /data sweep from pruning it.
 *
 * PUBLIC product data only: PUBLISHED families, read from each board in hand. No reader's preference
 * is in it or can be.
 */
import { buildMyPlayerRows } from "@/lib/my/read-model";

export const dynamic = "force-static";

export function GET() {
  return Response.json({ schemaVersion: 1, artifact: "my-nfl-players", rows: buildMyPlayerRows() });
}
