"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Scan, Brain, FileText, Bell, Shield } from "lucide-react";

const ICONS: Record<string, typeof Scan> = {
  scan: Scan,
  analyze: Brain,
  report: FileText,
  notify: Bell,
  guard: Shield,
};

interface ActionData { label: string; subtype: string; config: Record<string, unknown>; [key: string]: unknown; }

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as ActionData;
  const Icon = ICONS[nodeData.subtype] ?? Scan;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-neutral-900 min-w-[160px] shadow-sm transition-all ${
        selected
          ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
          : "border-blue-300 dark:border-blue-700"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white dark:!border-neutral-900" />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium">
            Action
          </p>
          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
            {String(nodeData.label)}
          </p>
        </div>
      </div>
      {!!nodeData.config?.url && (
        <p className="text-[10px] text-muted-foreground mt-1.5 truncate max-w-[140px]">
          {String(nodeData.config.url)}
        </p>
      )}
      {!!nodeData.config?.channel && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          via {String(nodeData.config.channel)}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white dark:!border-neutral-900" />
    </div>
  );
}
