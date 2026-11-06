import { RobotToDoorMiddleware } from './subscribers/robotToDoorMiddleware';

type Subscriber = {
  name: string;
  onMessage(topic: string, payload: Buffer): Promise<void>;
};

const getMiddlewareList = (topic: string): Subscriber[] => {
  const controlTopic = process.env.MQTT_CONTROL_TOPIC || '+/+/door/+/control';
  const pattern = controlTopic.split('/');
  const parts = topic.split('/');
  const matches = pattern.length === parts.length &&
    pattern.every((part, index) => part === '+' || part === parts[index]);
  return matches ? [RobotToDoorMiddleware] : [];
};
export const handleIotRuleEvent = async (event: unknown) => {
  if (
    typeof event !== 'object' || event === null || Array.isArray(event) ||
    !('topic' in event) || typeof event.topic !== 'string' || event.topic.trim() === ''
  ) {
    throw new Error('IoT Rule event must include a non-empty topic field');
  }

  const { topic, ...message } = event;
  const middlewareList = getMiddlewareList(topic);
  const payload = Buffer.from(JSON.stringify(message), 'utf8');

  console.info('Received IoT Rule message', {
    topic,
    payloadBytes: payload.length,
    middleware: middlewareList.map((middleware) => middleware.name),
  });

  if (middlewareList.length === 0) {
    console.info(`No middleware configured for IoT topic=${topic}`);
    return { topic, middlewareCount: 0 };
  }

  await Promise.all(middlewareList.map((middleware) => middleware.onMessage(topic, payload)));
  return { topic, middlewareCount: middlewareList.length };
};
