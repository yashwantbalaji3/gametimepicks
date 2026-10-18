"use client";
/**
 * Simulation Theater V2 · loader shim (spec §3.7, S11). Holds the "activated" state and imports the island only once
 * the section comes within one viewport or the reader interacts with it. Until the island module has loaded, the
 * server-rendered shell (final frame, linescore, transcript) stays on screen, so there is no empty flash.
 * It never starts playback: the island opens IDLE and waits for an explicit Play.
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import type { TheaterManifest } from "./types";

type IslandType = ComponentType<{ manifest: TheaterManifest }>;

export default function TheaterLoader({ manifest, children }: { manifest: TheaterManifest; children: ReactNode }) {
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
    import("./TheaterIsland").then((m) => { if (alive) setIsland(() => m.default as IslandType); }).catch(() => { /* the static shell stays */ });
    return () => { alive = false; };
  }, [active, Island]);

  if (Island) return <Island manifest={manifest} />;
  return (
    <div ref={ref} onPointerDown={() => setActive(true)} onFocusCapture={() => setActive(true)}>
      {children}
    </div>
  );
}
