import { RobotToDoorMiddleware } from '../src/subscribers/robotToDoorMiddleware';
import { approvalsService } from '../src/services/approvalsService';

jest.mock('../src/services/approvalsService', () => ({
  approvalsService: {
    sendApprovalApplicationToUser: jest.fn(),
    sendApprovalResultToRobot: jest.fn(),
  },
}));
jest.mock('../src/utilities/middlewareLogger', () => ({
  createMiddlewareLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

test('creates a pending approval without opening the door', async () => {
  const data = { action: 'open', requestId: 'r1', userId: 'u1', mac: 'robot-1' };
  await RobotToDoorMiddleware.onMessage('site/building/door/door-1/control', Buffer.from(JSON.stringify({ data })));
  expect(approvalsService.sendApprovalApplicationToUser).toHaveBeenCalledWith('door-1', data);
  expect(approvalsService.sendApprovalResultToRobot).not.toHaveBeenCalled();
});
