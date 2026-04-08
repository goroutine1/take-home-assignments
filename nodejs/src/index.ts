// Tracing must be initialized before any other imports to ensure
// HTTP and Express are instrumented via monkey-patching
import { sdk } from './tracing';

import { createApp } from './app';
import { config } from './config';

const { app, shutdown } = createApp();

const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', message: 'Server started', port: config.port }));
});

const gracefulShutdown = async () => {
  console.log(JSON.stringify({ level: 'info', message: 'Shutting down...' }));
  server.close();
  await shutdown();
  await sdk.shutdown().catch((err) =>
    console.error(JSON.stringify({ level: 'error', message: 'OTel SDK shutdown error', error: String(err) }))
  );
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
