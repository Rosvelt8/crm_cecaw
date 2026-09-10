import { createServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app';
import { env } from './config/env';
import prisma from './lib/prisma';
import { setIO } from './lib/socket';
import { AuthJwtPayload } from './middleware/auth';

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: env.isDev ? '*' : env.CORS_ORIGINS, credentials: true },
});
setIO(io);

/** Salle des postes de supervision : ils recoivent les positions des agents. */
const TERRAIN_ROOM = 'terrain';

/** Salle propre a un agent, permettant de lui adresser une demande de position. */
const agentRoom = (agentId: number) => `agent:${agentId}`;

/** Verifie la forme du jeton plutot que de forcer le type a l'aveugle. */
function isAuthPayload(value: unknown): value is AuthJwtPayload {
  const p = value as Partial<AuthJwtPayload> | null;
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.sub === 'number' &&
    typeof p.email === 'string' &&
    typeof p.role === 'string'
  );
}

function verify(token?: string): AuthJwtPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return isAuthPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Authentification en intergiciel, et non apres coup.
 *
 * Un `socket.disconnect()` cote serveur produit la raison « io server
 * disconnect », pour laquelle socket.io ne retente jamais : un jeton expire
 * condamnait donc la session jusqu'au rechargement de la page. Un refus ici
 * remonte en `connect_error`, que le client rejoue automatiquement, en
 * redemandant un jeton frais grace au rappel `auth`.
 */
io.use((socket, next) => {
  // `auth` est reevalue a chaque tentative de reconnexion, contrairement a
  // `query`, conserve en repli pour les clients plus anciens.
  const jeton =
    (socket.handshake.auth?.token as string | undefined) ??
    (socket.handshake.query.token as string | undefined);

  const user = verify(jeton);
  if (!user) return next(new Error('Jeton invalide ou expire'));

  socket.data.user = user;
  return next();
});

io.on('connection', (socket: Socket) => {
  const user = socket.data.user as AuthJwtPayload;

  // Confirmation explicite : cote client, l'evenement `connect` est emis avant
  // que le serveur n'ait pu refuser le jeton. Sans cet accuse, l'interface
  // affichait « temps reel » sur une session en fait rejetee.
  socket.emit('session:ready', { role: user.role });

  if (user.role === 'agent') {
    // Un telephone d'agent annonce la fiche a laquelle il correspond, afin de
    // pouvoir recevoir une demande de position immediate depuis le back-office.
    const agentId = Number(
      socket.handshake.auth?.agent_id ?? socket.handshake.query.agent_id,
    );
    if (Number.isFinite(agentId)) socket.join(agentRoom(agentId));
  } else {
    socket.join(TERRAIN_ROOM);
  }

  /**
   * Le back-office demande la position instantanee d'un agent.
   * Le serveur ne fait que relayer : c'est le telephone qui repond, en
   * appelant `PATCH /agents/:id/position` comme lors d'un releve ordinaire.
   */
  socket.on('agent:position:request', (payload: { agent_id?: number }) => {
    if (socket.data.user?.role === 'agent') return;
    const agentId = Number(payload?.agent_id);
    if (!Number.isFinite(agentId)) return;

    const room = io.sockets.adapter.rooms.get(agentRoom(agentId));
    const joignable = Boolean(room && room.size > 0);

    if (joignable) io.to(agentRoom(agentId)).emit('position:request');

    // Reponse immediate au demandeur : sans cela l'interface attendrait
    // indefiniment une position qu'aucun telephone connecte ne peut fournir.
    socket.emit('agent:position:requested', { agent_id: agentId, joignable });
  });
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
