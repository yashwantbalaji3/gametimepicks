# Post-merge verifiers for #1088 and #1101

These are read-only scripts and share no code with the gates they check. Run them from the repo root after `git fetch origin`, passing the merge commit:

```
python3 -I docs/launch/approvals/verify/verify_1088.py <merge-sha> --runs
python3 -I docs/launch/approvals/verify/verify_1101.py <merge-sha> --runs
```

Both exit 1 on any failure.

## Negative controls (2026-10-16, run on today's real, ungated history)
### `verify_1101.py`, from `de48cee2fd^`
- **FAIL** on all 5 settle commits: 383 and 390 stamp-only past-dated files per run.
- It also lists the 5 real past-dated changes and the 10 added files of the first run.
- Model-rows 09-02 to 09-04 are flagged as restamped.

These figures match the guard's replay.

### `verify_1088.py`, from `37dc587bb8^`
- **FAIL** on the 9 stamp-only commits that built.
- **OK** on the 3 content publishes: the 10-16 new-day file (09:36Z) and the lineup changes at 20:01Z and 21:36Z.

**Caveat:** on ungated history every parent carries a fresh stamp, so the 18:53Z heartbeat publish cannot be recognised. After the merge, suppressed commits keep their older stamps, and the heartbeat check measures the real age.
