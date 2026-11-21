#!/usr/bin/env node
/**
 * Prints the official forecast of record's snapshot id per event as JSON (lib/sports/nfl/official-snapshot-ids.mjs).
 *
 *   npx tsx scripts/nfl/official-snapshot-ids.mjs --events <id,id,…>
 *
 * A helper for build-nfl-weekly-boards.mjs, which runs under plain node inside nfl-event-window: the selector imports a
 * .ts module, so the builder asks this tsx process instead of keeping a second, node-only selector.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialSnapshotIds } from "../../src/lib/sports/nfl/official-snapshot-ids.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const i = process.argv.indexOf("--events");
const ids = i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").filter(Boolean) : [];
process.stdout.write(`${JSON.stringify(officialSnapshotIds(path.join(APP, "public"), ids))}\n`);
