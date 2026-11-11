/**
 * Server-only reader of the public post-freeze availability file (lib/sports/nba/post-freeze-availability.mjs) for one
 * ET slate date: app/public/data/nba/post-freeze-availability/<date>.json. Absent or malformed → no change is shown.
 */
import fs from "node:fs";
import path from "node:path";
import { postFreezeNote, postFreezeOutFor, POST_FREEZE_AVAILABILITY_SCHEMA } from "@/lib/sports/nba/post-freeze-availability.mjs";

export type PostFreezeOut = Map<string, { providerAthleteId: string; name: string | null; side: string; status: string; statedAt: string }>;

const readFile = (date: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nba", "post-freeze-availability", `${date}.json`), "utf8"));

export function loadPostFreezeOut(date: string | null, eventId: string): PostFreezeOut {
  if (!date) return new Map();
  try {
    return postFreezeOutFor(readFile(date), eventId, date) as PostFreezeOut;
  } catch {
    return new Map();
  }
}

/** The slate's notes for /nba/projections: "<eventId>:<athleteId>" → the note text (null when none). */
export function loadPostFreezeNotes(date: string | null | undefined): Record<string, string> | null {
  if (!date) return null;
  try {
    const file = readFile(date);
    if (file?.schema !== POST_FREEZE_AVAILABILITY_SCHEMA || file.date !== date) return null;
    const notes: Record<string, string> = {};
    for (const c of file.changes ?? []) if (c.status === "Out") notes[`${c.providerEventId}:${c.providerAthleteId}`] = postFreezeNote(c.statedAt);
    return Object.keys(notes).length ? notes : null;
  } catch {
    return null;
  }
}
