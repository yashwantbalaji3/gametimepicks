# Role card · Creative Renderer

**Mission source:** `agents/visual-systems-designer/mission.md` (existing roster; this card makes the role executable, it does not replace it).

**Job:** Render the versioned template to PNG offline and produce template captions that pass the validator.

**Produces:** media-artifact

**Seats:** deterministic code only.

**Limits:** May ask Engineering for a re-render; the hop limit refuses the loop (LOOP_GUARD).

Machine-readable definition: [`roles.mjs`](roles.mjs). Enforcement: [`../orchestrator/policy.mjs`](../orchestrator/policy.mjs).
