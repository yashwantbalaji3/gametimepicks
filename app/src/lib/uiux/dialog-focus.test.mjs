/**
 * EVERY DIALOG SHARES ONE KEYBOARD CONTRACT — and none of them had a focus trap.
 *
 * 🔴 SURVEYED 2026-09-26. Four dialogs on public surfaces, each declaring `role="dialog"` and
 * `aria-modal="true"`, each handling Escape, and NOT ONE containing Tab:
 *
 *     mobile-bottom-nav          escape ✓  focus return ✓   trap ✗
 *     player-recent-form-drawer  escape ✓  focus return ✗   trap ✗
 *     search/site-search         escape ✓  focus return ✗   trap ✗
 *     mr-dub/ledger-calendar     escape ✓  focus return ✗   trap ✗
 *
 * ⚠ `aria-modal="true"` IS NOT A FOCUS TRAP. It tells assistive technology the rest of the page is
 * inert and does nothing to a real browser's Tab key, so Shift+Tab walked out of the open menu into
 * the page behind it — the reported defect. Three of the four also dropped focus onto `<body>` when
 * dismissed.
 *
 * ⚠ AND THE PATTERN WAS ALREADY WRITTEN, ONCE, in `simulate/presentation-player.tsx`. §12: do not
 * patch each route independently when a shared primitive is the root fix.
 *
 * This file pins the CONTRACT (every dialog consumes the hook; the hook does all five things).
 * `e2e/dialog-focus.spec.ts` proves the BEHAVIOUR in a real browser.
 *
 * Run: cd app && npx tsx --test src/lib/uiux/dialog-focus.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const HOOK = path.join(APP, "src/components/a11y/use-dialog-focus.ts");
const read = (p) => fs.readFileSync(p, "utf8");
/** Comments stripped: these guards are about what the code does, not what it explains. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function tsxFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

test("the shared hook does all five things a dialog owes a keyboard", () => {
  const src = code(HOOK);
  assert.match(src, /document\.activeElement/, "1 · it must remember the opener");
  assert.match(src, /target\?\.focus\(\)/, "2 · it must move focus in");
  assert.match(src, /e\.key !== "Tab"/, "3 · it must contain Tab");
  assert.match(src, /e\.shiftKey/, "3 · and Shift+Tab");
  assert.match(src, /e\.key === "Escape"/, "4 · it must close on Escape");
  assert.match(src, /opener\?\.focus/, "5 · it must return focus on unmount");
});

test("🔴 focus that is ALREADY outside is pulled back in", () => {
  /* Checking only `activeElement === first/last` leaves a gap: if focus sits outside the dialog,
     every Tab keeps it outside, and the trap is a trap with an open door. */
  assert.match(code(HOOK), /!ref\.current\?\.contains\(activeEl\)/);
});

test("a container made programmatically focusable is not a Tab stop", () => {
  /* `[tabindex="-1"]` is a skip target or a scroll region, not a stop — including it would put the
     trap's first/last boundary on an element the reader can never Tab to. */
  assert.match(code(HOOK), /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
});

test("🔴 EVERY dialog in the product consumes the shared hook", () => {
  const offenders = [];
  for (const f of tsxFiles(path.join(APP, "src"))) {
    const src = code(f);
    if (!/role=["']dialog["']/.test(src)) continue;
    /* ⚠ THE CALL, NOT THE IMPORT. Matching /useDialogFocus/ passed on a file whose call had been
       deleted but whose import line remained — the same "matched the mention, not the thing"
       shape as three earlier guards in this session. */
    if (!/useDialogFocus\s*\(/.test(src)) offenders.push(path.relative(APP, f));
  }
  assert.deepEqual(offenders, [],
    "these declare role=dialog without the shared keyboard contract — Tab will walk out of them");
});

test("no dialog CLOSES ITSELF on Escape beside the shared handler", () => {
  /*
   * Two owners of the same key is how one of them stops being maintained.
   *
   * ⚠ MENTIONING Escape IS NOT OWNING IT. The first version of this guard flagged any
   * `e.key === "Escape"`, which caught `presentation-player`'s line that DEFERS to the hook
   * (`if (e.key === "Escape" || e.key === "Tab") return;`) — a false positive on the very pattern
   * the refactor introduced. What matters is whether a component still calls its own close.
   */
  const doubles = [];
  for (const f of tsxFiles(path.join(APP, "src"))) {
    const src = code(f);
    if (!/useDialogFocus\s*\(/.test(src)) continue;
    for (const line of src.split("\n")) {
      if (!/e\.key === "Escape"/.test(line)) continue;
      if (/\b(onClose|close|setOpen)\s*\(/.test(line)) { doubles.push(path.relative(APP, f)); break; }
    }
  }
  assert.deepEqual(doubles, [], "these still close themselves on Escape");
});

test("the hook renders nothing and makes no claim the markup must make", () => {
  const src = code(HOOK);
  /* A hook that wrote role/aria-modal/aria-label would hide whether the element actually carries
     them — and those are claims about the element, not about its keyboard behaviour. */
  /*
   * ⚠ TWO REGEXES I GOT WRONG BEFORE THIS ONE. `/return\s*\(/` matches the effect's own
   * `return () => {...}` cleanup, and `/<[A-Za-z]/` matches TypeScript generics
   * (`querySelectorAll<HTMLElement>`). Neither had anything to do with markup.
   *
   * The structural guarantee is the file extension: JSX requires `.tsx`, and this is `.ts`. The
   * ARIA claims are asserted directly, as attribute strings.
   */
  assert.ok(HOOK.endsWith(".ts") && !HOOK.endsWith(".tsx"), "a hook that rendered would need .tsx");
  for (const banned of [/role=["']/, /aria-modal=/, /aria-label=/]) {
    assert.equal(banned.test(src), false, `the hook must not own markup (${banned})`);
  }
});
