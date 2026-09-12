import 'dotenv/config';
import { prisma } from './lib/prisma';

await prisma.$executeRawUnsafe(`SET GLOBAL max_connections = 25;`);

async function monitorDatabase() {
  console.log('🔄 Connecting to Database Monitor...');
  
  setInterval(async () => {
    try {
      // Direct MySQL status query through existing Prisma connection
      const results = await prisma.$queryRaw<Array<{ Variable_name: string; Value: string }>>`
        SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Max_used_connections')
      `;

      console.clear();
      console.log('=== 📊 MySQL Live Connections Monitor ===');
      console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
      console.table(results);
    } catch (error) {
      console.error('❌ Monitor Query Error:', (error as Error).message);
    }
  }, 1000);
}

monitorDatabase();