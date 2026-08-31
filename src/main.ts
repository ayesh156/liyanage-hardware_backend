import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { initCheckoutSyncGateway } from './gateways/checkoutSync.gateway.js';

const app = express();

// 🚀 CRITICAL FIX: .env එකේ තියෙන PORT එක (3002) නූලටම කියවා ගැනීම සහතික කිරීම
const PORT = parseInt(process.env.PORT || '3002', 10);

// ── Dynamic CORS & Preflight Handler ─────────────────────────────────────────

/**
 * Dynamically checks whether the incoming Origin header is allowed.
 *
 * - Whitelists all variants of localhost and 127.0.0.1 (any port, http/https)
 * - Safely matches the production Liyanage Hardware domain (case-insensitive,
 *   with optional trailing slash tolerance via regex)
 * - Fallback evaluation for custom CORS_ORIGIN environment declarations
 *   using trailing-slash-stripped, case-insensitive comparison
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  // 🌟 FIX: Duplicate comma-separated origins ආවොත් මුල් origin එක පමණක් clean කර අත්හැරීම
  const cleanOrigin = origin.split(',')[0].trim();

  // 1. Whitelist all variants of localhost and 127.0.0.1
  if (/^https?:\/\/localhost(:\d+)?$/i.test(cleanOrigin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(cleanOrigin)) return true;

  // 2. Match production domains
  if (/^https:\/\/liyanage\.ecosystemlk\.app\/?$/i.test(cleanOrigin)) return true;
  if (/^https:\/\/api\.liyanage\.ecosystemlk\.app\/?$/i.test(cleanOrigin)) return true;

  // 3. Fallback evaluation
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    const cleanEnv = envOrigin.replace(/\/$/, '');
    const cleanTarget = cleanOrigin.replace(/\/$/, '');
    if (cleanEnv.toLowerCase() === cleanTarget.toLowerCase()) return true;
  }

  return false;
}

/**
 * Early-stage middleware that handles CORS headers and OPTIONS preflight.
 *
 * Bulletproof design:
 * - Origin is present AND allowed → reflect the origin explicitly
 * - Origin is absent OR not in the whitelist → fall back to production default
 *   to eliminate zero-header dropouts during proxy handshakes
 * - OPTIONS preflight always returns 204 immediately, never reaching the router
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  // 🌟 Socket.io ඉල්ලීම් Express CORS middleware එකෙන් ඉ외 කර Engine.IO වෙතම භාර දෙන්න
  if (req.path.startsWith('/socket.io')) {
    return next();
  }

  const origin = req.headers.origin;

  // Inform downstream caches that the response varies by Origin
  res.setHeader('Vary', 'Origin');

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  } else {
    res.setHeader(
      'Access-Control-Allow-Origin',
      'https://liyanage.ecosystemlk.app',
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  }

  // ── OPTIONS preflight ──
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

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Cookie parser — required for httpOnly auth cookie reading ────────────────
app.use(cookieParser());

// ── Request logging ──────────────────────────────────────────────────────────
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

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', router);

// ── Error Handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

// ═════════════════════════════════════════════════════════════════════════════
// SELF-HEALING INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════
// On every server boot, scans the Customer table for any corrupted negative
// loanBalance values and automatically repairs them to 0. This prevents data
// corruption (like the Rs. -25 shown in image_a06162.png) from persisting
// across restarts and ensures accounts always start in a valid state.
//
// This is a SAFE, NON-DESTRUCTIVE operation — it only modifies records that
// are mathematically impossible (negative debt), leaving all other data intact.
async function runSelfHealing(): Promise<void> {
  try {
    const damagedCustomers = await prisma.customer.findMany({
      where: {
        loanBalance: { lt: 0 },
      },
      select: { id: true, name: true, loanBalance: true },
    });

    if (damagedCustomers.length > 0) {
      console.log(`\n🔧 SELF-HEALING: Found ${damagedCustomers.length} customer(s) with negative loanBalance`);
      
      for (const c of damagedCustomers) {
        console.log(`   → Repairing "${c.name}" (${c.id}): ${Number(c.loanBalance).toFixed(2)} → 0.00`);
        await prisma.customer.update({
          where: { id: c.id },
          data: {
            loanBalance: 0,
            updatedAt: new Date(),
          },
        });
      }

      console.log(`   ✅ Self-healing complete — all negative loan balances reset to 0\n`);
    } else {
      console.log(`\n✅ Self-healing check passed — no negative loan balances detected\n`);
    }
  } catch (err) {
    console.error(`\n⚠️ Self-healing initialization failed (non-fatal):`, (err as Error).message, `\n`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP SERVER + SOCKET.IO ATTACHMENT
// ═════════════════════════════════════════════════════════════════════════════
// Socket.IO needs a raw http.Server instance (not the Express app itself) so
// it can hijack the WebSocket upgrade handshake alongside normal HTTP
// traffic on the same port. Express keeps handling all existing REST routes
// unchanged; Socket.IO only intercepts requests to its own `/socket.io` path.
const httpServer = http.createServer(app);
export const io = initCheckoutSyncGateway(httpServer, isOriginAllowed);

// ── Start Server (with self-healing preflight) ──────────────────────────────
async function startServer() {
  // Run self-healing before accepting connections
  await runSelfHealing();

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Hardware Management System API`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`   Listening:   http://localhost:${PORT}`);
    console.log(`   Health:      http://localhost:${PORT}/api/health`);
    console.log(`   Docs:        http://localhost:${PORT}/api/products (sample)`);
    console.log(`   Live Sync:   ws://localhost:${PORT}/socket.io (namespace /checkout-sync)\n`);
  });
}

startServer();

export default app;
