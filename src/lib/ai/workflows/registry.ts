/**
 * RegLayer — Workflow Registry
 *
 * Central lookup for all workflow definitions.
 * When adding a new workflow, register it here.
 */

import type { WorkflowDefinition, WorkflowId } from "./types";
import { complianceAuditWorkflow } from "./compliance-audit";

const WORKFLOWS: WorkflowDefinition[] = [
  complianceAuditWorkflow,
];

const workflowMap = new Map<WorkflowId, WorkflowDefinition>(
  WORKFLOWS.map((w) => [w.id, w]),
);

export function getWorkflow(id: WorkflowId): WorkflowDefinition {
  const workflow = workflowMap.get(id);
  if (!workflow) throw new Error(`Unknown workflow: "${id}"`);
  return workflow;
}

export function getAllWorkflows(): WorkflowDefinition[] {
  return WORKFLOWS;
}
