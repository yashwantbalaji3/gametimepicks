/**
 * NCAAF · read one season of cached ESPN scoreboard responses (written by probe-espn-coverage.mjs) and return
 * merged normalised events. No network: an incomplete cache throws, so a partial season can never read as a
 * complete one. Shared by the NCAAF scripts that derive artifacts from the same snapshot.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent } from "../../src/lib/sports/ncaaf/espn-events.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ROOT = path.resolve(APP, "..");
export const CACHE = path.join(ROOT, "data", "internal", "research", "ncaaf", ".cache", "raw", "espn", "coverage");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** → { events, conflicts, refused, inputSnapshotSha256 } for `season`. Throws on a missing cache file. */
export function loadSeasonEvents(season) {
  const read = (rel) => {
    const f = path.join(CACHE, rel);
    if (!fs.existsSync(f)) throw new Error(`${season}: cache incomplete (${rel}) — run probe-espn-coverage.mjs first`);
    const text = fs.readFileSync(f, "utf8");
    return { text, json: JSON.parse(text) };
  };
  const first = read(`${season}/2-1-80.json`);
  const cal = first.json.body?.leagues?.[0]?.calendar ?? [];
  const weeks = [[2, cal.find((c) => String(c.value) === "2")?.entries ?? []], [3, cal.find((c) => String(c.value) === "3")?.entries ?? []]]
    .flatMap(([st, entries]) => entries.map((e) => [st, Number(e.value)]));
  const rows = [], hashes = [];
  let refused = 0;
  for (const [st, wk] of weeks) {
    for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
      const rel = `${season}/${st}-${wk}-${grp}.json`;
      const c = read(rel);
      if (!c.json.body) throw new Error(`${season}: cached ${rel} has no body`);
      hashes.push(`${rel}:${sha256(c.text)}`);
      for (const e of c.json.body.events ?? []) {
        const n = normalizeScoreboardEvent(e, { capturedAt: c.json.capturedAt, sourceGroup: grp });
        if (n.row) rows.push(n.row); else refused++;
      }
    }
  }
  const { events, conflicts } = mergeEventRows(rows);
  return { events, conflicts, refused, inputSnapshotSha256: sha256(hashes.sort().join("\n")) };
}
