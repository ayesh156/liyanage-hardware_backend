import { Router, Request, Response } from 'express';

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

interface SseClient {
  id: string;
  tenantId: string;
  terminalId: string;
  userRole: string;
  res: Response;
}

export interface InvoiceSavedPayload {
  invoiceNumber: string;
  invoiceId?: string;
  total: number;
  finalizedBy: string;
  originClientId: string;
  updatedAt: string;
}

interface SseClient {
  id: string;
  tenantId: string;
  terminalId: string;
  userRole: string;
  res: Response;
}

const rooms = new Map<string, Map<string, SseClient>>();

// 🌟 කාමරයේ අවසන් Cart State එක මතක තබාගන්නා State Cache එක
const roomStates = new Map<string, any>();

function getRoomKey(tenantId: string, terminalId: string): string {
  return `${tenantId}:${terminalId}`;
}

function broadcastToRoom(roomKey: string, event: string, payload: any, senderClientId?: string) {
  const room = rooms.get(roomKey);
  if (!room) return;

  const data = JSON.stringify({ event, payload });
  room.forEach((client) => {
    // තමන්ගේම update එක තමන්ට යවන්නේ නෑ
    if (senderClientId && client.id === senderClientId) return;
    client.res.write(`data: ${data}\n\n`);
  });
}

function emitPeerCount(roomKey: string) {
  const room = rooms.get(roomKey);
  const count = room ? room.size : 0;
  broadcastToRoom(roomKey, 'session_peers', { count });
}

export const syncRouter = Router();

// 1. Client Browser එක සම්බන්ධ වන තැන (Long-lived SSE Stream)
syncRouter.get('/stream', (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId || '').trim();
  const terminalId = String(req.query.terminalId || '').trim();
  const userRole = String(req.query.userRole || 'unknown').trim();
  const clientId = String(req.query.clientId || Math.random().toString(36).slice(2)).trim();

  if (!tenantId || !terminalId) {
    return res.status(400).json({ error: 'tenantId and terminalId are required' });
  }

  // 🌟 OLS Reverse Proxy එකට "මේක stream එකක්, buffer කරන්න එපා" කියන්න විශේෂ Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' 
  });

  const roomKey = getRoomKey(tenantId, terminalId);
  if (!rooms.has(roomKey)) {
    rooms.set(roomKey, new Map());
  }

  const client: SseClient = { id: clientId, tenantId, terminalId, userRole, res };
  rooms.get(roomKey)!.set(clientId, client);

  // Connection සාර්ථක බව දැනුම් දීම
 const currentState = roomStates.get(roomKey);
  const initialPayload = currentState ? { status: 'ok', initialState: currentState } : { status: 'ok' };
  res.write(`data: ${JSON.stringify({ event: 'connected', payload: initialPayload })}\n\n`);
  emitPeerCount(roomKey);

  // OLS Timeout වීම වැළැක්වීමට තත්පර 25න් 25ට Heartbeat එකක් යැවීම
  const keepAlive = setInterval(() => {
    res.write(`:\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const room = rooms.get(roomKey);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        rooms.delete(roomKey);
        roomStates.delete(roomKey);
      } else {
        emitPeerCount(roomKey);
      }
    }
  });
});

// 2. Cart එකේ වෙනස්කම් යවන API එක (Frontend -> POST)
// 2. Cart එකේ වෙනස්කම් යවන API එක (Frontend -> POST)
syncRouter.post('/broadcast-cart', (req: Request, res: Response) => {
  const { tenantId, terminalId, payload } = req.body;
  if (!tenantId || !terminalId || !payload) return res.status(400).json({ error: 'Missing fields' });

  const roomKey = getRoomKey(tenantId, terminalId);
  const existingState = roomStates.get(roomKey);

  if (payload.items?.length === 0 && existingState && existingState.items?.length > 0) {
    // මෙය හිතාමතා කළ Clear එකක් නොවන අවස්ථාවලදී පරණ state එක ආරක්ෂා කරයි
  } else {
    roomStates.set(roomKey, payload);
  }

  broadcastToRoom(roomKey, 'sync_cart_state', payload, payload.originClientId);
  return res.status(200).json({ success: true });
});

// 3. බිල අවසන් කළ විට යවන API එක (Frontend -> POST)
syncRouter.post('/broadcast-invoice', (req: Request, res: Response) => {
  const { tenantId, terminalId, payload } = req.body;
  if (!tenantId || !terminalId || !payload) return res.status(400).json({ error: 'Missing fields' });

  const roomKey = getRoomKey(tenantId, terminalId);
  roomStates.delete(roomKey); // 

  broadcastToRoom(roomKey, 'invoice_finalized', payload, payload.originClientId);
  return res.status(200).json({ success: true });
});