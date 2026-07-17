"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Filter, GitBranch } from "lucide-react";

const ICONS: Record<string, typeof Filter> = {
  "score-check": Filter,
  branch: GitBranch,
};

interface ConditionData { label: string; subtype: string; config: Record<string, unknown>; [key: string]: unknown; }

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as ConditionData;
  const Icon = ICONS[nodeData.subtype] ?? Filter;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-neutral-900 min-w-[180px] shadow-sm transition-all ${
        selected
          ? "border-rose-500 ring-2 ring-rose-200 dark:ring-rose-800"
          : "border-rose-300 dark:border-rose-700"
      }`}
    >
      <Handle type="target" position={Position.Top} className="bg-rose-500! w-3! h-3! border-2! border-white! dark:border-neutral-900!" />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-rose-600 dark:text-rose-400 font-medium">
            Condition
          </p>
          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
            {String(nodeData.label)}
          </p>
        </div>
      </div>
      {nodeData.config?.threshold != null && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Score &ge; {String(nodeData.config.threshold)}
        </p>
      )}
      {/* Two output handles: Yes / No */}
      <div className="flex justify-between mt-2 text-[9px] font-medium">
        <span className="text-green-600 dark:text-green-400">Yes</span>
        <span className="text-red-600 dark:text-red-400">No</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-white dark:border-neutral-900!"
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!bg-red-500 !w-3 !h-3 !border-2 !border-white dark:!border-neutral-900"
        style={{ left: "70%" }}
      />
    </div>
  );
}
