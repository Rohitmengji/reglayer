/**
 * RegLayer — Class Name Utility
 *
 * WHY: Tailwind classes can conflict (e.g., both px-4 and px-6). Need intelligent merging.
 * WHAT: Combines clsx (conditional classes) + tailwind-merge (conflict resolution).
 * HOW: cn("px-4", condition && "px-6") → only keeps the last conflicting class. Used by all UI components.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
