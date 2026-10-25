import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_NAME || 'TheraTrackDb',
  user: process.env.DB_USER || 'theratrack_user',
  password: process.env.DB_PASSWORD || 'TheraTrackPassword123!',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true,
  },
  pool: {
    max: 20,
    min: 1,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  try {
    pool = await new sql.ConnectionPool(config).connect();
    console.log(`[MSSQL] Connected successfully to database '${config.database}' on '${config.server}'.`);
    return pool;
  } catch (err: any) {
    console.error('[MSSQL] Connection failed:', err.message);
    throw new Error(`Database connection failed: ${err.message}. Please check that Microsoft SQL Server is running and accessible.`);
  }
}

export async function checkDbHealth(): Promise<{ status: string; version?: string; error?: string }> {
  try {
    const p = await getDbPool();
    const result = await p.request().query('SELECT @@VERSION as version');
    return { status: 'healthy', version: result.recordset[0]?.version };
  } catch (err: any) {
    return { status: 'unhealthy', error: err.message };
  }
}

export { sql };
