/**
 * RegLayer Config Schema — Terraform-style IaC definitions
 */

export interface RegLayerConfig {
  version: string;
  workspace?: string;
  agents?: AgentConfig[];
  schedules?: ScheduleConfig[];
  knowledge?: KnowledgeConfig[];
}

export interface AgentConfig {
  slug: string;
  name: string;
  prompt: string;
  model?: string;
  temperature?: number;
  tools?: string[];
  permissions?: string[];
  category?: string;
  costLimit?: number;
  public?: boolean;
}

export interface ScheduleConfig {
  name: string;
  agent: string;
  trigger: "cron" | "event";
  cron?: string;
  eventType?: string;
  task: string;
  output?: "log" | "notify" | "webhook" | "approve";
  notifyEmail?: string;
  webhookUrl?: string;
}

export interface KnowledgeConfig {
  title: string;
  source: string; // file path or URL
}
