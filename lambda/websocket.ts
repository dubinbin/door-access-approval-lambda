import { clientPushService } from '../src/services/clientPushService';

type WebSocketEvent = {
  requestContext?: {
    routeKey?: string;
    connectionId?: string;
    authorizer?: { userId?: string };
  };
  body?: string | null;
};

export const handler = async (event: WebSocketEvent) => {
  const { routeKey, connectionId, authorizer } = event.requestContext ?? {};
  if (!connectionId) return { statusCode: 400, body: 'Missing connection ID' };
  if (routeKey === '$connect') {
    const userId = authorizer?.userId;
    if (!userId) return { statusCode: 401, body: 'Unauthorized' };
    await clientPushService.connect(userId, connectionId);
  } else if (routeKey === '$disconnect') {
    await clientPushService.disconnect(connectionId);
  } else {
    let message: unknown;
    try { message = JSON.parse(event.body ?? ''); } catch { return { statusCode: 400, body: 'Invalid message' }; }
    if (!message || typeof message !== 'object' ||
        !('type' in message) || message.type !== 'presence' ||
        !('foreground' in message) || typeof message.foreground !== 'boolean') {
      return { statusCode: 400, body: 'Invalid message' };
    }
    await clientPushService.setForeground(connectionId, message.foreground);
  }
  return { statusCode: 200, body: 'OK' };
};
