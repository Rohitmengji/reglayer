"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Empty State Illustrations
 * ---------------------------------------------------------
 *
 * WHY: Custom illustrations make empty states feel intentional and premium.
 * Inline SVGs load instantly (no network requests), scale perfectly,
 * and respect dark mode via CSS classes.
 *
 * WHAT: Library of themed SVG illustrations for empty/error states.
 * HOW: Each is a React component returning an inline SVG with subtle animations.
 * ---------------------------------------------------------
 */

export function IllustrationScan({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-indigo-50 dark:fill-indigo-950/20" />
      <circle cx="80" cy="80" r="50" className="stroke-indigo-100 dark:stroke-indigo-900/40" strokeWidth="2" />
      {/* Scanner beam */}
      <line x1="80" y1="30" x2="80" y2="130" className="stroke-indigo-300/50 dark:stroke-indigo-600/30" strokeWidth="1" strokeDasharray="4 3">
        <animate attributeName="x1" values="40;120;40" dur="3s" repeatCount="indefinite" />
        <animate attributeName="x2" values="40;120;40" dur="3s" repeatCount="indefinite" />
      </line>
      {/* Document */}
      <rect x="55" y="50" width="50" height="60" rx="4" className="fill-white dark:fill-neutral-800 stroke-indigo-200 dark:stroke-indigo-700" strokeWidth="1.5" />
      <path d="M65 65 H95 M65 75 H90 M65 85 H85 M65 95 H75" className="stroke-indigo-200 dark:stroke-indigo-700" strokeWidth="2" strokeLinecap="round" />
      {/* Check mark */}
      <circle cx="105" cy="105" r="14" className="fill-indigo-500" />
      <path d="M98 105 L103 110 L112 101" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Floating dots */}
      <circle cx="35" cy="50" r="3" className="fill-indigo-200 dark:fill-indigo-700">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="125" cy="45" r="2" className="fill-indigo-200 dark:fill-indigo-700">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="130" cy="115" r="2.5" className="fill-violet-200 dark:fill-violet-700">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function IllustrationSuccess({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-emerald-50 dark:fill-emerald-950/20" />
      {/* Shield */}
      <path d="M80 40 L110 55 L110 85 C110 105 95 120 80 125 C65 120 50 105 50 85 L50 55 Z" className="fill-emerald-100 dark:fill-emerald-900/30 stroke-emerald-300 dark:stroke-emerald-700" strokeWidth="2" />
      {/* Inner checkmark */}
      <path d="M66 80 L76 90 L96 70" className="stroke-emerald-500" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Sparkles */}
      <path d="M120 50 L122 55 L127 57 L122 59 L120 64 L118 59 L113 57 L118 55 Z" className="fill-emerald-300 dark:fill-emerald-600">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </path>
      <path d="M40 70 L41 73 L44 74 L41 75 L40 78 L39 75 L36 74 L39 73 Z" className="fill-emerald-300 dark:fill-emerald-600">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </path>
      <circle cx="45" cy="45" r="2" className="fill-emerald-200 dark:fill-emerald-700" />
      <circle cx="120" cy="110" r="2.5" className="fill-emerald-200 dark:fill-emerald-700" />
    </svg>
  );
}

