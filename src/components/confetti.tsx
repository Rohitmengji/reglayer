"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Celebration Confetti System
 * ---------------------------------------------------------
 *
 * WHY: Emotional design. Users remember how software makes them feel.
 * Celebrating milestones (100% compliance, streak achievements) creates
 * dopamine hits that drive retention.
 *
 * WHAT:
 * - Canvas-based particle system (60fps, zero dependencies)
 * - Brand-colored confetti with physics (gravity, wind, rotation)
 * - Triggered programmatically via exported function
 * - Auto-cleans after animation completes
 * - Respects prefers-reduced-motion
 *
 * HOW:
 * - Creates a full-screen canvas overlay
 * - Spawns particles with randomized velocity, color, rotation
 * - Animates via requestAnimationFrame
 * - Removes canvas when all particles fall off screen
 * ---------------------------------------------------------
 */

import { useCallback, useRef, useEffect } from "react";

// Brand colors for confetti
const CONFETTI_COLORS = [
  "#6366f1", // indigo (brand primary)
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald (success)
  "#f59e0b", // amber
  "#ec4899", // pink
  "#3b82f6", // blue
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  gravity: number;
  opacity: number;
  fadeSpeed: number;
}

function createParticles(count: number, originX: number, originY: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const velocity = 8 + Math.random() * 12;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
      vy: Math.sin(angle) * velocity * -1 - Math.random() * 4,
      width: 6 + Math.random() * 6,
      height: 4 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.25 + Math.random() * 0.15,
      opacity: 1,
      fadeSpeed: 0.005 + Math.random() * 0.005,
    });
  }
  return particles;
}

// Global trigger function
let triggerConfetti: (() => void) | null = null;

export function fireConfetti() {
  triggerConfetti?.();
}

export function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const launch = useCallback(() => {
    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = "block";

    // Create particles from center-top
    const centerX = canvas.width / 2;
    const centerY = canvas.height * 0.3;
    particlesRef.current = createParticles(120, centerX, centerY);

    // Also fire from sides for dramatic effect
    particlesRef.current.push(...createParticles(40, canvas.width * 0.2, centerY));
    particlesRef.current.push(...createParticles(40, canvas.width * 0.8, centerY));

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;
      for (const p of particlesRef.current) {
        if (p.opacity <= 0) continue;
        alive++;

        // Physics
        p.vy += p.gravity;
        p.vx *= 0.99; // air resistance
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.fadeSpeed;

        // Draw
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (alive > 0) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        canvas.style.display = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    cancelAnimationFrame(animRef.current);
    animate();
  }, []);

  // Register global trigger
  useEffect(() => {
    triggerConfetti = launch;
    return () => { triggerConfetti = null; };
  }, [launch]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[99999]"
      style={{ display: "none" }}
      aria-hidden="true"
    />
  );
}
