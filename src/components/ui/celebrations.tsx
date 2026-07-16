"use client";

/**
 * Celebration animations for milestone moments.
 *
 * WHY: Fixing violations feels mundane. Celebrations create dopamine hits
 *      that reinforce positive behavior (Linear confetti pattern).
 * WHAT: Confetti burst on milestones, animated score counter.
 * HOW: CSS-only particles (no external library), requestAnimationFrame counter.
 */

import { useEffect, useState, useCallback } from "react";

// ── Confetti Burst ───────────────────────────────────────────────────────────

interface ConfettiProps {
  /** Trigger the confetti burst */
  active: boolean;
  /** Duration in ms before auto-cleanup */
  duration?: number;
}

export function ConfettiBurst({ active, duration = 2000 }: ConfettiProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number }>>([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }

    const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[i % colors.length],
      delay: Math.random() * 300,
    }));
    setParticles(newParticles);

    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [active, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-2 h-2 rounded-full animate-confetti"
          style={{
            left: `${p.x}%`,
            top: "-10px",
            backgroundColor: p.color,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Animated Score Counter ───────────────────────────────────────────────────

interface AnimatedScoreProps {
  value: number;
  /** Duration of the count-up animation in ms */
  duration?: number;
  className?: string;
}

export function AnimatedScore({ value, duration = 1200, className = "" }: AnimatedScoreProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplayValue(0); return; }

    const start = performance.now();
    const startVal = displayValue;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (value - startVal) * eased);
      setDisplayValue(current);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}

// ── Milestone Detection Hook ─────────────────────────────────────────────────

type MilestoneType = "score_improved" | "violations_fixed" | "compliance_achieved" | null;

export function useMilestoneDetection(): {
  milestone: MilestoneType;
  triggerMilestone: (type: MilestoneType) => void;
  dismissMilestone: () => void;
} {
  const [milestone, setMilestone] = useState<MilestoneType>(null);

  const triggerMilestone = useCallback((type: MilestoneType) => {
    setMilestone(type);
    // Auto-dismiss after 3s
    setTimeout(() => setMilestone(null), 3000);
  }, []);

  const dismissMilestone = useCallback(() => setMilestone(null), []);

  return { milestone, triggerMilestone, dismissMilestone };
}
