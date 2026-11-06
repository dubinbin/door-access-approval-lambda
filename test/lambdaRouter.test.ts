import { handleIotRuleEvent } from '../src/lambdaRouter';
import { RobotToDoorMiddleware } from '../src/subscribers/robotToDoorMiddleware';

jest.mock('../src/subscribers/robotToDoorMiddleware', () => ({
  RobotToDoorMiddleware: { name: 'RobotToDoorMiddleware', onMessage: jest.fn() },
}));

const onMessage = jest.mocked(RobotToDoorMiddleware.onMessage);
const originalTopic = process.env.MQTT_CONTROL_TOPIC;

beforeEach(() => {
  delete process.env.MQTT_CONTROL_TOPIC;
  onMessage.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalTopic === undefined) delete process.env.MQTT_CONTROL_TOPIC;
  else process.env.MQTT_CONTROL_TOPIC = originalTopic;
});

test('routes the configured topic and preserves upstream fields without the routing metadata', async () => {
  const topic = 'site/building/door/door-1/control';
  const message = { requestId: 'r1', nested: { status: false }, text: '审批请求' };
  await expect(handleIotRuleEvent({ topic, ...message }))
    .resolves.toEqual({ topic, middlewareCount: 1 });
  expect(onMessage).toHaveBeenCalledTimes(1);
  const [receivedTopic, payload] = onMessage.mock.calls[0];
  expect(receivedTopic).toBe(topic);
  expect(Buffer.isBuffer(payload)).toBe(true);
  expect(JSON.parse(payload.toString('utf8'))).toEqual(message);
});

test('ignores other topics, including topics with the same suffix', async () => {
  await expect(handleIotRuleEvent({ topic: 'other/control', example: true }))
    .resolves.toEqual({ topic: 'other/control', middlewareCount: 0 });
  expect(onMessage).not.toHaveBeenCalled();
});

test('uses the configured topic instead of the default topic', async () => {
  process.env.MQTT_CONTROL_TOPIC = 'site/door/control';
  await handleIotRuleEvent({ topic: 'site/building/door/door-1/control' });
  await handleIotRuleEvent({ topic: 'site/door/control' });
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onMessage).toHaveBeenCalledWith('site/door/control', expect.any(Buffer));
});

test.each([null, undefined, [], 'invalid', {}, { topic: '' }, { topic: ' ' }, { topic: 123 }])(
  'rejects an invalid IoT event: %p', async (event) => {
    await expect(handleIotRuleEvent(event)).rejects.toThrow('non-empty topic');
    expect(onMessage).not.toHaveBeenCalled();
  },
);

test('propagates subscriber failures so Lambda can retry the event', async () => {
  const error = new Error('temporary processing failure');
  onMessage.mockRejectedValueOnce(error);
  await expect(handleIotRuleEvent({ topic: 'site/building/door/door-1/control' })).rejects.toBe(error);
});
