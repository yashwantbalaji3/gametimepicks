/**
 * Level A · the model this build shows, as a static file (Level A record, release owner 2026-10-23).
 *
 * The record must hold what readers actually saw, and a static export decides that at BUILD time. This file is the
 * same evaluation the Level A pages render (levelAPageModel: the build's one stamped instant), with its sha256. The
 * Level A section links it by this literal path, which also keeps the post-build /data sweep from pruning it; when
 * Level A is off the section is absent, nothing links the file, and the sweep removes it.
 * scripts/products/record-level-a-from-deployment.mjs reads it from Production after each Production deployment.
 */
import { levelAServedDoc } from "@/lib/products/level-a/model.mjs";

export const dynamic = "force-static";

export function GET() {
  return Response.json(levelAServedDoc());
}
