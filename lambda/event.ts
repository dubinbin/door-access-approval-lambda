import { configureRuntime } from '../src/utilities/runtime';
import { configureConsoleLogger } from '../src/utilities/consoleLogger';

export const handler = async (event: unknown) => {
  configureRuntime({ isLambda: true });
  configureConsoleLogger();
  const { handleIotRuleEvent } = await import('../src/lambdaRouter.js');
  return handleIotRuleEvent(event);
};
