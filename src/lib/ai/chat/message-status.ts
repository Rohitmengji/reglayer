export const CHAT_RESPONSE_STATUSES = [
  "sending",
  "queued",
  "generating",
  "streaming",
  "completed",
  "failed",
  "cancelled",
  "retrying",
  "interrupted",
] as const;

export type ChatResponseStatus = (typeof CHAT_RESPONSE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ChatResponseStatus, readonly ChatResponseStatus[]> = {
  // `interrupted` is reachable from `sending` because a connection can stall BEFORE the
  // response headers arrive. Omitting it left a watchdog-aborted run stuck in `sending`
  // forever: a permanent spinner that Retry refuses to act on, since `sending` is not a
  // recoverable status.
  sending: ["queued", "generating", "failed", "cancelled", "interrupted"],
  queued: ["generating", "cancelled", "failed"],
  generating: ["streaming", "completed", "retrying", "failed", "cancelled", "interrupted"],
  streaming: ["completed", "retrying", "failed", "cancelled", "interrupted"],
  completed: [],
  failed: ["retrying"],
  cancelled: [],
  retrying: ["generating", "failed", "cancelled"],
  interrupted: ["streaming", "retrying", "failed", "cancelled"],
};

export function canTransitionChatResponse(
  from: ChatResponseStatus,
  to: ChatResponseStatus,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}