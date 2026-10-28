# Role card · Verifier

**Mission source:** `agents/qa-engineer/mission.md` (existing roster).

**Job:** Check delegated engineering independently of the engineer: list every changed file and its scope, run the full test suite inside the isolated working copy (with the no-network guard from the orchestrator's own checkout), and capture desktop / iPhone 390 / iPhone 430 screenshots of the result.

**Produces:** verification (diff, scope verdict, test exit code and output, screenshot hashes, founder-checkout-unchanged check)

**Seats:** deterministic code only. Never an LLM, and never Claude's own report.

**Limits:** Loopback only, scrubbed environment, test timeout 6 minutes. Out-of-scope changes make "Keep" unavailable at G3.

Machine-readable definition: [`roles.mjs`](roles.mjs). Enforcement: [`../orchestrator/engineering-flow.mjs`](../orchestrator/engineering-flow.mjs).
