import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHECKOUT LIVE-SYNC GATEWAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Namespace: /checkout-sync
 *
 * Rooms are scoped per-tenant, per-terminal-session using the key:
 *   `session:${tenantId}:${terminalId}`
 *
 * This lets two physical terminals (e.g. an Admin desk and a Cashier
 * counter) that share the same `terminalId` (the "POS session code")
 * mirror the same live cart, while staying fully isolated from every
 * other tenant/session pair on the same server process.
 *
 * Events (client → server)
 * ─────────────────────────
 *  join_checkout_session   { tenantId, terminalId, userRole }
 *  leave_checkout_session   (optional, also handled automatically on disconnect)
 *  broadcast_cart_state     CartStatePayload
 *  broadcast_invoice_saved  InvoiceSavedPayload
 *
 * Events (server → client)
 * ─────────────────────────
 *  session_peers            { count: number, roles: string[] }
 *  sync_cart_state           CartStatePayload  (relayed to every OTHER peer in room)
 *  invoice_finalized         InvoiceSavedPayload
 *  session_error             { message: string }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Payload contracts (kept structurally loose; validated defensively) ──────
export interface CartStatePayload {
  items: unknown[];
  discount: number;
  selectedCustomerId: string;
  receivedAmount: number;
  paymentMethod: 'cash' | 'credit';
  /** monotonic sender-side version — lets receivers discard stale/out-of-order frames */
  version: number;
  /** echoed back so the sender can ignore its own broadcast if it ever loops back */
  originClientId: string;
  updatedAt: string; // ISO timestamp
}

export interface InvoiceSavedPayload {
  invoiceNumber: string;
  invoiceId?: string;
  total: number;
  finalizedBy: string; // display name / role of whoever clicked Checkout
  originClientId: string;
  updatedAt: string;
}

interface JoinSessionPayload {
  tenantId: string;
  terminalId: string;
  userRole: 'admin' | 'cashier' | string;
}

interface SocketSessionMeta {
  tenantId: string;
  terminalId: string;
  userRole: string;
  userId?: string;
  userName?: string;
  room: string;
}

const socketMeta = new WeakMap<Socket, SocketSessionMeta>();

function buildRoomKey(tenantId: string, terminalId: string): string {
  return `session:${tenantId}:${terminalId}`;
}

/**
 * Very small payload sanity check — this is a relay, not a source of truth,
 * so we only guard against obviously malformed / oversized frames rather
 * than fully re-validating business rules (the REST endpoints remain the
 * single source of truth for anything actually persisted).
 */
function isPlausibleCartState(payload: any): payload is CartStatePayload {
  return (
    payload &&
    Array.isArray(payload.items) &&
    payload.items.length <= 500 &&
    typeof payload.discount === 'number' &&
    typeof payload.selectedCustomerId === 'string' &&
    typeof payload.receivedAmount === 'number' &&
    (payload.paymentMethod === 'cash' || payload.paymentMethod === 'credit') &&
    typeof payload.version === 'number' &&
    typeof payload.originClientId === 'string'
  );
}

function isPlausibleInvoiceSaved(payload: any): payload is InvoiceSavedPayload {
  return (
    payload &&
    typeof payload.invoiceNumber === 'string' &&
    typeof payload.total === 'number' &&
    typeof payload.originClientId === 'string'
  );
}

/**
 * Optional soft-auth: if an `auth_token` (or `token`) cookie / auth payload
 * is present, decode it so we can attach a display name + trust the role
 * claim instead of trusting the client-supplied `userRole` blindly. This is
 * intentionally non-fatal — the gateway still allows anonymous/local dev
 * connections rather than hard-failing the whole live-sync feature if JWT
 * verification fails, since a broken socket auth should never take down
 * the (already-authenticated-via-REST) checkout flow itself.
 */
function tryDecodeUser(socket: Socket): { id?: string; name?: string; role?: string } {
  try {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const match = /(?:^|;\s*)(auth_token|token)=([^;]+)/.exec(cookieHeader);
    const bearer = socket.handshake.auth?.token as string | undefined;
    const raw = bearer || (match ? decodeURIComponent(match[2]) : undefined);
    if (!raw || !process.env.JWT_SECRET) return {};
    const decoded = jwt.verify(raw, process.env.JWT_SECRET) as any;
    return { id: decoded?.id || decoded?.userId, name: decoded?.name, role: decoded?.role };
  } catch {
    // Non-fatal: fall back to whatever the client claims in join_checkout_session
    return {};
  }
}

