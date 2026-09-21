import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error('DATABASE_URL is required.');
}

const dbUrl = new URL(rawUrl);

// [FIX 2026-09-21] Keep one small Prisma pool per Node.js process.
dbUrl.searchParams.set('connection_limit', '5');

// [FIX 2026-09-21] Limit time allowed to establish a database connection.
dbUrl.searchParams.set('connect_timeout', '20');

// [FIX 2026-09-21] Limit how long Prisma waits for an available pool connection.
dbUrl.searchParams.set('pool_timeout', '10');

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl.toString(),
      },
    },
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

// [FIX 2026-09-21] Reuse one PrismaClient instance within the Node.js process.
globalForPrisma.prisma = basePrisma;

let isConnected = false;

export function isDbConnected(): boolean {
  return isConnected;
}

// [FIX 2026-09-21] Connect to MariaDB once during application startup.
export async function connectDB(): Promise<void> {
  try {
    await basePrisma.$connect();
    isConnected = true;

    console.log(
      `✅ [${dbUrl.pathname.replace(/^\//, '')}] Prisma connected successfully ` +
        `(Pool: ${dbUrl.searchParams.get('connection_limit')}, ` +
        `PoolTimeout: ${dbUrl.searchParams.get('pool_timeout')}s)`
    );
  } catch (error) {
    isConnected = false;
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// [FIX 2026-09-21] Safely close the shared Prisma connection during shutdown.
export async function disconnectDB(): Promise<void> {
  try {
    await basePrisma.$disconnect();
    isConnected = false;
    console.log('✅ Prisma database connection closed.');
  } catch (error) {
    console.error('❌ Database disconnect failed:', error);
    throw error;
  }
}

export const prisma = basePrisma;
// [FIX 2026-09-21] Preserve the existing default Prisma import API.
export default prisma;