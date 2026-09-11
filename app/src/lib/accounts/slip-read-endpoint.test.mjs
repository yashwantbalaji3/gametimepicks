/**
 * The slip-read endpoint's refusals (P263). The handler spends money and reads a stored image, so
 * every way it must say no is driven here, and the handler itself is held to three source rules:
 * decide before you fetch, take identity from the token, and never save.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decideSlipRead, pathBelongsTo, auditLine, missingConfig, MAX_IMAGE_BYTES, REQUIRED_ENV } from "../../../api/_slip-read-core.mjs";

const ENV = { ANTHROPIC_API_KEY: "k", SUPABASE_SERVICE_ROLE_KEY: "s", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
const BODY = { userId: "user-1", path: "user-1/slip.png", contentType: "image/png", bytes: 120_000 };
/* app/api, not the repo root: the suite runs with cwd = app/. */
const HANDLER = fs.readFileSync(path.join(process.cwd(), "api/slip-read.mjs"), "utf8");

test("with no keys it refuses and names what is missing — never a half-attempt", () => {
  const d = decideSlipRead({ env: {}, authorization: "Bearer t", body: BODY });
  assert.equal(d.status, 503);
  assert.equal(d.proceed, false);
  for (const k of REQUIRED_ENV) assert.match(d.reason, new RegExp(k));
  assert.deepEqual(missingConfig({ ...ENV, ANTHROPIC_API_KEY: " " }), ["ANTHROPIC_API_KEY"], "blank counts as missing");
});

test("a caller without a bearer token is not signed in", () => {
  assert.equal(decideSlipRead({ env: ENV, body: BODY }).status, 401);
  assert.equal(decideSlipRead({ env: ENV, authorization: "Basic abc", body: BODY }).status, 401);
});

test("a slip can only be read from the caller's own folder", () => {
  const other = decideSlipRead({ env: ENV, authorization: "Bearer t", body: { ...BODY, path: "user-2/slip.png" } });
  assert.equal(other.status, 403);
  assert.equal(pathBelongsTo("user-1/../user-2/slip.png", "user-1"), false, "traversal");
  assert.equal(pathBelongsTo("/user-1/slip.png", "user-1"), false, "absolute");
  assert.equal(pathBelongsTo("user-1/nested/slip.png", "user-1"), false, "one file, one folder deep");
  assert.equal(pathBelongsTo("user-1/slip.png", "user-1"), true);
});

test("only real image types, only sane sizes", () => {
  assert.equal(decideSlipRead({ env: ENV, authorization: "Bearer t", body: { ...BODY, contentType: "application/pdf" } }).status, 415);
  assert.equal(decideSlipRead({ env: ENV, authorization: "Bearer t", body: { ...BODY, bytes: undefined } }).status, 400);
  assert.equal(decideSlipRead({ env: ENV, authorization: "Bearer t", body: { ...BODY, bytes: MAX_IMAGE_BYTES + 1 } }).status, 413);
  const ok = decideSlipRead({ env: ENV, authorization: "Bearer t", body: BODY });
  assert.equal(ok.status, 200);
  assert.equal(ok.proceed, true);
});

test("the audit line carries no key, no token, and no whole user id", () => {
  const line = auditLine(decideSlipRead({ env: ENV, authorization: "Bearer super-secret", body: BODY }), BODY);
  assert.ok(!line.includes("super-secret") && !line.includes("\"k\"") && !line.includes("service"));
  assert.match(line, /user-1…|user-1/, "an id prefix is enough to trace a request");
  assert.ok(line.length < 300);
});

test("the handler decides before it spends, takes identity from the token, and saves nothing", () => {
  const decideAt = HANDLER.indexOf("decideSlipRead(");
  const fetchAt = HANDLER.indexOf("await fetch(");
  assert.ok(decideAt > 0 && decideAt < fetchAt, "no image is fetched and no model is called before the refusals");
  assert.match(HANDLER, /auth\/v1\/user/, "the caller's identity is read from their token");
  assert.match(HANDLER, /user\.id !== body\.userId/, "a body may claim any id; the token decides");
  assert.match(HANDLER, /saved: false/, "the endpoint never writes a row");
  assert.match(HANDLER, /validateReading\(/, "and the reading goes through the same validator as a manual entry");
  /* Line by line, not one alternation across the whole file: `A|B[^)]*\)` binds the alternation
     around the ENTIRE pattern, so the second branch matched the handler's ordinary key read. A guard
     that fires on correct code gets weakened until it fires on nothing. */
  const logLines = HANDLER.split("\n").filter((l) => l.includes("console.log"));
  assert.ok(logLines.length > 0, "the handler does log its decisions");
  for (const l of logLines) assert.doesNotMatch(l, /API_KEY|SERVICE_ROLE|Bearer|authorization/i, `a key or token reaches the log: ${l.trim()}`);
  assert.match(HANDLER, /const MODEL = "claude-[a-z0-9-]+"/, "the model is pinned, not picked at runtime");
});
