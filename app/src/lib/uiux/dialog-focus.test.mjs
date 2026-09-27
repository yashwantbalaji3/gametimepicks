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


/**
 * The attribute text of the JSX tag that carries `role="dialog"`.
 *
 * ⚠ A FILE-LEVEL `aria-label` CHECK IS TOO COARSE, and a probe proved it: /build's sheet also holds
 * `aria-label="Paper stake"` on the stake input and `aria-label` on each Remove button, so deleting
 * the DIALOG's own name changed nothing. The name has to be read off the dialog element.
 *
 * Walks from the tag's `<` to its closing `>`, tracking brace depth and quotes — JSX attribute values
 * contain `>` inside arrow functions (`onClick={(e) => ...}`), so a plain indexOf(">") cuts the tag
 * short and drops the attributes after it.
 */
function dialogTags(src) {
  const tags = [];
  for (const m of src.matchAll(/role=["']dialog["']/g)) {
    let start = src.lastIndexOf("<", m.index);
    if (start === -1) continue;
    let depth = 0, quote = null, end = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) { end = i; break; }
    }
    tags.push(src.slice(start, end === -1 ? src.length : end + 1));
  }
  return tags;
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

test("🔴 a FULL-SCREEN OVERLAY is a dialog — found by structure, not by the attribute it omits", () => {
  /*
   * ⚠ THE GUARD ABOVE WAS BLIND TO EXACTLY THE DEFECT §12 REPORTED, and I proved it: strip both
   * `role="dialog"` and the hook call from the /build mobile sheet and all six tests still pass.
   * That guard enumerates files CONTAINING `role="dialog"` — so a modal missing the attribute is
   * invisible to it. It looked for the symptom's presence, and a broken modal is defined by its
   * absence. That is why the 2026-09-26 survey found four dialogs and not five.
   *
   * So this one searches by STRUCTURE. A `fixed inset-0` element is a full-screen overlay: it covers
   * the page, it takes the reader's attention, and whatever it is, a keyboard must be able to get
   * into it, move around inside it, and leave. Missing the attribute is not an exemption.
   */
  const offenders = [];
  for (const f of tsxFiles(path.join(APP, "src"))) {
    const src = code(f);
    if (!/className=["'][^"']*fixed inset-0/.test(src)) continue;
    const rel = path.relative(APP, f);
    const missing = [];
    if (!/role=["']dialog["']/.test(src)) missing.push("role=dialog");
    if (!/aria-modal/.test(src)) missing.push("aria-modal");
    /* Read off the DIALOG's own tag — see dialogTags. */
    const named = dialogTags(src).some((t) => /aria-label(ledby)?=/.test(t));
    if (!named) missing.push("an accessible name ON the dialog element");
    if (!/useDialogFocus\s*\(/.test(src)) missing.push("useDialogFocus");
    if (missing.length) offenders.push(`${rel} — missing ${missing.join(", ")}`);
  }
  assert.deepEqual(offenders, [], "a full-screen overlay that a keyboard cannot use");
});

test("the overlay guard actually finds overlays — it must not pass by finding none", () => {
  /* A structural guard whose selector matches nothing is worse than no guard: it reports success.
     This is the count that made the guard above meaningful when it was written. */
  const withOverlay = tsxFiles(path.join(APP, "src")).filter((f) =>
    /className=["'][^"']*fixed inset-0/.test(code(f)));
  assert.ok(withOverlay.length >= 5, `expected the known full-screen overlays, found ${withOverlay.length}`);
});

test("the accessible-name check reads the dialog's OWN tag, not the whole file", () => {
  /* Pins the fix for the coarse check: a file where only a NON-dialog element is labelled must fail
     the name requirement. */
  const unlabelled = '<div role="dialog" aria-modal="true" className="fixed inset-0">' +
    '<input aria-label="Paper stake" />';
  assert.equal(dialogTags(unlabelled).some((t) => /aria-label/.test(t)), false,
    "a label on a child must not satisfy the dialog's own name");

  /* And an attribute after an arrow function is still inside the tag — a plain indexOf(">") would
     have cut the tag at the `=>` and lost the name. */
  const afterArrow = '<div role="dialog" onClick={(e) => e.stopPropagation()} aria-label="Named">';
  assert.equal(dialogTags(afterArrow).some((t) => /aria-label="Named"/.test(t)), true,
    "the tag walker must survive a `>` inside an attribute expression");
});

test("🔴 a dialog whose OPENER UNMOUNTS needs its own focus-return", () => {
  /*
   * Caught by the e2e test in CI, not by any unit guard — and only because the /build pool finally had
   * a leg in it. On #721 that test SKIPPED (empty pool) and the defect shipped.
   *
   * `useDialogFocus` remembers the opener and focuses it on unmount. /build's sheet is opened by a bar
   * rendered under `{!slipOpen && …}`, so opening it UNMOUNTS the button that opened it. The cleanup
   * then calls `.focus()` on a node no longer in the document — a silent no-op — and focus lands on
   * <body>. A reader dismissing the sheet was returned to the top of the page.
   *
   * The fix is local: React re-mounts the bar when `slipOpen` goes false, and an effect declared AFTER
   * the hook focuses it. Declaration order matters — React runs cleanups then effects in order, so the
   * hook's no-op restore happens first and this effect has the real node.
   */
  const src = code(path.join(APP, "src/components/build-experience.tsx"));
  assert.match(src, /const slipOpenerRef = useRef<HTMLButtonElement>\(null\)/, "the opener needs a ref to survive unmounting");
  assert.match(src, /ref=\{slipOpenerRef\}/, "and the ref must actually be attached to the bar");
  assert.match(src, /if \(wasSlipOpen\.current && !slipOpen\) slipOpenerRef\.current\?\.focus\(\)/,
    "focus must be restored on the close transition, after the bar re-mounts");
  /* The effect must come AFTER the hook, or its cleanup would run last and steal focus back. */
  assert.ok(src.indexOf("useDialogFocus(slipSheetRef") < src.indexOf("wasSlipOpen.current && !slipOpen"),
    "the restore effect must be declared after useDialogFocus");
});

test("the openers of the OTHER dialogs persist, so the shared primitive still suffices", () => {
  /*
   * Stated so the local fix is not mistaken for a gap in the primitive. Widening `useDialogFocus` to
   * cover an unmounting opener would put five working dialogs through an untested path; each of these
   * renders its opener unconditionally relative to the dialog's own open state.
   */
  const unmountingOpeners = [];
  for (const f of tsxFiles(path.join(APP, "src"))) {
    const src = code(f);
    if (!/useDialogFocus\s*\(/.test(src)) continue;
    if (f.endsWith("build-experience.tsx")) continue; // the known case, fixed above
    /* A `{!<state> && …}` wrapper around a button is the shape that unmounts an opener. */
    if (/\{\s*!\w*[Oo]pen\w*\s*&&[\s\S]{0,400}?<button/.test(src)) unmountingOpeners.push(path.relative(APP, f));
  }
  assert.deepEqual(unmountingOpeners, [],
    "these dialogs hide their opener while open, so the primitive's focus-return is a no-op for them too");
});
