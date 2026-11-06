import { approvalsService } from "../services/approvalsService";
import { requestSearchWindowMinutes, requestTimeoutSeconds } from "../utilities/constants";
import { createMiddlewareLogger } from "../utilities/middlewareLogger";
import { awsConfig } from "../utilities/runtime";

//  Logger
const logger = createMiddlewareLogger({
    name: 'pudu-door-middleware-stream',
    logGroupName: 'pudu-door-middleware',
});

let RobotToDoorMiddleware = {
    name: 'RobotToDoorMiddleware',
    topicList: [
        `${process.env.SITE_CODE}/+/door/+/control`,
    ],
        //  MQTT Config
    MQTT_PROTOCOL_VERSION: "2.1.26.20230210",
    siteIotConfig: awsConfig(process.env.SITE_AWS_REGION || ''),
    REQUEST_SEARCH_WINDOW_MINUTES: requestSearchWindowMinutes,
    REQUEST_TIMEOUT_SECONDS: requestTimeoutSeconds,
    REQUEST_DUPLICATE_CHECK_MINUTES: process.env.DOOR_REQUEST_DUPLICATE_CHECK_MINUTES,

    onMessage: async (topic: string, payload: Buffer) => {
        try {
            const [siteCode, buildingCode, type, doorId, ___] = topic.split('/');
            const payloadJSON = JSON.parse(payload.toString());

            if (payloadJSON.data?.action === "open") {
                logger.info(`From Door Update: doorId=${doorId}; siteCode=${siteCode}; topic=${topic}; action=open; `);
                await approvalsService.sendApprovalApplicationToUser(siteCode, doorId, payloadJSON);
            }
        } catch (error) {
            logger.error(`Error processing message on topic: ${topic}`, error);
            throw error;
        }
    }
}

export { RobotToDoorMiddleware }
