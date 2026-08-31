import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

export interface CartStatePayload {
  items: unknown[];
  discount: number;
  selectedCustomerId: string;
  receivedAmount: number;
  paymentMethod: 'cash' | 'credit';
  version: number;
  originClientId: string;
  updatedAt: string;
}

export interface InvoiceSavedPayload {
  invoiceNumber: string;
  invoiceId?: string;
  total: number;
  finalizedBy: string;
  originClientId: string;
  updatedAt: string;
}

interface SocketSessionMeta {
  tenantId: string;
  terminalId: string;
  userRole: string;
  userId?: string;
  userName?: string;
  room: string;
}

const socketMeta = new WeakMap<WebSocket, SocketSessionMeta>();
const rooms = new Map<string, Set<WebSocket>>();

function buildRoomKey(tenantId: string, terminalId: string): string {
  return `session:${tenantId}:${terminalId}`;
}

export function initCheckoutSyncGateway(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/checkout-sync' });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (rawMessage: string) => {
      try {
        const data = JSON.parse(rawMessage.toString());
        const { event, payload } = data;

        if (event === 'join_checkout_session') {
          const tenantId = String(payload?.tenantId || '').trim();
          const terminalId = String(payload?.terminalId || '').trim();
          const userRole = String(payload?.userRole || 'unknown').trim();

          if (!tenantId || !terminalId) return;

          const roomKey = buildRoomKey(tenantId, terminalId);
          
          if (!rooms.has(roomKey)) {
            rooms.set(roomKey, new Set());
          }
          rooms.get(roomKey)!.add(ws);

          socketMeta.set(ws, {
            tenantId,
            terminalId,
            userRole,
            room: roomKey,
          });

          const currentRoom = rooms.get(roomKey)!;
          const peerMessage = JSON.stringify({
            event: 'session_peers',
            payload: { count: currentRoom.size },
          });

          currentRoom.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(peerMessage);
            }
          });
        }

        if (event === 'broadcast_cart_state') {
          const meta = socketMeta.get(ws);
          if (!meta || !rooms.has(meta.room)) return;

          const broadcastMsg = JSON.stringify({
            event: 'sync_cart_state',
            payload,
          });

          rooms.get(meta.room)!.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(broadcastMsg);
            }
          });
        }

        if (event === 'broadcast_invoice_saved') {
          const meta = socketMeta.get(ws);
          if (!meta || !rooms.has(meta.room)) return;

          const broadcastMsg = JSON.stringify({
            event: 'invoice_finalized',
            payload,
          });

          rooms.get(meta.room)!.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(broadcastMsg);
            }
          });
        }
      } catch (err) {
        console.error('[WS Message Error]', err);
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (meta && rooms.has(meta.room)) {
        const currentRoom = rooms.get(meta.room)!;
        currentRoom.delete(ws);
        if (currentRoom.size === 0) {
          rooms.delete(meta.room);
        } else {
          const peerMessage = JSON.stringify({
            event: 'session_peers',
            payload: { count: currentRoom.size },
          });
          currentRoom.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(peerMessage);
            }
          });
        }
      }
      socketMeta.delete(ws);
    });
  });

  console.log('🔌 Native WebSocket gateway attached at /checkout-sync');
}