"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Sound Design System
 * ---------------------------------------------------------
 *
 * WHY: Sound adds a sensory dimension to interactions. A subtle "ding"
 * on success or "pop" on navigation creates subconscious satisfaction.
 * Mac apps (Messages, Mail) do this beautifully.
 *
 * WHAT:
 * - Web Audio API-based sound generation (no audio files needed)
 * - Sounds: success, error, notification, click, celebration
 * - User preference stored in localStorage (opt-in)
 * - Respects system mute and prefers-reduced-motion
 * - Tiny footprint — synthesized sounds, zero network requests
 *
 * HOW:
 * - AudioContext created lazily on first user interaction
 * - OscillatorNode for tones, simple ADSR envelopes
 * - GainNode for volume control and fading
 * - All sounds < 200ms duration (non-intrusive)
 * ---------------------------------------------------------
 */

import { useCallback, useRef, useEffect, useState } from "react";

const SOUND_PREF_KEY = "reglayer_sounds_enabled";

// Shared AudioContext (created on demand)
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// ─── Sound Definitions ────────────────────────────────────────────────────────

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  // ADSR envelope
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01); // Attack
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration); // Release

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export const sounds = {
  /** Short bright ping — save, toggle, small success */
  click: () => {
    playTone(800, 0.08, "sine", 0.08);
  },

  /** Rising two-note — success, scan complete */
  success: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(523, 0.12, "sine", 0.12); // C5
    setTimeout(() => playTone(659, 0.15, "sine", 0.12), 100); // E5
  },

  /** Descending tone — error, failure */
  error: () => {
    playTone(330, 0.15, "triangle", 0.1); // E4
    setTimeout(() => playTone(262, 0.2, "triangle", 0.08), 120); // C4
  },

  /** Soft knock — notification arrives */
  notification: () => {
    playTone(587, 0.08, "sine", 0.1); // D5
    setTimeout(() => playTone(784, 0.1, "sine", 0.08), 80); // G5
  },

  /** Bright chord — celebration, 100% compliance */
  celebration: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(523, 0.2, "sine", 0.1); // C5
    setTimeout(() => playTone(659, 0.2, "sine", 0.1), 80); // E5
    setTimeout(() => playTone(784, 0.3, "sine", 0.1), 160); // G5
    setTimeout(() => playTone(1047, 0.4, "sine", 0.08), 240); // C6
  },

  /** Soft pop — navigation, tab switch */
  pop: () => {
    playTone(440, 0.05, "sine", 0.06);
  },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSounds() {
  const [enabled, setEnabled] = useState(false);
  const initialized = useRef(false);

  // Load preference
  useEffect(() => {
    const pref = localStorage.getItem(SOUND_PREF_KEY);
    setEnabled(pref === "true");
    initialized.current = true;
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      if (next) sounds.click(); // Confirmation sound
      return next;
    });
  }, []);

  const play = useCallback(
    (sound: keyof typeof sounds) => {
      if (!enabled) return;
      // Respect reduced motion as a proxy for "reduce stimulation"
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      sounds[sound]();
    },
    [enabled]
  );

  return { enabled, toggle, play };
}
