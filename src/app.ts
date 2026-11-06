import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { approvalsService } from './services/approvalsService';
import { clientPushService } from './services/clientPushService';

export const app = new Hono();

app.get('/', (c) => c.text('Hello, Hono!'));

app.get('/health', (c) => c.json({ status: 'ok' }));

const authenticatedUserId = (env: unknown): string | undefined => {
    const context = (env as { requestContext?: { authorizer?: {
        jwt?: { claims?: { sub?: string } };
        lambda?: { userId?: string };
    } } } | undefined)?.requestContext;
    return context?.authorizer?.jwt?.claims?.sub || context?.authorizer?.lambda?.userId;
};

// check the approval status
app.get('/v1/approvals/:requestId', async (c) => {
    const userId = authenticatedUserId(c.env);
    if (!userId) return c.json({ error: 'UNAUTHORIZED' }, 401);
    const approval = await approvalsService.getApproval(c.req.param('requestId'));
    if (!approval || approval.userId !== userId) return c.json({ error: 'NOT_FOUND' }, 404);
    return c.json({ requestId: approval.requestId, doorId: approval.doorId,
        status: approval.status === 'PENDING' && approval.expiresAt <= Math.floor(Date.now() / 1000)
        ? 'EXPIRED' : approval.status, expiresAt: approval.expiresAt });
});


// user click the approve/deny button
app.post('/v1/approvals/:requestId/decision', async (c) => {
    const userId = authenticatedUserId(c.env);
    if (!userId) return c.json({ error: 'UNAUTHORIZED' }, 401);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.approved !== 'boolean') return c.json({ error: 'INVALID_DECISION' }, 400);
    try {
        const approval = await approvalsService.decide(c.req.param('requestId'), userId, body.approved);
        return c.json({ requestId: approval.requestId, status: approval.status });
    } catch (error) {
        if (error instanceof Error && (error.message.startsWith('Approval is missing') ||
            error.message.startsWith('Approval was already'))) {
            return c.json({ error: 'APPROVAL_UNAVAILABLE' }, 409);
        }
        throw error;
    }
});

// register a push token for the user
app.post('/v1/push-tokens', async (c) => {
    const userId = authenticatedUserId(c.env);
    if (!userId) return c.json({ error: 'UNAUTHORIZED' }, 401);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.token !== 'string' || !body.token) return c.json({ error: 'INVALID_TOKEN' }, 400);
    // Register the push token for the user
    await clientPushService.registerPushToken(userId, body.token);
    return c.json({ registered: true }, 201);
});

app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404));

app.onError((error, c) => {
    if (error instanceof HTTPException) {
        return error.getResponse();
    }

    console.error(error);
    return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500);
});
