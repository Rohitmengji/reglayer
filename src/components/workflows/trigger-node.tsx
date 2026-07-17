"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, Send } from "lucide-react";

const ICONS: Record<string, typeof Clock> = {
  schedule: Clock,
  webhook: Send,
};

interface TriggerData { label: string; subtype: string; config: Record<string, unknown>; [key: string]: unknown; }

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as TriggerData;
  const Icon = ICONS[nodeData.subtype] ?? Clock;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-neutral-900 min-w-[160px] shadow-sm transition-all ${
        selected
          ? "border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-800"
          : "border-emerald-300 dark:border-emerald-700"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-medium">
            Trigger
          </p>
          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
            {String(nodeData.label)}
          </p>
        </div>
      </div>
      {!!nodeData.config?.cron && (
        <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
          {String(nodeData.config.cron)}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white dark:!border-neutral-900" />
    </div>
  );
}