export function initCheckoutSyncGateway(
  httpServer: HttpServer,
  isOriginAllowed: (origin: string | undefined) => boolean = () => true,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        const rawOrigin = origin ? origin.split(',')[0].trim() : origin;
        const normalized = rawOrigin ? rawOrigin.replace(/\/$/, '') : rawOrigin;

        if (isOriginAllowed(normalized)) {
          callback(null, true);
        } else {
          console.warn(`[checkoutSync] Rejected Socket.IO handshake — origin not allowed: ${JSON.stringify(origin)}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 256 * 1024,
  });

  // OpenLiteSpeed එකෙන් එන duplicate headers fix කිරීමට response headers override කිරීම:
  io.engine.on('initial_headers', (headers: Record<string, string | string[]>, req: any) => {
    const rawOrigin = req.headers.origin;
    if (rawOrigin) {
      headers['Access-Control-Allow-Origin'] = rawOrigin.split(',')[0].trim();
    }
  });

  const nsp = io.of('/checkout-sync');

  // Surfaces handshake-level failures (bad transport, malformed request,
  // CORS rejection, etc.) that would otherwise only show up as an opaque
  // 400 in the browser with nothing in the server logs.
  io.engine.on('connection_error', (err) => {
    console.warn(
      `[checkoutSync] Engine.IO connection_error — code=${err.code} message=${err.message} origin=${JSON.stringify(err.req?.headers?.origin)}`,
    );
  });

  nsp.on('connection', (socket: Socket) => {
    const decodedUser = tryDecodeUser(socket);

    // ── join_checkout_session ──
    socket.on('join_checkout_session', (payload: JoinSessionPayload) => {
      const tenantId = String(payload?.tenantId || '').trim();
      const terminalId = String(payload?.terminalId || '').trim();
      const userRole = String(payload?.userRole || 'unknown').trim();

      if (!tenantId || !terminalId) {
        socket.emit('session_error', { message: 'tenantId and terminalId are required to join a checkout session' });
        return;
      }

      // Leave any previously-joined room for this socket first (defensive —
      // a client re-joining with a different terminalId shouldn't leak into
      // two rooms simultaneously).
      const prior = socketMeta.get(socket);
      if (prior) socket.leave(prior.room);

      const room = buildRoomKey(tenantId, terminalId);
      socket.join(room);

      const meta: SocketSessionMeta = {
        tenantId,
        terminalId,
        userRole: decodedUser.role || userRole,
        userId: decodedUser.id,
        userName: decodedUser.name,
        room,
      };
      socketMeta.set(socket, meta);

      // Tell everyone in the room (including the joiner) how many peers
      // are now connected, so the frontend can render "2 terminals live".
      const roomSockets = nsp.adapter.rooms.get(room);
      const peerCount = roomSockets ? roomSockets.size : 1;
      nsp.to(room).emit('session_peers', { count: peerCount, roles: [meta.userRole] });
    });

    // ── broadcast_cart_state (sender → relay to every OTHER peer in room) ──
    socket.on('broadcast_cart_state', (payload: CartStatePayload) => {
      const meta = socketMeta.get(socket);
      if (!meta) {
        socket.emit('session_error', { message: 'Join a checkout session before broadcasting cart state' });
        return;
      }
      if (!isPlausibleCartState(payload)) return; // silently drop malformed frames

      // Relay to every other socket in the room — never echo back to sender,
      // that's what causes the classic "typing bounces the cursor" bug.
      socket.to(meta.room).emit('sync_cart_state', payload);
    });

    // ── broadcast_invoice_saved (finalize → relay + everyone resets) ──
    socket.on('broadcast_invoice_saved', (payload: InvoiceSavedPayload) => {
      const meta = socketMeta.get(socket);
      if (!meta) return;
      if (!isPlausibleInvoiceSaved(payload)) return;

      // Broadcast to the WHOLE room including the sender's other tabs, but
      // the sender's own active tab already reset itself locally on success
      // — so we exclude the originating socket to avoid a redundant toast.
      socket.to(meta.room).emit('invoice_finalized', payload);
    });

    socket.on('leave_checkout_session', () => {
      const meta = socketMeta.get(socket);
      if (!meta) return;
      socket.leave(meta.room);
      const roomSockets = nsp.adapter.rooms.get(meta.room);
      nsp.to(meta.room).emit('session_peers', { count: roomSockets ? roomSockets.size : 0, roles: [] });
      socketMeta.delete(socket);
    });

    socket.on('disconnect', () => {
      const meta = socketMeta.get(socket);
      if (!meta) return;
      // Room membership is cleaned up automatically by socket.io on
      // disconnect; we just need to notify remaining peers of the new count.
      setImmediate(() => {
        const roomSockets = nsp.adapter.rooms.get(meta.room);
        const peerCount = roomSockets ? roomSockets.size : 0;
        nsp.to(meta.room).emit('session_peers', { count: peerCount, roles: [] });
      });
      socketMeta.delete(socket);
    });
  });

  console.log('🔌 Checkout Live-Sync gateway attached at /checkout-sync (Socket.IO)');

  return io;
}
