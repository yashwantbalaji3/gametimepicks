"use client";

/**
 * FocusOnHash — when the page is opened at `#<hash>`, move keyboard and screen-reader focus to the
 * element with id `targetId` (QA 2026-10-05). The browser already SCROLLS to an anchor, but focus stays
 * at the top of the document: /picks and the other retired aliases land on /build#suggested-cards about
 * 1,100px down, and a keyboard user's next Tab started from the page header. The target gets
 * tabIndex=-1 so it can take focus without entering the Tab order.
 */
import { useEffect } from "react";

export default function FocusOnHash({ hash, targetId }: { hash: string; targetId: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${hash}`) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }, [hash, targetId]);
  return null;
}
