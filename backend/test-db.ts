import { checkDbHealth } from './src/config/db';

async function main() {
  const result = await checkDbHealth();
  console.log('MSSQL HEALTH RESULT:', JSON.stringify(result));
  process.exit(result.status === 'healthy' ? 0 : 1);
}

main();
