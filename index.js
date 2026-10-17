import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

try {
  const gladys = new GladysIntegration();
  const stop = registerHandlers(gladys);
  gladys.handleShutdown(stop);
  await gladys.connect();
} catch {
  // SDK/provider errors can contain request URLs or installation data.
  logger.error('Unable to start free@home. Check this integration’s Gladys credentials.');
  process.exitCode = 1;
}
