import { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

export function setIO(io: SocketServer) {
  _io = io;
}

export function getIO() {
  return _io;
}
