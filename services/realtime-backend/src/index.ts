import 'dotenv/config';
import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@translator/shared-socket-contracts';
import { config } from './config.js';
import { registerSocketHandlers, type SocketData } from './socket.js';
import { sonioxRouter } from './routes.soniox.js';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
  httpServer,
  {
    cors: { origin: config.corsOrigin },
    maxHttpBufferSize: config.maxAudioChunkBytes,
  },
);

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/soniox', sonioxRouter);

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'realtime-backend',
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  response.status(message.includes('required') || message.includes('URL') ? 400 : 500).json({
    ok: false,
    error: message,
  });
});

registerSocketHandlers(io);

httpServer.listen(config.port, config.host, () => {
  console.log(
    `Realtime backend listening on http://${config.host}:${config.port} (host alias for Android emulator: http://10.0.2.2:${config.port})`,
  );
});
