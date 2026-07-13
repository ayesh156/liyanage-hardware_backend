import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Singleton Prisma client for the entire application.
 * Uses the MariaDB adapter for Prisma 7 compatibility.
 * In development, we cache the client on `globalThis` to avoid
 * exhausting connections during hot-reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Pass the raw DATABASE_URL directly — the adapter's constructor
// handles rewriting `mysql://` to `mariadb://` and stripping
// Prisma-specific query params (allowPublicKeyRetrieval, connection_limit, etc.)
const adapterUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_hardware';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaMariaDb(adapterUrl),
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
