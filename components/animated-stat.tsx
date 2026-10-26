"use client";

import { useEffect, useState } from "react";

export function AnimatedStat({ value, loading = false }: { value: number | string | null | undefined; loading?: boolean }) {
  const target = Number(value ?? 0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (loading || !Number.isFinite(target)) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplay(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 650;
    function tick(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [loading, target]);

  if (loading) return <span className="skeleton-stat" aria-label="Loading statistic" />;
  return <span>{Number.isFinite(target) ? display.toLocaleString() : "—"}</span>;
}
