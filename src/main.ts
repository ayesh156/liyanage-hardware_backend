import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
// 🌟 අලුත් SSE router එක import කිරීම
import { syncRouter } from './gateways/checkoutSync.gateway.js';

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

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.split(',')[0].trim();

  if (/^https?:\/\/localhost(:\d+)?$/i.test(cleanOrigin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(cleanOrigin)) return true;
  if (/^https:\/\/liyanage\.ecosystemlk\.app\/?$/i.test(cleanOrigin)) return true;
  if (/^https:\/\/api\.liyanage\.ecosystemlk\.app\/?$/i.test(cleanOrigin)) return true;

  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    const cleanEnv = envOrigin.replace(/\/$/, '');
    const cleanTarget = cleanOrigin.replace(/\/$/, '');
    if (cleanEnv.toLowerCase() === cleanTarget.toLowerCase()) return true;
  }

  return false;
}

// 🌐 Clean CORS Middleware with Origin Whitelist
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Vary', 'Origin');

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'https://liyanage.ecosystemlk.app');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  next();
});

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

const httpServer = http.createServer(app);

// 🚀 Server Initialization & Startup Banner
async function startServer() {
  try {
    // 🩺 Check MariaDB Adapter connection on startup
    await prisma.$connect();
    console.log('✅ MariaDB Driver Adapter connected successfully (Max pool: 5)');

    await runSelfHealing();

    httpServer.listen(PORT, () => {
      console.log(`🚀 Liyanage API running on http://localhost:${PORT}`);
      console.log(`🩺 Health Check: http://localhost:${PORT}/health`);
      console.log(`📡 SSE Gateway active: http://localhost:${PORT}/api/sync/stream`);
      console.log(`🌐 Production Domain: https://liyanage.ecosystemlk.app\n`);
    });
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

  // Stop accepting new connections
  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[lsnode] Database disconnected. Exiting cleanly.');
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