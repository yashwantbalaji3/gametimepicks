# Forward tests B / B2 / B-GAMES · amendment 3 (2026-10-10, before any included game has started; no code change)

**What the frozen code does:**
- `run-forward-b.mjs`, `run-forward-b2.mjs` and `grade-forward-b-games.mjs` admit a game when its **scheduled** start (the capture's `eventStartTime`) is after the registration commit.
- The preregistrations' text says "actual first pitch".

**Effect:** the two differ only for a game scheduled before a registration time but actually started after it. Every remaining game was scheduled after 2026-10-10 06:53Z (the first is 849831, scheduled 2026-10-11T00:00Z), so **no game is affected**.

**The rule:** the frozen code's rule (scheduled start after registration) is the window. The forecast itself must still use only inputs captured before the scheduled start, as the code enforces.

**Code review, 2026-10-10 07:45Z (no defect found):**
- side and team mapping;
- starter and bullpen orientation;
- strikeout attribution;
- starter-only batter lines;
- the window and refusal rules;
- the grader's void, push and pending rules;
- the date-folder convention for 00:00Z games.
