const mysql = require('./node_modules/mysql2/promise');
const fs = require('fs');

async function run() {
    let env = {};
    try {
        const data = fs.readFileSync('.env', 'utf8');
        data.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
        });
    } catch (e) { }

    const connection = await mysql.createConnection({
        host: env.DB_HOST || '127.0.0.1',
        port: Number(env.DB_PORT || 3307),
        user: env.DB_USER || 'root',
        password: env.DB_PASS || 'root_pass',
        database: env.DB_NAME || 'uai',
    });

    try {
        console.log('Running test query...');
        const [rows] = await connection.query(`
      SELECT
        id,
        periodId,
        status,
        configJson,
        reportsJson,
        sourceFileHash,
        createdBy,
        createdAt,
        updatedAt
      FROM leveling_runs
      WHERE id = ?
      LIMIT 1
    `, ['8c1d26e6-0f7f-4199-b562-025d3931b01f']);
        console.log('Result:', rows);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}
run();
