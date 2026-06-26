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
app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'realtime-backend',
  });
});

registerSocketHandlers(io);

httpServer.listen(config.port, config.host, () => {
  console.log(
    `Realtime backend listening on http://${config.host}:${config.port} (host alias for Android emulator: http://10.0.2.2:${config.port})`,
  );
});
