# Forward test B · amendment 2 (2026-10-10, before any included game has started; procedure only)

**The rule:** a date is materialised **only** through `materialize.sh`. The wrapper refuses unless every model file is byte-identical to the frozen registration tree (`df30f710a2`). The files checked are:
- the full-game engine, rules, invariants and board adapter;
- the RNG;
- the leans-of-record reader;
- the forward script and the grader.

**Why:**
- The forward script reads the engine from the working tree.
- Without this guard, a later merge into the branch could change the forward model silently.
- Data merges (pregame captures, box scores) do not touch these files.

**Unchanged:** no model, threshold, window or metric.

**Box scores:** the wrapper also captures the date's (and the previous date's) official box scores first. That is the approved free StatsAPI capture; an existing date file is never overwritten.
