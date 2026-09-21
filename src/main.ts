import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { prisma, connectDB, disconnectDB } from './lib/prisma.ts';
import router from './routes/index.ts';
import { errorHandler } from './middlewares/errorHandler.middleware.ts';
// 🌟 අලුත් SSE router එක import කිරීම
import { syncRouter } from './gateways/checkoutSync.gateway.ts';

// 📁 .env Load & Terminal Path Inspection
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'backend', '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📁 Loading .env from: ${envPath}`);
    dotenv.config({ path: envPath });
    break;
  }
}


const app = express();

app.set('trust proxy', 1);

const PORT = parseInt(process.env.PORT || '3002', 10);

// 🛡️ [FIX] Origin Header Cleaning Middleware (OpenLiteSpeed / Nginx multi-header strip)
app.use((req: Request, _res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string' && origin.includes(',')) {
    req.headers.origin = origin.split(',')[0].trim();
  }
  next();
});

// ── BULLETPROOF PRODUCTION CORS CONFIGURATION ────────────────
const allowedOrigins = [
  'https://lbd.ecosystemlk.app',
  'https://api.lbd.ecosystemlk.app',
  'https://liyanage.ecosystemlk.app',
  'https://api.liyanage.ecosystemlk.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3002',
  process.env.CORS_ORIGIN || ''
].filter(Boolean);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
    // Mobile apps, server-to-server, curl ba same-origin allow kora
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');
    const isAllowed = allowedOrigins.some(item => cleanOrigin === item.replace(/\/+$/, '')) ||
                      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin);

    if (isAllowed) {
      return callback(null, cleanOrigin);
    }

    // Safe Fallback: new Error() throw na kore primary frontend echo kore
    return callback(null, 'https://lbd.ecosystemlk.app');
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // 24 hours preflight cache
}));

import rateLimit from 'express-rate-limit';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 🛡️ API Rate Limiter (DDoS & Database Connection Exhaustion Shield)
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // Limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api', apiRateLimiter);

app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${_res.statusCode} (${duration}ms)`);
  });
  next();
});

// 🩺 System Health & Connectivity Route
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'Liyanage Hardware System API',
    timestamp: new Date().toISOString(),
  });
});

// Root API Info Route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Liyanage Hardware Management API',
    status: 'running',
    port: PORT,
  });
});

// 🌟 /api/sync යටතේ SSE Routes ටික mount කිරීම
app.use('/api/sync', syncRouter);
app.use('/api', router);

// Error Handler-er age CORS headers attach kora (500 Error-e CORS drop hoa thekate)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin.replace(/\/+$/, ''));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next(err);
});

app.use(errorHandler);

async function runSelfHealing(): Promise<void> {
  try {
    const damagedCustomers = await prisma.customer.findMany({
      where: { loanBalance: { lt: 0 } },
      select: { id: true, name: true, loanBalance: true },
    });
    if (damagedCustomers.length > 0) {
      for (const c of damagedCustomers) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { loanBalance: 0, updatedAt: new Date() },
        });
      }
    }
  } catch (err) {
    console.error(`\n⚠️ Self-healing initialization failed:`, (err as Error).message);
  }
}

// 🌟 Database Keep-Alive Ping: wait_timeout (30s) e idle socket kill hoa thekate prottek 20s e ping kore
let keepAliveInterval: NodeJS.Timeout | undefined;
function startKeepAlivePing(): void {
  keepAliveInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.error('[Keep-Alive] Ping failed:', (err as Error).message);
    }
  }, 20000);
  keepAliveInterval.unref();
}

const httpServer = http.createServer(app);

// OpenLiteSpeed lsnode pipe socket ebong Local Port dual-support
const isLSNode = Boolean(process.env.LSAPI_CHILDREN);
const LISTEN_PORT = isLSNode ? undefined : PORT;

// 🚀 Server Initialization & Startup Sequence
async function startServer() {
  try {
    // 1. Verify connection using connectDB helper
    await connectDB();
    console.log('✅ MariaDB Driver Adapter connected successfully');

    // 2. Start listener based on environment
    if (LISTEN_PORT) {
      httpServer.listen(LISTEN_PORT, () => {
        console.log(`🚀 API running on http://localhost:${LISTEN_PORT}`);
        console.log(`🩺 Health Check: http://localhost:${LISTEN_PORT}/health`);
        console.log(`📡 SSE Gateway active: http://localhost:${LISTEN_PORT}/api/sync/stream`);
        runSelfHealing().catch((err) => console.error('Background self-healing error:', err));
        startKeepAlivePing();
      });
    } else {
      httpServer.listen(() => {
        console.log('🚀 API running via OpenLiteSpeed lsnode pipe');
        runSelfHealing().catch((err) => console.error('Background self-healing error:', err));
        startKeepAlivePing();
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// 🛡️ 1. OpenLiteSpeed (lsnode) Safe Graceful Shutdown Hook
let isShuttingDown = false;
function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[lsnode] Received ${signal}. Closing HTTP server and database gracefully...`);

  // Explicitly clear keep-alive interval
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  // Stop accepting new connections
  httpServer.close(async () => {
    try {
      await disconnectDB();
      console.log('[lsnode] Database disconnected cleanly. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('[lsnode] Error during database disconnect:', err);
      process.exit(1);
    }
  });

  // Safe Timeout: Close forcibly if background sockets fail to exit within 5s
  setTimeout(() => {
    console.error('[lsnode] Force exiting after 5s timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// 🛡️ 2. Prevent Unexpected Daemon Crashes (Unhandled Rejection Trap)
process.on('unhandledRejection', (reason: any) => {
  console.error('[lsnode] Unhandled Promise Rejection trapped:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[lsnode] Uncaught Exception trapped:', err);
});

export default app;