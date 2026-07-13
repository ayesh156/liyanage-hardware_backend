import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
console.log('URL:', process.env.DATABASE_URL);
try {
  await prisma.$connect();
  console.log('Connected!');
  const count = await prisma.inventoryProduct.count();
  console.log('Count:', count);
  await prisma.$disconnect();
} catch (e) {
  console.log('Error:', e.message?.substring(0, 200));
}