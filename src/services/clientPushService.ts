import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createDynamoDbDocumentClient } from '../utilities/dynamoDb';
import type { ApprovalRequest } from './approvalsService';

const db = createDynamoDbDocumentClient({ region: process.env.AWS_REGION });
const messaging = () => {
  const appName = 'door-access-approval';
  const existing = getApps().find(app => app.name === appName);
  if (existing) return getMessaging(existing);
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
  const app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }, appName);
  return getMessaging(app);
};
const tableName = () => {
    if (!process.env.APPROVALS_TABLE_NAME) throw new Error('APPROVALS_TABLE_NAME is required');
    return process.env.APPROVALS_TABLE_NAME;
};
const userKey = (userId: string) => `USER#${userId}`;
const connectionKey = (connectionId: string) => `CONNECTION#${connectionId}`;

class ClientPushService {
  async connect(userId: string, connectionId: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + 86400;
    await db.send(new PutCommand({
      TableName: tableName(),
      Item: { pk: connectionKey(connectionId), sk: 'META', userId, ttl },
    }));
    await db.send(new PutCommand({
      TableName: tableName(),
      Item: { pk: userKey(userId), sk: connectionKey(connectionId), foreground: true, ttl },
    }));
  }

  async disconnect(connectionId: string): Promise<void> {
    const identity = await db.send(new GetCommand({
      TableName: tableName(), Key: { pk: connectionKey(connectionId), sk: 'META' },
    }));
    if (!identity.Item?.userId) return;
    await db.send(new DeleteCommand({
      TableName: tableName(), Key: { pk: userKey(identity.Item.userId), sk: connectionKey(connectionId) },
    }));
    await db.send(new DeleteCommand({
      TableName: tableName(), Key: { pk: connectionKey(connectionId), sk: 'META' },
    }));
  }

  async setForeground(connectionId: string, foreground: boolean): Promise<void> {
    const identity = await db.send(new GetCommand({
      TableName: tableName(), Key: { pk: connectionKey(connectionId), sk: 'META' },
    }));
    if (!identity.Item?.userId) throw new Error('Unknown connection');
    await db.send(new UpdateCommand({
      TableName: tableName(),
      Key: { pk: userKey(identity.Item.userId), sk: connectionKey(connectionId) },
      UpdateExpression: 'SET foreground = :foreground',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':foreground': foreground },
    }));
  }

  async registerPushToken(userId: string, token: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await db.send(new PutCommand({
      TableName: tableName(),
      Item: { pk: userKey(userId), sk: `PUSH#${tokenHash}`, token },
    }));
  }

  async deliverApproval(approval: ApprovalRequest): Promise<void> {
    const records = await db.send(new QueryCommand({
      TableName: tableName(), KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': userKey(approval.userId) },
    }));
    const items = records.Items ?? [];
    const message = JSON.stringify({
      type: 'door_approval_requested', requestId: approval.requestId,
      doorId: approval.doorId, expiresAt: approval.expiresAt,
    });
    let sentOnline = false;
    const foregroundConnections = items.filter(item => item.sk?.startsWith('CONNECTION#') && item.foreground);
    if (foregroundConnections.length) {
      const endpoint = process.env.WS_MANAGEMENT_ENDPOINT;
      if (!endpoint) throw new Error('WS_MANAGEMENT_ENDPOINT is required');
      const ws = new ApiGatewayManagementApiClient({ endpoint, region: process.env.AWS_REGION });
      for (const item of foregroundConnections) {
        const connectionId = item.sk.slice('CONNECTION#'.length);
        try {
          await ws.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(message) }));
          sentOnline = true;
        } catch (error) {
          if (error instanceof GoneException) await this.disconnect(connectionId);
          else throw error;
        }
      }
    }
    if (sentOnline) return;

    const pushTokens = items.filter(item => item.sk?.startsWith('PUSH#') && item.token);
    if (!pushTokens.length) throw new Error(`No online connection or push token for user ${approval.userId}`);
    const alert = 'Someone is requesting to open the door. Please approve or deny.';
    const results = await Promise.allSettled(pushTokens.map(async item => {
      try {
        await messaging().send({
          token: item.token,
          notification: { title: 'open door appproval', body: alert },
          data: { requestId: approval.requestId, type: 'door_approval_requested' },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'messaging/registration-token-not-registered') {
          await db.send(new DeleteCommand({
            TableName: tableName(), Key: { pk: userKey(approval.userId), sk: item.sk },
          }));
        }
        throw error;
      }
    }));
    if (results.every(result => result.status === 'rejected')) {
      throw results[0].reason;
    }
  }
}

export const clientPushService = new ClientPushService();
