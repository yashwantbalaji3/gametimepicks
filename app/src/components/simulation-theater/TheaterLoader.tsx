"use client";
/**
 * Simulation Theater V2 · loader shim (spec §3.7, S11). Holds the "activated" state and imports the island only once
 * the section comes within one viewport or the reader interacts with it. Until the island module has loaded, the
 * server-rendered shell (final frame, linescore, transcript) stays on screen, so there is no empty flash.
 * It never starts playback: the island opens IDLE and waits for an explicit Play.
 *
 * Its only data prop is the compact `theater-pack@1` transport (lib/simulation-theater/theater-pack.mjs): the island
 * decodes it, so the page's RSC payload carries the samples once, in their compact form.
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";

type IslandProps = { pack: unknown; devHooks?: boolean };
type IslandType = ComponentType<IslandProps>;

export default function TheaterLoader({ pack, devHooks = false, children }: { pack: unknown; devHooks?: boolean; children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [Island, setIsland] = useState<IslandType | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setActive(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setActive(true); }, { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!active || Island) return;
    let alive = true;
    import("./TheaterIsland").then((m) => { if (alive) setIsland(() => m.default as unknown as IslandType); }).catch(() => { /* the static shell stays */ });
    return () => { alive = false; };
  }, [active, Island]);

  if (Island) return <Island pack={pack} devHooks={devHooks} />;
  return (
    <div ref={ref} onPointerDown={() => setActive(true)} onFocusCapture={() => setActive(true)}>
      {children}
    </div>
  );
}
