import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { getDbPool } from './config/db';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  try {
    // Verify database connection at startup
    await getDbPool();
    console.log('[Database] MSSQL connection initialized.');

    app.listen(PORT, () => {
      console.log(`[TheraTrack Backend] Server listening on http://localhost:${PORT}`);
    });
  } catch (err: any) {
    console.error('[Startup Error] Failed to initialize backend server:', err.message);
    process.exit(1);
  }
}

startServer();
