/**
 * Read the Odds API key from the founder's existing dotenv file (founder 2026-11-11: no duplicate key file). Node-only.
 *
 * Parses ONLY the `ODDS_API_KEY` line and returns its value; no other variable is read into the result, process.env or
 * any child environment. Refuses a missing file, a non-regular file, or one readable or writable by group or others
 * (mode must be 600 or stricter). An error message never contains the key or any part of it.
 */
import fs from "node:fs";

export const KEY_VAR = "ODDS_API_KEY";

/** @returns { ok: true, key } or { ok: false, reason } */
export function readOddsKeyFromEnvFile(file) {
  let st;
  try { st = fs.statSync(file); } catch { return { ok: false, reason: "the key env file does not exist" }; }
  if (!st.isFile()) return { ok: false, reason: "the key env file is not a regular file" };
  if ((st.mode & 0o077) !== 0) return { ok: false, reason: `the key env file is readable or writable by group or others (mode ${(st.mode & 0o777).toString(8)}); it must be 600` };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const hits = lines.map((l) => /^\s*(?:export\s+)?ODDS_API_KEY\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean);
  if (!hits.length) return { ok: false, reason: `no ${KEY_VAR} line in the key env file` };
  if (hits.length > 1) return { ok: false, reason: `more than one ${KEY_VAR} line in the key env file` };
  let v = hits[0][1];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  else v = v.replace(/\s+#.*$/, "");
  if (!v) return { ok: false, reason: `${KEY_VAR} is empty in the key env file` };
  return { ok: true, key: v };
}
