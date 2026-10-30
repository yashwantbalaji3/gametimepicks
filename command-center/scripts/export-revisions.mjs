#!/usr/bin/env node
/**
 * Writes ~/gtp-private/graphics/approvals/revision-requests.json from the running console (read-only on the console).
 * The console also writes this file itself on each revision, once it runs code that includes that step.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { revisionRequests } from "../contracts/revision-requests.mjs";

const port = Number(process.env.GTP_CC_PORT ?? 4190);
const root = path.resolve(process.env.GTP_CC_IMPORT_ROOT ?? path.join(os.homedir(), "gtp-private/graphics"));
const s = await new Promise((ok, no) => {
  // node:http: fetch refuses port 4190
  http.get(`http://127.0.0.1:${port}/api/state`, { timeout: 180_000 }, (r) => { const c = []; r.on("data", (d) => c.push(d)); r.on("end", () => ok(JSON.parse(Buffer.concat(c).toString("utf8")))); }).on("error", no);
});
const dir = path.join(root, "approvals");
let status = {};
try { status = JSON.parse(fs.readFileSync(path.join(dir, "revision-status.json"), "utf8")); } catch { /* none yet */ }
const requests = revisionRequests(s.posts, status);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, "revision-requests.json");
fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ schema: "gtp-cc-revision-requests@1", requests }, null, 2)}\n`);
fs.renameSync(`${file}.tmp`, file);
console.log(`${requests.length} request(s): ${requests.filter((r) => r.status !== "COMPLETED").length} open → ${file}`);
