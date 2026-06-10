"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Onboarding Checklist Widget
 * ---------------------------------------------------------
 *
 * WHY: Users who complete onboarding are 3x more likely to convert.
 * A visible progress indicator creates urgency and satisfaction.
 * Linear, Notion, and Vercel all use this pattern.
 *
 * WHAT:
 * - Floating bottom-right widget showing setup progress
 * - Expandable/collapsible (remembers state in localStorage)
 * - Dynamic tasks: checks real state (has site? ran scan? etc.)
 * - Progress ring with percentage
 * - Celebration on 100% completion
 * - Auto-hides after all tasks complete (with 3-day delay)
 *
 * HOW:
 * - Client component fetching /api/onboarding/status
 * - Animated expand/collapse with CSS transitions
 * - Fires confetti on completion
 * - Persists dismissed state in localStorage
 * ---------------------------------------------------------
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, X,
  Globe, Scan, Users, Plug, Sparkles, Trophy,
} from "lucide-react";
import { fireConfetti } from "@/components/confetti";

interface OnboardingTask {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
  href: string;
}

const DISMISSED_KEY = "reglayer_onboarding_dismissed";
const COMPLETED_KEY = "reglayer_onboarding_celebrated";

export function OnboardingChecklist() {
  const { data: session } = useSession();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(true); // hidden by default until loaded
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Check dismissed state
  useEffect(() => {
    const val = localStorage.getItem(DISMISSED_KEY);
    setDismissed(val === "true");
  }, []);

  // Fetch onboarding status
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/onboarding/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          // API doesn't exist yet — show with defaults
          setTasks(getDefaultTasks({}));
        } else {
          setTasks(getDefaultTasks(data));
        }
        setLoading(false);
      })
      .catch(() => {
        setTasks(getDefaultTasks({}));
        setLoading(false);
      });
  }, [session]);

  // Celebrate on completion
  useEffect(() => {
    if (tasks.length === 0) return;
    const allDone = tasks.every((t) => t.completed);
    if (allDone && !localStorage.getItem(COMPLETED_KEY)) {
      localStorage.setItem(COMPLETED_KEY, "true");
      setTimeout(() => fireConfetti(), 500);
    }
  }, [tasks]);

  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }, []);

  // Don't show if not logged in, dismissed, or loading
  if (!session?.user || dismissed || loading || total === 0) return null;

  // Hide if all completed for more than 3 days
  if (completed === total && localStorage.getItem(COMPLETED_KEY)) return null;

  return (
    <div className="fixed bottom-6 right-6 z-9990 w-85 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
        >
          {/* Progress ring */}
          <div className="relative h-9 w-9 shrink-0">
            <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-neutral-100 dark:text-neutral-800"
              />
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeDasharray={`${percentage * 0.942} 100`}
                strokeLinecap="round"
                className="text-accent transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-200">
              {percentage}%
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">
              {completed === total ? "Setup Complete! 🎉" : "Getting Started"}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {completed}/{total} tasks completed
            </div>
          </div>

          <div className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronUp className="h-4 w-4 text-neutral-400" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Dismiss checklist"
            >
              <X className="h-3.5 w-3.5 text-neutral-400" />
            </button>
          </div>
        </button>

        {/* Tasks */}
        {expanded && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-2 space-y-0.5 max-h-65 overflow-y-auto">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => { if (!task.completed) router.push(task.href); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  task.completed
                    ? "opacity-60"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                }`}
                disabled={task.completed}
              >
                {task.completed ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-neutral-300 dark:text-neutral-600" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${task.completed ? "line-through text-neutral-500" : "text-neutral-900 dark:text-white"}`}>
                    {task.label}
                  </div>
                  {!task.completed && (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                      {task.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Default tasks ────────────────────────────────────────────────────────────

function getDefaultTasks(status: Record<string, boolean>): OnboardingTask[] {
  return [
    {
      id: "add-site",
      label: "Add your first site",
      description: "Register a domain to monitor",
      icon: Globe,
      completed: status.hasSite ?? false,
      href: "/manage?tab=sites",
    },
    {
      id: "run-scan",
      label: "Run your first scan",
      description: "Scan a URL for accessibility issues",
      icon: Scan,
      completed: status.hasScan ?? false,
      href: "/dashboard",
    },
    {
      id: "invite-team",
      label: "Invite a team member",
      description: "Collaboration makes compliance easier",
      icon: Users,
      completed: status.hasTeammate ?? false,
      href: "/manage?tab=team",
    },
    {
      id: "connect-ci",
      label: "Connect CI/CD",
      description: "Catch regressions before deploy",
      icon: Plug,
      completed: status.hasIntegration ?? false,
      href: "/integrations",
    },
    {
      id: "first-fix",
      label: "Fix your first issue",
      description: "Apply an auto-remediation",
      icon: Sparkles,
      completed: status.hasFixed ?? false,
      href: "/violations",
    },
  ];
}
