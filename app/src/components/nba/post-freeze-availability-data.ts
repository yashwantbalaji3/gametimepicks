/**
 * Server-only reader of the public post-freeze availability file (lib/sports/nba/post-freeze-availability.mjs) for one
 * ET slate date: app/public/data/nba/post-freeze-availability/<date>.json. Absent or malformed → no change is shown.
 */
import fs from "node:fs";
import path from "node:path";
import { postFreezeOutFor } from "@/lib/sports/nba/post-freeze-availability.mjs";

export type PostFreezeOut = Map<string, { providerAthleteId: string; name: string | null; side: string; status: string; statedAt: string }>;

export function loadPostFreezeOut(date: string | null, eventId: string): PostFreezeOut {
  if (!date) return new Map();
  try {
    const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nba", "post-freeze-availability", `${date}.json`), "utf8"));
    return postFreezeOutFor(file, eventId, date) as PostFreezeOut;
  } catch {
    return new Map();
  }
}
