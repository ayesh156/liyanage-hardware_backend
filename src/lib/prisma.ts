import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error('❌ Critical Architecture Error: DATABASE_URL is missing in environment variables.');
}

// 1. Connection Pooling Params URL එකට සකස් කිරීම
const dbUrl = new URL(rawUrl);
dbUrl.searchParams.set('connection_limit', '5'); // උපරිම connections 5යි
dbUrl.searchParams.set('connect_timeout', '15'); // 15s handshake timeout
dbUrl.searchParams.set('pool_timeout', '15');    // 15s pool checkout timeout

// 2. Prisma 7 Engine එකට කියවීමට හැකි වන සේ process.env එකට නව URL එක overwrite කිරීම
process.env.DATABASE_URL = dbUrl.toString();

// 3. Prisma 7 Constructor එක හිස්ව (Empty) call කිරීම
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

// Worker processes recycle වීමේදී memory leaks වැළැක්වීම සඳහා Unconditional Singleton Caching
globalForPrisma.prisma = prisma;

let isConnected = false;

export function isDbConnected(): boolean {
  return isConnected;
}

// Server crash වීම වළක්වන Graceful DB Connection Handler
export async function connectDB() {
  try {
    await prisma.$connect();
    isConnected = true;
    console.log(`✅ [${dbUrl.pathname.replace(/^\//, '')}] Prisma Native Engine connected successfully (Pool: 5, Timeout: 15s)`);
  } catch (error) {
    isConnected = false;
    console.error('❌ Database connection queue timeout or failure:', error);
  }
}

export default prisma;