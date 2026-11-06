import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

const ASSUME_ROLE_REFRESH_WINDOW_MS = 60 * 1000;
const assumeCrossAccountCredentials = async (region: string, roleArn: string) => {
  if (!roleArn) {
    throw new Error("Missing role ARN for cross-account assume-role");
  }

  const stsClient = new STSClient({ region });
  const response = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "mqtt-middleware-cross-account",
      DurationSeconds: 900,
    }),
  );

  const credentials = response.Credentials;
  if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey || !credentials?.SessionToken) {
    throw new Error("Unable to assume the cross-account role");
  }

  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiration: credentials.Expiration ? new Date(credentials.Expiration) : undefined,
  };
};

export const createAssumeRoleCredentialsProvider = (region: string, roleArn: string) => {
  let cachedCredentials: any = null;
  let refreshingPromise: Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: Date | undefined; }> | null = null;

  const isRefreshRequired = () => {
    if (!cachedCredentials) {
      return true;
    }

    if (!cachedCredentials.expiration) {
      return false;
    }

    const refreshAt = cachedCredentials.expiration.getTime() - ASSUME_ROLE_REFRESH_WINDOW_MS;
    return Date.now() >= refreshAt;
  };

  return async () => {
    if (!isRefreshRequired()) {
      return cachedCredentials;
    }

    if (!refreshingPromise) {
      refreshingPromise = assumeCrossAccountCredentials(region, roleArn)
        .then((nextCredentials) => {
          cachedCredentials = nextCredentials;
          return cachedCredentials;
        })
        .finally(() => {
          refreshingPromise = null;
        });
    }

    return refreshingPromise;
  };
};