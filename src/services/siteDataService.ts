import { QueryCommand, ScanCommand, type QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import { awsConfig } from "../utilities/runtime.js";
import { createDynamoDbDocumentClient } from "../utilities/dynamoDb";

// Keep the SDK item shape until the upstream topology schema is defined.
type SiteEntity = NonNullable<QueryCommandOutput['Items']>[number];
type SiteCache = Record<string, { ts: number; data: SiteEntity[] } | undefined>;


//  DynamoDB client
const dynamoDBClient = createDynamoDbDocumentClient({
    ...awsConfig(
        process.env.IOT_ADMIN_AWS_REGION || "us-east-1",
    ),
    assumeCrossAccount: true,
    roleArn: process.env.IOT_ADMIN_CROSS_ACCOUNT_ROLE_ARN || process.env.CROSS_ACCOUNT_ROLE_ARN,
});


// to check the site data match the doorid or site
// actaulity it's look like defense excessively....because the upstream mqtt sent the message had checked the doorid and sitecode,
let SiteDataService = {
    siteData: [] as SiteEntity[],
    lastScanTime: 0,
    _cache: {} as SiteCache,
    _cacheTtlSeconds: parseInt(process.env.SITE_DATA_CACHE_TTL_SECONDS || '60', 10),
    getAllData: async () => {
        try {
            //  Return cached data: 5 minutes TTL
            let now = new Date().getTime();
            if (now - SiteDataService.lastScanTime < 5 * 60 * 1000 && SiteDataService.siteData.length > 0) {
                return SiteDataService.siteData;
            }
            const scanResult = await dynamoDBClient.send(
                new ScanCommand({
                    TableName: "BuildingTopology",
                    ExpressionAttributeNames: {
                        "#class": "class",
                    },
                    ProjectionExpression:
                    "parentEntityId, entityId, code, #class, fullName, config, mqttPrefix, siteCode",
            }));
            SiteDataService.siteData = scanResult.Items ?? [];
        } catch (e) {
            console.error(e);
        }
        return SiteDataService.siteData;
    },
    getSiteData: async (siteCode: string) => {
        try {
            const now = Date.now();
            const cacheEntry = SiteDataService._cache[siteCode];
            if (cacheEntry && (now - cacheEntry.ts) < SiteDataService._cacheTtlSeconds * 1000) {
                console.info && console.info(`SiteDataService.getSiteData: returned from cache for site=${siteCode} (age=${Math.round((now - cacheEntry.ts)/1000)}s)`);
                return cacheEntry.data;
            }
            console.info && console.info(`SiteDataService.getSiteData: querying source for site=${siteCode}`);
            const queryResult = await dynamoDBClient.send(
                new QueryCommand({
                    TableName: "BuildingTopology",
                    IndexName: "siteCode-class-index",
                    KeyConditionExpression: "siteCode = :siteCode",
                    ExpressionAttributeNames: {
                        "#class": "class",
                    },
                    ExpressionAttributeValues: {
                        ":siteCode": siteCode,
                    },
                    ProjectionExpression: "parentEntityId, entityId, code, #class, fullName, config, mqttPrefix, siteCode",
                }),
            );
            const items = queryResult.Items || [];
            SiteDataService._cache[siteCode] = { ts: Date.now(), data: items };
            return items;
        } catch (e) {
            console.error(e);
            return [];
        }
    },
    getBuildingData: async (siteCode: string) => {
        let siteData = await SiteDataService.getSiteData(siteCode);
        return siteData.filter((entity) => entity.class === "building");
    },
    getLiftData: async (siteCode: string) => {
        let siteData = await SiteDataService.getSiteData(siteCode);
        return siteData.filter((entity) => entity.class === "lift");
    },
    findLiftData: async (mqttPrefix: string) => {
        let siteCode = mqttPrefix.split("/")[0];
        let liftData = await SiteDataService.getLiftData(siteCode);
        let requestLift = liftData.find(
            (entity) => entity.mqttPrefix === mqttPrefix
        );
        return requestLift
            ? {
                code: requestLift.code,
                mqttPrefix: requestLift.mqttPrefix,
                floorMap: requestLift.config.floorMap,
                fullName: requestLift.fullName,
                class: requestLift.class,
            }
            : {};
    },
    getLiftFloorMap: async (mqttPrefix: string) => {
        let siteCode = mqttPrefix.split("/")[0];
        let liftData = await SiteDataService.getLiftData(siteCode);
        let requestLift = liftData.find(
            (entity) => entity.mqttPrefix === mqttPrefix
        );
        return requestLift && requestLift.config ? requestLift.config.floorMap : {};
    },
    getEntityByCode: async (doorId: string) => {
        let targetEntity: SiteEntity | undefined;
        try {
            const queryResult = await dynamoDBClient.send(
                new QueryCommand({
                    TableName: "BuildingTopology",
                    IndexName: "code-index",
                    KeyConditionExpression: "code = :door_id",
                    ExpressionAttributeNames: {
                        "#class": "class",
                    },
                    ExpressionAttributeValues: {
                        ":door_id": doorId,
                    },
                    ProjectionExpression: "parentEntityId, entityId, code, #class, fullName, config, mqttPrefix, siteCode",
                })
            );
            targetEntity = queryResult.Items?.[0];
        } catch (e) {
            console.error(e);
        }
        return targetEntity;
    },
    getEntityByMqttPrefix: async (mqttPrefix: string) => {
        let targetEntity: SiteEntity | undefined;
        try {
            const queryResult = await dynamoDBClient.send(
                new QueryCommand({
                    TableName: "BuildingTopology",
                    IndexName: "mqttPrefix-index",
                    KeyConditionExpression: "mqttPrefix = :mqtt_prefix",
                    ExpressionAttributeNames: {
                        "#class": "class",
                    },
                    ExpressionAttributeValues: {
                        ":mqtt_prefix": mqttPrefix,
                    },
                    ProjectionExpression: "parentEntityId, entityId, code, #class, fullName, config, mqttPrefix, siteCode",
                })
            );
            targetEntity = queryResult.Items?.[0];
        } catch (e) {
            console.error(e);
        }
        return targetEntity;
    },
};

export { SiteDataService };
