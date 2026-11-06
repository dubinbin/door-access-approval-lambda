import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import {
  DynamoDBDocumentClient,
  type DynamoDBDocumentClientResolvedConfig,
  type ServiceInputTypes,
  type ServiceOutputTypes,
} from "@aws-sdk/lib-dynamodb";
import type { Command } from "@smithy/types";
import { createAssumeRoleCredentialsProvider } from "./assumeRole";

interface IConfigType {
  region?: string;
  assumeCrossAccount?: boolean;
  roleArn?: string;
  [key: string]: any;

}

export const createDynamoDbDocumentClient = (config: IConfigType) => {
  let documentClient: DynamoDBDocumentClient | null = null;
  let initializationPromise: Promise<DynamoDBDocumentClient> | null = null;
  const { assumeCrossAccount, roleArn, ...awsClientConfig } = config;
  const shouldAssumeCrossAccount = Boolean(assumeCrossAccount);
  const resolvedRoleArn = roleArn || process.env.ROBOT_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN || '';
  const initializeClient = async () => {
    if (documentClient) {
      return documentClient;
    }

    if (!initializationPromise) {
      initializationPromise = (async () => {
        const clientConfig = {
          ...awsClientConfig,
          region:
            awsClientConfig.region ||
            process.env.AWS_REGION ||
            process.env.IOT_ADMIN_AWS_REGION ||
            "us-east-1",
        };

        if (shouldAssumeCrossAccount) {
          const credentials = createAssumeRoleCredentialsProvider(
            clientConfig.region,
            resolvedRoleArn,
          );
          documentClient = DynamoDBDocumentClient.from(
            new DynamoDBClient({ ...clientConfig, credentials }),
          );
        } else {
          documentClient = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
        }

        return documentClient;
      })();
    }

    return initializationPromise;
  };

  return {
    // Preserve the relationship between each SDK command and its output type.
    send: async <Input extends ServiceInputTypes, Output extends ServiceOutputTypes>(
      command: Command<ServiceInputTypes, Input, ServiceOutputTypes, Output, DynamoDBDocumentClientResolvedConfig>,
    ): Promise<Output> => {
      const activeClient = await initializeClient();
      return activeClient.send(command);
    },
  };
};

export const createRobotDynamoDbDocumentClient = (config: IConfigType) => {
  return createDynamoDbDocumentClient({
    ...config,
    assumeCrossAccount: true,
    roleArn: config.roleArn || process.env.ROBOT_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN,
  });
};

export const createApiGatewayManagementApiClient = (config: IConfigType = {
  assumeCrossAccount: false
}) => {
  const { assumeCrossAccount, roleArn, apiGatewayEndpoint, ...awsClientConfig } = config;
  const shouldAssumeCrossAccount = Boolean(assumeCrossAccount);
  const resolvedRoleArn = roleArn || process.env.ROBOT_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN || '';
  const clientConfig = {
    ...awsClientConfig,
    region:
      awsClientConfig.region ||
      process.env.AWS_REGION ||
    process.env.IOT_ADMIN_AWS_REGION ||
      "us-east-1",
  };

  if (shouldAssumeCrossAccount) {
    const credentials = createAssumeRoleCredentialsProvider(
      clientConfig.region,
      resolvedRoleArn,
    );

    return new ApiGatewayManagementApiClient({
      ...clientConfig,
      credentials,
    });
  }

  return new ApiGatewayManagementApiClient(clientConfig);
};

export const createRobotApiGatewayManagementApiClient = (config: IConfigType) => {
  return createApiGatewayManagementApiClient({
    ...config,
    assumeCrossAccount: true,
    roleArn: config.roleArn || process.env.ROBOT_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN,
  });
};
