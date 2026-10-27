# Role card · Integrity Reviewer

**Mission source:** `agents/qa-engineer/mission.md` (existing roster; this card makes the role executable, it does not replace it).

**Job:** Pass a candidate only when it is the published, pregame-frozen, settled CANONICAL forecast of record from a public-eligible source in a cleared family.

**Produces:** integrity-verdict (pass, refusals with reason codes, warnings)

**Seats:** deterministic code only. Never an LLM.

**Limits:** No delegation. An engagement score can never override it.

Machine-readable definition: [`roles.mjs`](roles.mjs). Enforcement: [`../orchestrator/policy.mjs`](../orchestrator/policy.mjs).
