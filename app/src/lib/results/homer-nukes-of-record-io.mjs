/** IO for homer-nukes-of-record.mjs: the committed correction logs. An unreadable log fails closed (throws). */
import fs from "node:fs";
import path from "node:path";
import { HN_CORRECTIONS_DIR, indexHomerNukesCorrections } from "./homer-nukes-of-record.mjs";

export function readHomerNukesCorrections(rootDir) {
  const dir = path.join(rootDir, HN_CORRECTIONS_DIR);
  if (!fs.existsSync(dir)) return new Map();
  const logs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  return indexHomerNukesCorrections(logs);
}
