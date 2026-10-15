# Shallow-clone fallback in the Vercel ignore step (2026-10-15)

Question: do the deploy-skip rules (#1091, #1088) silently turn into full builds because Vercel clones with
`--depth=10` and the previous deployed SHA falls outside the clone?

- `real.py` — real outcomes (GitHub "Vercel" statuses, 14 d). BASE = last COMPLETED deployment before each attempt.
  Result: 11/1,235 attempts (0.9%) had BASE outside the clone; 1 was ignorable (waste), 10 needed a build anyway.
  Same under pre-#1091, #1091, and #1091 + #1088 (105 suppressions from #1088's `replay-6.json`).
- `replay.py`, `replay2.py` — idealised sequential replays (every build succeeds). Longest ignored run with #1088: 6.
- `gap-fetch.patch` — fail-safe fix: fetch the one missing commit at depth 1 from the public URL, then diff trees;
  any failure builds. Measured against GitHub: 21 s, ~38 MB for a commit 14 back. Tests:
  `vercel-ignore-shallow-gap.test.mjs` (5 cases on a real depth-10 clone; 3 fail on the current script).
- Not proposed: at current rates it saves about as much as it costs. Revisit if ignored runs grow longer.
