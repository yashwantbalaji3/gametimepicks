/**
 * Session 5 · B6 — Production Ask answered a live NFL score question (PIT @ CLE, Q3) with "NFL live state is not
 * available … the endpoint refuses it": the registry, the planner and the help corpus still said so, though NFL
 * live has been public since 2026-09-25. The tool passes the gateway's answer through; nothing else may decide it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getLiveSlate } from "./tools/live.mjs";

test("no Ask surface claims NFL live state is unavailable — the gateway decides", () => {
  for (const p of ["src/lib/ask/registry.mjs", "src/lib/ask/planner.mjs", "src/lib/ask/help-source.mjs", "../data/ask-projection/v1/help.json"]) {
    const s = fs.readFileSync(p, "utf8");
    assert.doesNotMatch(s, /NFL live state is (NOT|not) available/, `${p} still tells the model NFL live is refused`);
    assert.doesNotMatch(s, /NFL live state, NFL 2026/, `${p}: NFL live is not an UNSUPPORTED_DATA class`);
  }
});

test("an NFL gateway answer reaches Ask as OK; a refusal stays a refusal", async () => {
  const ok = await getLiveSlate({ sport: "NFL" }, { liveFetch: async () => ({ ok: true, sport: "nfl", fetchedAt: "2026-10-02T02:34:00Z", events: [{ eventId: "401872964", state: "LIVE", competitors: { away: { abbr: "PIT", score: 10 }, home: { abbr: "CLE", score: 21 } } }] }) });
  assert.notEqual(ok.status, "UNSUPPORTED");
  const refused = await getLiveSlate({ sport: "NFL" }, { liveFetch: async () => ({ unavailable: true, reason: "UNSUPPORTED_SPORT" }) });
  assert.equal(refused.status, "UNSUPPORTED");
});
