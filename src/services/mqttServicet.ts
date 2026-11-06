import {
    IoTDataPlaneClient,
    PublishCommand,
    GetRetainedMessageCommand,
    paginateListRetainedMessages,
} from "@aws-sdk/client-iot-data-plane";
import { createAssumeRoleCredentialsProvider } from "../utilities/assumeRole";
import { awsConfig } from "../utilities/runtime";

const defaultIotConfig = awsConfig(process.env.AWS_REGION  || '');

const robotIotClient = new IoTDataPlaneClient({
    region: process.env.ROBOT_AWS_REGION || process.env.AWS_REGION,
    credentials: createAssumeRoleCredentialsProvider(
        process.env.ROBOT_AWS_REGION || process.env.AWS_REGION || '',
        process.env.ROBOT_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN || '',
    ),
});

const MqttService = {
    publish: async (topic: string, message: string, qos: number, retain: boolean, config?: unknown) => {
        const client = new IoTDataPlaneClient(config || defaultIotConfig);
        const command = new PublishCommand({
            topic: topic,
            payload: message,
            retain: retain,
            qos: qos,
        });
        return await client.send(command);
    },
    publishToRobotAccount: async (topic: string, message: string, qos: number, retain: boolean) => {
        const command = new PublishCommand({
            topic: topic,
            payload: message,
            retain: retain,
            qos: qos,
        });
        return await robotIotClient.send(command);
    },
    getRetainedMessage: async (topic: string, config?: unknown) => {
        const client = new IoTDataPlaneClient(config || defaultIotConfig);
        const command = new GetRetainedMessageCommand({ topic: topic });
        return await client.send(command);
    },
    listRetainedMessages: async (config?: unknown) => {
        const client = new IoTDataPlaneClient(config || defaultIotConfig);
        const paginator = paginateListRetainedMessages({ client, pageSize: 100 }, {});
        const retainedTopics = [];
        for await (const page of paginator) {
            retainedTopics.push(...(page.retainedTopics || []));
        }
        return { retainedTopics };
    }
};

export { MqttService };
