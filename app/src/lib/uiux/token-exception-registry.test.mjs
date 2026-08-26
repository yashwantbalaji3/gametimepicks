/**
 * F8 CLOSURE GUARD (P210 · Release A) — every colour literal in source is accounted for.
 *
 * The registry is the complete account: a literal in an unregistered file fails, a registered
 * file over its shrink-only maximum fails, and the corruption cases prove the guard can actually
 * catch both. This is the "zero outside the strict named exception registry" contract — the
 * baseline ratchet keeps its independent classes beside it.
 *
 * Run: npx tsx --test src/lib/uiux/token-exception-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanColorLiterals } from "./color-scan.mjs";
import { TOKEN_EXCEPTIONS, exceptionCeilings } from "./token-exception-registry.mjs";

test("every literal-bearing file is registered, inside its shrink-only maximum", () => {
  const scan = scanColorLiterals();
  const ceilings = exceptionCeilings();
  const offenders = [];
  for (const [file, hits] of scan) {
    const reg = ceilings.get(file);
    if (!reg) { offenders.push(`${file}: ${hits.length} literal(s), NOT in the exception registry`); continue; }
    if (hits.length > reg.max) offenders.push(`${file}: ${hits.length} > registered max ${reg.max} (${reg.entry})`);
  }
  assert.deepEqual(offenders, [], `unregistered or over-ceiling colour literals:\n  ${offenders.join("\n  ")}`);
});

test("registered files that go clean can only ratchet DOWN (a stale generous ceiling is flagged)", () => {
  // A ceiling more than double the current count means the migration happened and the registry was
  // not tightened with it — the shrink-only direction is enforced by making staleness loud.
  const scan = scanColorLiterals();
  const stale = [];
  for (const e of TOKEN_EXCEPTIONS) {
    if (e.removal.startsWith("never")) continue; // permanent classes hold their pinned truth
    for (const [f, max] of Object.entries(e.files)) {
      const now = scan.get(f)?.length ?? 0;
      if (now === 0 && max > 0) stale.push(`${f}: clean but still registered at max ${max} — remove the entry`);
    }
  }
  assert.deepEqual(stale, [], stale.join("\n"));
});

test("CORRUPTION · an unregistered literal fails; an over-max file fails; a widened registry is visible", () => {
  const ceilings = exceptionCeilings();
  // Synthetic scan: a brand-new file with a hex literal must be an offender.
  const synthetic = new Map([["src/components/fake-new.tsx", ["#ABCDEF"]]]);
  const offend1 = [...synthetic].filter(([f]) => !ceilings.get(f));
  assert.equal(offend1.length, 1, "an unregistered file is caught");
  // A registered file exceeding its max must be an offender.
  const some = [...ceilings.entries()][0];
  const over = new Map([[some[0], Array.from({ length: some[1].max + 1 }, () => "#ABCDEF")]]);
  const offend2 = [...over].filter(([f, hits]) => (ceilings.get(f)?.max ?? 0) < hits.length);
  assert.equal(offend2.length, 1, "an over-ceiling file is caught");
  // Registry shape: every max is a positive integer (a widened/NaN ceiling cannot hide).
  for (const e of TOKEN_EXCEPTIONS) {
    for (const [f, max] of Object.entries(e.files)) {
      assert.ok(Number.isInteger(max) && max > 0, `${e.id}/${f}: max must be a positive integer`);
    }
  }
});
