"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 to the target value on mount.
 * Uses easeOutExpo for a satisfying deceleration feel.
 */
export function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const frameRef = useRef<number>(0);
  const startValueRef = useRef(0);

  useEffect(() => {
    // Skip animation for zero or same value
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous early-return for known values
    if (target === 0) { setValue(0); return; }

    const start = startValueRef.current;
    const diff = target - start;
    if (diff === 0) { setValue(target); return; }

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = start + diff * eased;
      setValue(Math.round(current));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        startValueRef.current = target;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      // On cleanup, set the value directly so it's correct immediately on re-render
      startValueRef.current = target;
      setValue(target);
    };
  }, [target, duration]);

  return value;
}
