"use client";
/**
 * OpenOnHash — keeps deep links working into folded content (UX Release 2B, GTP-19/20).
 *
 * Folding a hub section into a <details> must not break `/nfl/#nfl-coverage`, the hub nav's anchors, or an
 * in-page "Model details" link. Chrome auto-expands a closed <details> on fragment navigation; Safari and
 * Firefox do not reliably. This sits inside a disclosure and, on load and on every hash change, opens its
 * parent <details> when the hash target is inside it (or is it), then scrolls the target into view.
 * Renders nothing visible.
 */
import { useEffect, useRef } from "react";

export default function OpenOnHash() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const details = ref.current?.closest("details");
      if (!target || !details || !details.contains(target) || details.open) return;
      details.open = true;
      target.scrollIntoView();
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return <span ref={ref} hidden />;
}
