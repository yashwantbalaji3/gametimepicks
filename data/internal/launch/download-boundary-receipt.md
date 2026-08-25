# Operating-record download boundary — the P205 R-A receipt

## The chain, with the boundary that lied

```
release-history.mjs (committed register, git-conserved)
  → build-operating-record.mjs → operating-record.html   [self-validated: rows/order/end marker]
  → chromium print (local)     → operating-record.pdf    [P204 verifier: PASSED — truthfully, for THESE bytes]
  → claude.ai artifact publish → viewer chrome           [the HTML view]
  → THE FOUNDER'S BROWSER PRINT of that view             ← Record4/Record5 produced HERE
```

P204's verifier validated the **local chromium print** — real bytes, honestly verified (8 pages,
all rows, terminal marker). The founder's Record5 (9 pages, cut mid-entry at 199-H, "H)" orphan
page) was produced by **their browser printing the artifact view** — a different renderer, page
size, and layout engine inside viewer chrome that no local verifier can reach. The false positive
was not a weak assertion; it was the wrong boundary: nothing that ran locally could ever have
inspected the founder's print path.

## Proof by hashes

- P204 verified bytes: sha256 `97087fe3171f4c12…` (8pp, 111 rows — receipt of 2026-08-25T00:0x).
- Record5's facts (9pp, ends `(Release` / `H)`, no 200–203 rows) match NO verified artifact —
  those bytes never existed in this repository. They are a viewer-print product.

## The repair: serve the verified bytes on the path the user actually clicks

1. The published page now **embeds the verified PDF** and offers it through the viewer's
   `downloads` capability — the founder's click saves bytes that are byte-identical to the
   verifier's receipt (`shasum -a 256` starts with the sha shown on the button).
2. The page states the boundary in words: printing the view is not the file of record.
3. A **content-addressed copy** (`/data/admin/operating-record-<sha16>.pdf`) ships in the
   protected console build (the public build's data sweep excludes it), linked from /launch's
   identity card with a three-way integrity check (receipt ↔ served bytes ↔ manifest) that
   renders red on any mismatch — and the packaging-equality guard makes a mismatch build-failing.
4. The structural verifier (v2) enumerates actual row records line-anchored in sequence —
   page-1 metadata ("last 203-R-K") can no longer satisfy any row check — and detects blank/
   orphan pages, duplicated trailing rows, and mid-entry cuts. Twelve corruption fixtures fail.

Preserved evidence: `operating-record-FAILING-BEFORE-p204.pdf` (P204's before-state) stays in
place; Record4/Record5 remain with the founder as the failing prints of the old boundary.
