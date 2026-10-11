import type { IncomingMessage, ServerResponse } from 'node:http'
export function handleAnalyticsRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean>
