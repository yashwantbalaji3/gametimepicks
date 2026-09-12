import test from "node:test";
import assert from "node:assert/strict";
import { classifyTableProbe, classifyBucket, classifyReachable, classifyReaderKey, summariseSetup } from "./setup-check.mjs";

test("the check that matters: rows returned to an anonymous reader is a REFUSAL, not a warning", () => {
  const bad = classifyTableProbe("bet_slips", { status: 200, rows: [{ id: "someone-else" }] });
  assert.equal(bad.state, "REFUSE");
  assert.match(bad.detail, /row-level security is not on/);
  assert.match(bad.detail, /before anyone signs in/);
  const good = classifyTableProbe("bet_slips", { status: 200, rows: [] });
  assert.equal(good.state, "PASS");
});

test("a missing table is a fix-the-schema failure, and a refusal to read is itself a pass", () => {
  assert.equal(classifyTableProbe("profiles", { status: 404 }).state, "FAIL");
  assert.match(classifyTableProbe("profiles", { status: 404 }).detail, /run db\/accounts-schema\.sql/);
  assert.equal(classifyTableProbe("profiles", { status: 403 }).state, "PASS", "permission denied also proves it is not readable");
  assert.equal(classifyTableProbe("profiles", { status: 500 }).state, "UNKNOWN");
  assert.equal(classifyTableProbe("profiles", { error: "network down" }).state, "UNKNOWN");
});

test("a public bucket for betslip images is refused outright", () => {
  const pub = classifyBucket({ status: 200, bucket: { public: true } });
  assert.equal(pub.state, "REFUSE");
  assert.match(pub.detail, /anyone with a URL could read a betslip image/);
  assert.equal(classifyBucket({ status: 200, bucket: { public: false } }).state, "PASS");
  assert.equal(classifyBucket({ status: 404 }).state, "FAIL");
});

test("reachability distinguishes a bad key from a bad day", () => {
  assert.equal(classifyReachable({ status: 401 }).state, "FAIL");
  assert.match(classifyReachable({ status: 401 }).detail, /anon key was rejected/);
  assert.equal(classifyReachable({ status: 503 }).state, "UNKNOWN");
  assert.equal(classifyReachable({ status: 200 }).state, "PASS");
  assert.equal(classifyReachable({ error: "ENOTFOUND" }).state, "FAIL");
});

test("a missing reader key is a smaller product, not a broken one", () => {
  assert.equal(classifyReaderKey(false).state, "WARN");
  assert.equal(classifyReaderKey(true).state, "PASS");
  const s = summariseSetup([classifyReaderKey(false), classifyTableProbe("profiles", { status: 200, rows: [] })]);
  assert.equal(s.state, "READY", "a warning does not fail the check");
  assert.equal(s.exitCode, 0);
});

test("a project that never answered is not reported as a schema problem", () => {
  // Running the real script against a typo'd URL said "something in the schema is missing", which
  // would send someone to the SQL editor to fix nothing.
  const s = summariseSetup([
    classifyReachable({ error: "fetch failed" }),
    classifyTableProbe("profiles", { error: "fetch failed" }),
  ]);
  assert.equal(s.state, "UNREACHABLE");
  assert.match(s.headline, /check the URL and the anon key/);
  assert.match(s.headline, /nothing below it could be tested/);
  assert.equal(s.exitCode, 1);
});

test("unsafe outranks incomplete, and both outrank unproven", () => {
  const unsafe = summariseSetup([
    classifyTableProbe("bet_slips", { status: 200, rows: [{}] }),
    classifyTableProbe("profiles", { status: 404 }),
    classifyBucket({ status: 500 }),
  ]);
  assert.equal(unsafe.state, "UNSAFE");
  assert.equal(unsafe.exitCode, 1);
  assert.match(unsafe.headline, /STOP/);
  assert.equal(summariseSetup([classifyTableProbe("profiles", { status: 404 })]).state, "INCOMPLETE");
  assert.equal(summariseSetup([classifyBucket({ status: 500 })]).state, "UNPROVEN");
  assert.equal(summariseSetup([classifyBucket({ status: 500 })]).exitCode, 2);
});
