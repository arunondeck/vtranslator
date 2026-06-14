import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@translator/shared-socket-contracts';

import { BACKEND_SOCKET_URL } from '../config';

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export type SpeakerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSpeakerSocket(): SpeakerSocket {
  return io(BACKEND_SOCKET_URL, {
    autoConnect: false,
    reconnection: true,
  });
}
