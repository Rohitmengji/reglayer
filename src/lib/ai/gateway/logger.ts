/**
 * RegLayer — AI Gateway: Console Logger
 *
 * WHY:  During development, you need to SEE what the gateway is doing — which
 *       model was called, how many tokens, what it cost, how long it took.
 *       This handler logs every completion to the console in a structured format.
 *
 * PRODUCTION EVOLUTION:
 *   In production, this becomes a database write (for the cost dashboard),
 *   a Sentry breadcrumb, or a webhook to your observability stack.
 *   The gateway doesn't change — you just register a different handler.
 *
 *   This is the Open/Closed Principle: the gateway is open for extension
 *   (new handlers) but closed for modification (the core never changes).
 */

import type { GatewayEvent, GatewayEventHandler } from "./types";

/**
 * Logs AI gateway events to the console in a structured, readable format.
 * Register this with `onGatewayEvent(consoleLogger)` at app startup.
 */
export const consoleLogger: GatewayEventHandler = (
  event: GatewayEvent,
): void => {
  const { request, response } = event;
  const status = response.success ? "OK" : "FAIL";
  const costStr = response.cost.totalCost > 0
    ? `$${response.cost.totalCost.toFixed(6)}`
    : "$0";

  console.log(
    `[ai-gateway] ${status} | ${request.feature} | ${response.provider}/${response.model} | ` +
      `${response.usage.inputTokens}in + ${response.usage.outputTokens}out = ${response.usage.totalTokens}tok | ` +
      `${costStr} | ${response.latencyMs}ms` +
      (response.error ? ` | error: ${response.error}` : ""),
  );
};
