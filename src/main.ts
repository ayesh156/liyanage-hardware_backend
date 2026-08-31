import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { initCheckoutSyncGateway } from './gateways/checkoutSync.gateway.js';

const app = express();

const PORT = parseInt(process.env.PORT || '3002', 10);

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

// ── Bulletproof CORS & Header Sanitizer Middleware ───────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  // 🌟 Duplicate CORS headers වැළැක්වීමට res.setHeader override කිරීම
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: any) {
    if (name.toLowerCase() === 'access-control-allow-origin' && typeof value === 'string') {
      // කවර හෝ හේතුවකින් duplicate origins (coma separated) ආවොත් පළමුවැන්න පමණක් තෝරාගනී
      value = value.split(',')[0].trim();
    }
    return originalSetHeader(name, value);
  };

  if (req.path.startsWith('/socket.io')) {
    return next();
  }

  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  const allowedOrigin = (origin && isOriginAllowed(origin)) 
    ? origin.split(',')[0].trim() 
    : 'https://liyanage.ecosystemlk.app';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');

  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cookie',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${req.method}] ${req.originalUrl} → ${_res.statusCode} (${duration}ms)`,
    );
  });
  next();
});

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
export const io = initCheckoutSyncGateway(httpServer, isOriginAllowed);

async function startServer() {
  await runSelfHealing();
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Hardware Management System API listening on port ${PORT}\n`);
  });
}

startServer();
export default app;