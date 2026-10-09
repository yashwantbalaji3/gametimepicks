"use client";
/**
 * useDialogFocus — the ONE keyboard contract every dialog and sheet in this product shares.
 *
 * 🔴 WHY IT EXISTS. Surveyed 2026-09-26, the four dialogs on public surfaces each declared
 * `role="dialog" aria-modal="true"` and each handled Escape — and NOT ONE contained Tab:
 *
 *     mobile-bottom-nav          dialog ✓  escape ✓  focus return ✓   trap ✗
 *     player-recent-form-drawer  dialog ✓  escape ✓  focus return ✗   trap ✗
 *     search/site-search         dialog ✓  escape ✓  focus return ✗   trap ✗
 *     mr-dub/ledger-calendar     dialog ✓  escape ✓  focus return ✗   trap ✗
 *
 * ⚠ `aria-modal="true"` IS NOT A FOCUS TRAP. It tells assistive technology to treat the rest of the
 * page as inert; it does nothing to a real browser's Tab key. So Shift+Tab from the first control
 * walked straight out of the open menu into the page behind it — the reported defect — and three of
 * the four also dropped focus onto `<body>` when they closed.
 *
 * ⚠ AND THE PATTERN WAS ALREADY WRITTEN, ONCE. `simulate/presentation-player.tsx` traps Tab
 * correctly and is the only place that does. §12: do not patch each route independently when a
 * shared primitive is the root fix — so the pattern moves here and the dialogs consume it.
 *
 * WHAT IT DOES, in the order a reader experiences it:
 *   1. remembers the element that opened the dialog, at mount;
 *   2. moves focus INTO the dialog — to `initialFocus` if given, else the first focusable;
 *   3. contains Tab and Shift+Tab inside the dialog;
 *   4. closes on Escape;
 *   5. returns focus to the opener on unmount, however it was dismissed.
 *
 * ⚠ IT DOES NOT RENDER ANYTHING, and takes no view on markup. A dialog still declares its own
 * `role`, `aria-modal` and accessible name — those are claims about the element, and a hook that
 * wrote them would hide whether the element actually carries them.
 */
import { useEffect, type RefObject } from "react";

/**
 * Everything a keyboard can land on. `[tabindex="-1"]` is excluded deliberately: a container made
 * programmatically focusable (a skip target, a scroll region) is not a stop on the Tab order, and
 * treating it as one puts the trap's boundary in the wrong place.
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(el: HTMLElement | null): HTMLElement[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    /* An element that is present but not rendered cannot receive focus, and including it would
       make the trap's first/last wrong in a way that only shows up on a collapsed section. */
    .filter((n) => n.offsetParent !== null || n === document.activeElement);
}

export function useDialogFocus(
  ref: RefObject<HTMLElement>,
  {
    onClose,
    active = true,
    initialFocus,
  }: {
    onClose: () => void;
    /** A dialog that is mounted but closed traps nothing. */
    active?: boolean;
    /** Where focus should land on open. Defaults to the first focusable in the dialog. */
    initialFocus?: RefObject<HTMLElement>;
  },
): void {
  useEffect(() => {
    if (!active) return;
    /* Remembered BEFORE focus moves, or the opener is already gone. */
    const opener = document.activeElement as HTMLElement | null;

    const target = initialFocus?.current ?? focusablesIn(ref.current)[0] ?? ref.current;
    target?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const nodes = focusablesIn(ref.current);
      if (nodes.length === 0) {
        /* Nothing to move to — keep focus inside rather than letting it leave. */
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;
      /* ⚠ ALSO CATCHES FOCUS THAT IS OUTSIDE ALREADY. Checking only `activeEl === first/last`
         leaves a gap: if focus somehow sits outside the dialog, every Tab keeps it outside. */
      if (!ref.current?.contains(activeEl)) { e.preventDefault(); first.focus(); return; }
      /* ⚠ THE TRAP MOVES FOCUS ITSELF, ON EVERY TAB (UX-001, 2026-10-09). It used to step in only at the two ends and let
         the browser move focus in between — but Safari/WebKit's default Tab order SKIPS LINKS, so from the Menu's Close
         button (its only button) WebKit's next stop was outside the sheet, and every other Tab press left the open Menu
         (reproduced on Production in WebKit). Cycling through the dialog's own list is the same order in every browser. */
      e.preventDefault();
      const at = nodes.indexOf(activeEl as HTMLElement);
      const next = e.shiftKey
        ? (at <= 0 ? last : nodes[at - 1])
        : (at < 0 || at === nodes.length - 1 ? first : nodes[at + 1]);
      next.focus();
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      /* However it was dismissed — Close, Escape, or the scrim — focus goes back where it came
         from. Without this a reader is returned to <body> and has to start from the top. */
      opener?.focus?.();
    };
  }, [ref, onClose, active, initialFocus]);
}
