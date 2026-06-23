"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 to the target value on mount.
 * Uses easeOutExpo for a satisfying deceleration feel.
 */
export function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo — fast start, smooth deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = start + diff * eased;
      setValue(Math.round(current));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}
