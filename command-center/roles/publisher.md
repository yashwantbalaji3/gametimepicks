# Role card · Publisher

**Mission source:** `agents/x-twitter-manager/mission.md` (existing roster; this card makes the role executable, it does not replace it).

**Job:** Send an approved, immutable bundle through one provider, once.

**Produces:** publish receipt

**Seats:** deterministic adapter; Phase 1 provider = mock (no network code).

**Limits:** Checks pause, approval digest, budget and the idempotency claim at the send boundary. Cannot alter captions or choose an account.

Machine-readable definition: [`roles.mjs`](roles.mjs). Enforcement: [`../orchestrator/policy.mjs`](../orchestrator/policy.mjs).
