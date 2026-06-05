import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import prisma from './lib/prisma';
import { setIO } from './lib/socket';

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: env.isDev ? '*' : [env.FRONTEND_URL], credentials: true },
});
setIO(io);

io.on('connection', (socket) => {
  const token = socket.handshake.query.token as string | undefined;
  if (!token) { socket.disconnect(); return; }
  socket.join('terrain');
});

async function start() {
  await prisma.$connect();
  httpServer.listen(env.PORT, () => {
    console.log(`[cecaw] Backend running on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
