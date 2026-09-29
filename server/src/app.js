import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { notFound } from './middleware/notFound.js';
import { requestId, REQUEST_ID_HEADER } from './middleware/requestId.js';
import { apiRouter } from './routes/index.js';

const JSON_BODY_LIMIT = '100kb';

/**
 * Builds the Express application without binding a port, so tests can drive it
 * in-process (supertest) and server.js can attach other protocols (WebSockets)
 * to the same HTTP server.
 */
export function createApp() {
  const app = express();

  // Middleware order matters: identify → log → secure → parse → route → 404 → errors.
  app.use(requestId());
  app.use(httpLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origins,
      exposedHeaders: [REQUEST_ID_HEADER],
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
