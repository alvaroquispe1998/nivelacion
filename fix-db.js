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
        console.log('Running query to add reportsJson...');
        await connection.query('ALTER TABLE leveling_runs ADD COLUMN reportsJson JSON NULL AFTER configJson');
        console.log('Success!');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists!');
        } else {
            console.error('Error:', err);
        }
    } finally {
        await connection.end();
    }
}
run();