export function IllustrationGlobe({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-blue-50 dark:fill-blue-950/20" />
      {/* Globe */}
      <circle cx="80" cy="80" r="40" className="stroke-blue-200 dark:stroke-blue-700" strokeWidth="2" fill="none" />
      <ellipse cx="80" cy="80" rx="40" ry="16" className="stroke-blue-200 dark:stroke-blue-700" strokeWidth="1.5" fill="none" />
      <ellipse cx="80" cy="80" rx="16" ry="40" className="stroke-blue-200 dark:stroke-blue-700" strokeWidth="1.5" fill="none" />
      <line x1="80" y1="40" x2="80" y2="120" className="stroke-blue-150 dark:stroke-blue-800" strokeWidth="1" />
      <line x1="40" y1="80" x2="120" y2="80" className="stroke-blue-150 dark:stroke-blue-800" strokeWidth="1" />
      {/* Pin */}
      <circle cx="95" cy="65" r="6" className="fill-blue-500" />
      <circle cx="95" cy="65" r="2.5" className="fill-white" />
      <path d="M95 71 L95 78" className="stroke-blue-500" strokeWidth="2" strokeLinecap="round" />
      {/* Pulse */}
      <circle cx="95" cy="65" r="10" className="stroke-blue-400/40" strokeWidth="1.5" fill="none">
        <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function IllustrationTeam({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-violet-50 dark:fill-violet-950/20" />
      {/* Person 1 (center) */}
      <circle cx="80" cy="62" r="12" className="fill-violet-200 dark:fill-violet-800 stroke-violet-300 dark:stroke-violet-600" strokeWidth="1.5" />
      <path d="M60 100 C60 85 70 78 80 78 C90 78 100 85 100 100" className="fill-violet-200 dark:fill-violet-800 stroke-violet-300 dark:stroke-violet-600" strokeWidth="1.5" />
      {/* Person 2 (left) */}
      <circle cx="50" cy="72" r="9" className="fill-blue-100 dark:fill-blue-900 stroke-blue-200 dark:stroke-blue-700" strokeWidth="1" />
      <path d="M35 102 C35 92 42 87 50 87 C58 87 65 92 65 102" className="fill-blue-100 dark:fill-blue-900 stroke-blue-200 dark:stroke-blue-700" strokeWidth="1" />
      {/* Person 3 (right) */}
      <circle cx="110" cy="72" r="9" className="fill-pink-100 dark:fill-pink-900 stroke-pink-200 dark:stroke-pink-700" strokeWidth="1" />
      <path d="M95 102 C95 92 102 87 110 87 C118 87 125 92 125 102" className="fill-pink-100 dark:fill-pink-900 stroke-pink-200 dark:stroke-pink-700" strokeWidth="1" />
      {/* Connection lines */}
      <line x1="65" y1="75" x2="55" y2="72" className="stroke-violet-200 dark:stroke-violet-700" strokeWidth="1" strokeDasharray="3 2" />
      <line x1="95" y1="75" x2="105" y2="72" className="stroke-violet-200 dark:stroke-violet-700" strokeWidth="1" strokeDasharray="3 2" />
      {/* Plus */}
      <circle cx="130" cy="50" r="10" className="fill-violet-100 dark:fill-violet-900 stroke-violet-300 dark:stroke-violet-600" strokeWidth="1.5" />
      <path d="M126 50 H134 M130 46 V54" className="stroke-violet-400 dark:stroke-violet-500" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IllustrationError({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-red-50 dark:fill-red-950/20" />
      {/* Broken page */}
      <rect x="50" y="40" width="60" height="80" rx="4" className="fill-white dark:fill-neutral-800 stroke-red-200 dark:stroke-red-800" strokeWidth="1.5" />
      {/* Crack */}
      <path d="M80 40 L75 60 L85 70 L75 85 L80 120" className="stroke-red-300 dark:stroke-red-700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* X mark */}
      <circle cx="80" cy="55" r="10" className="fill-red-100 dark:fill-red-900/50" />
      <path d="M75 50 L85 60 M85 50 L75 60" className="stroke-red-400" strokeWidth="2" strokeLinecap="round" />
      {/* Floating elements */}
      <rect x="30" y="60" width="12" height="8" rx="2" className="fill-red-100 dark:fill-red-900/30 stroke-red-200 dark:stroke-red-800" strokeWidth="1">
        <animate attributeName="y" values="60;56;60" dur="2s" repeatCount="indefinite" />
      </rect>
      <rect x="118" y="70" width="10" height="10" rx="2" className="fill-red-100 dark:fill-red-900/30 stroke-red-200 dark:stroke-red-800" strokeWidth="1">
        <animate attributeName="y" values="70;66;70" dur="2.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function IllustrationNotFound({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" className="fill-amber-50 dark:fill-amber-950/20" />
      {/* Magnifying glass */}
      <circle cx="70" cy="72" r="25" className="stroke-amber-300 dark:stroke-amber-700" strokeWidth="3" fill="none" />
      <line x1="88" y1="90" x2="110" y2="112" className="stroke-amber-300 dark:stroke-amber-700" strokeWidth="4" strokeLinecap="round" />
      {/* Question mark inside */}
      <path d="M63 65 C63 58 70 54 77 58 C84 62 80 70 73 70 M73 76 V77" className="stroke-amber-400 dark:stroke-amber-500" strokeWidth="2.5" strokeLinecap="round" />
      {/* Floating dots */}
      <circle cx="40" cy="50" r="3" className="fill-amber-200 dark:fill-amber-800">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="120" cy="45" r="2" className="fill-amber-200 dark:fill-amber-800">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
