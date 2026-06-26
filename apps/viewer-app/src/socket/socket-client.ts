import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@translator/shared-socket-contracts';
import { BACKEND_SOCKET_URL } from '../config';

export type ViewerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocketClient(): ViewerSocket {
  return io(BACKEND_SOCKET_URL, {
    autoConnect: false,
    reconnection: true,
    transports: ['websocket'],
  });
}