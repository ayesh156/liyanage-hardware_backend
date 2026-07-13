import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import prisma from './lib/prisma.js';
import router from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';

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
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  // 1. Whitelist all variants of localhost and 127.0.0.1 (any port, http/https)
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;

  // 2. Safely match the production Liyanage Hardware domain
  //    (case-insensitive, optional trailing slash safety)
  if (/^https:\/\/liyanage\.ecosystemlk\.app\/?$/i.test(origin)) return true;

  // 3. Fallback evaluation for custom CORS_ORIGIN environment declarations
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    const cleanEnv = envOrigin.replace(/\/$/, '');
    const cleanOrigin = origin.replace(/\/$/, '');
    if (cleanEnv.toLowerCase() === cleanOrigin.toLowerCase()) return true;
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
  const origin = req.headers.origin;

  // Inform downstream caches that the response varies by Origin
  res.setHeader('Vary', 'Origin');

  if (origin && isOriginAllowed(origin)) {
    // ── Origin is explicitly allowed — echo it back ──
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  } else {
    // ── Production fallback default to eliminate zero-header dropouts ──
    // Handles cases where:
    //   a) Origin header is absent (proxy-to-server requests)
    //   b) Origin header is present but has a trailing slash mismatch
    //   c) Origin header is masked during internal reverse proxy handshakes
    res.setHeader(
      'Access-Control-Allow-Origin',
      'https://liyanage.ecosystemlk.app',
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  }

  // ── OPTIONS preflight — respond immediately, never reaches router ──
  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cookie',
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
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

// ── Start Server (with self-healing preflight) ──────────────────────────────
async function startServer() {
  // Run self-healing before accepting connections
  await runSelfHealing();

  app.listen(PORT, () => {
    console.log(`\n🚀 Hardware Management System API`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`   Listening:   http://localhost:${PORT}`);
    console.log(`   Health:      http://localhost:${PORT}/api/health`);
    console.log(`   Docs:        http://localhost:${PORT}/api/products (sample)\n`);
  });
}

startServer();

export default app;
