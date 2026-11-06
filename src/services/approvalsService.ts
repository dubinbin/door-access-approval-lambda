import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MqttService } from './mqttServicet';
import { clientPushService } from './clientPushService';
import { createDynamoDbDocumentClient } from '../utilities/dynamoDb';
import { format } from "date-fns";

const db = createDynamoDbDocumentClient({ region: process.env.AWS_REGION });
const tableName = () => {
    if (!process.env.APPROVALS_TABLE_NAME) throw new Error('APPROVALS_TABLE_NAME is required');
    return process.env.APPROVALS_TABLE_NAME;
};

export type ApprovalRequest = {
    requestId: string;
    userId: string;
    doorId: string;
    siteCode: string;
    payload?: string;
    status: 'PENDING' | 'APPROVED' | 'DENIED';
    expiresAt: number;
};

class ApprovalsService {
  async sendApprovalApplicationToUser(siteCode: string, doorId: string, data: unknown): Promise<ApprovalRequest> {
    if (!data || typeof data !== 'object') throw new Error('Door request data is required');
    const { userId, requestId } = data as Record<string, unknown>;
    if (typeof userId !== 'string' || !userId ||
        typeof requestId !== 'string' || !requestId || !doorId) {
      throw new Error('Door request requires doorId, userId, and requestId');
    }

    const timeout = Number(process.env.APPROVAL_TIMEOUT_SECONDS ?? 60);
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('APPROVAL_TIMEOUT_SECONDS must be a positive integer');
    const expiresAt = Math.floor(Date.now() / 1000) + timeout;
    const approval: ApprovalRequest = { requestId, userId, doorId, siteCode, status: 'PENDING', expiresAt, payload: JSON.stringify(data) };
    try {
      await db.send(new PutCommand({
        TableName: tableName(),
        Item: {
            pk: `APPROVAL#${requestId}`, 
            sk: 'META', 
            ...approval,
            ttl: expiresAt + 86400,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await this.getApproval(requestId);
      if (!existing || existing.doorId !== doorId || existing.userId !== userId) {
        throw new Error('Conflicting approval request ID');
      }
      if (existing.status === 'PENDING' && existing.expiresAt > Math.floor(Date.now() / 1000)) {
        await clientPushService.deliverApproval(existing);
      }
      return existing;
    }

    await clientPushService.deliverApproval(approval);
    return approval;
  }

  async getApproval(requestId: string): Promise<ApprovalRequest | undefined> {
    const result = await db.send(new GetCommand({
      TableName: tableName(), Key: { pk: `APPROVAL#${requestId}`, sk: 'META' },
    }));
    return result.Item as ApprovalRequest | undefined;
  }

  async decide(requestId: string, userId: string, approved: boolean): Promise<ApprovalRequest> {
    const now = Math.floor(Date.now() / 1000);
    let approval: ApprovalRequest;
    try {
      const result = await db.send(new UpdateCommand({
        TableName: tableName(),
        Key: { pk: `APPROVAL#${requestId}`, sk: 'META' },
        UpdateExpression: 'SET #status = :decision',
        ConditionExpression: 'userId = :userId AND #status = :pending AND expiresAt > :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':userId': userId,':pending': 'PENDING',':decision': approved ? 'APPROVED' : 'DENIED', ':now': now },
        ReturnValues: 'ALL_NEW',
      }));
      approval = result.Attributes as ApprovalRequest;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await this.getApproval(requestId);
      if (!existing || existing.userId !== userId || existing.expiresAt <= now || existing.status === 'PENDING') {
        throw new Error('Approval is missing, expired, or belongs to another user');
      }
      if ((existing.status === 'APPROVED') !== approved) throw new Error('Approval was already decided differently');
      approval = existing;
    }
    
    // A repeated identical decision can retry publishing if the previous publish failed.
    await this.sendApprovalResultToRobot(approval, approved);
    return approval;
  }

  // Send the approval result to the robot via MQTT
  async sendApprovalResultToRobot(approval: ApprovalRequest, approved: boolean): Promise<void> {
    try {
        // <SITE_CODE>/+/door/+/status
        const { payload } = approval;
        const payloadJSON = payload ? JSON.parse(payload) : {};
        
        const topicPrefix = payloadJSON?.topic?.split('/').splice(0, 4).join('/');

        const sendStatusTopic = `${topicPrefix}/status`;

        const message = {
            "timestamp": format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
            "topic": sendStatusTopic,
            "data": {
                "status": "opened"
            }
        }
        await MqttService.publish(sendStatusTopic, JSON.stringify(message), 1, false);
    
    } catch (error) {
        console.error(`Failed to parse payload for approval request ${approval.requestId}:`, error);
    }
  }
}

export const approvalsService = new ApprovalsService();
