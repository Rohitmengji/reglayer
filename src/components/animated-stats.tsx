"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Scan, Clock, Activity, Shield } from "lucide-react";

interface Stat {
  value: string;
  label: string;
  icon?: string;
}

const iconMap: Record<string, typeof Globe> = {
  scan: Scan,
  globe: Globe,
  uptime: Activity,
  speed: Clock,
  shield: Shield,
  clock: Activity,
};

function useCountUp(end: number, duration: number, start: boolean, decimals: number = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    let raf: number;

    function animate(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = eased * end;
      setCount(decimals > 0 ? parseFloat(val.toFixed(decimals)) : Math.round(val));
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    }

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, start, decimals]);

  return count;
}

function AnimatedStat({ value, label, icon, inView }: Stat & { inView: boolean }) {
  const numericMatch = value.match(/[\d.]+/);
  const numericValue = numericMatch ? parseFloat(numericMatch[0]) : 0;
  const prefix = value.slice(0, value.indexOf(numericMatch?.[0] || ""));
  const suffix = value.slice((numericMatch?.index || 0) + (numericMatch?.[0].length || 0));
  const hasDecimal = numericMatch?.[0].includes(".") ?? false;
  const decimalPlaces = hasDecimal ? (numericMatch![0].split(".")[1]?.length || 1) : 0;

  const count = useCountUp(numericValue, 2000, inView, decimalPlaces);

  const displayValue = inView
    ? `${prefix}${hasDecimal ? count.toFixed(decimalPlaces) : count}${suffix}`
    : `${prefix}0${suffix}`;

  const Icon = icon ? iconMap[icon] : null;

  return (
    <div className="relative group text-center p-5 sm:p-6 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-200 dark:hover:border-neutral-700 hover:shadow-md transition-all duration-300 h-full flex flex-col items-center justify-center min-h-35">
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-900 dark:group-hover:bg-white transition-colors duration-300">
          <Icon className="h-4.5 w-4.5 text-neutral-600 dark:text-neutral-400 group-hover:text-white dark:group-hover:text-neutral-900 transition-colors duration-300" />
        </div>
      )}
      <p className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tabular-nums tracking-tight whitespace-nowrap">
        {displayValue}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 font-medium leading-tight">{label}</p>
    </div>
  );
}

export function AnimatedStats({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`transition-all duration-700 ease-out ${i >= 4 ? "col-span-1 sm:block" : ""}`}
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0) scale(1)" : "translateY(24px) scale(0.95)",
            transitionDelay: `${i * 120}ms`,
          }}
        >
          <AnimatedStat {...stat} inView={inView} />
        </div>
      ))}
    </div>
  );
}
