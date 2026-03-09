const crypto = require('crypto');
const secret = 'dev_jwt_secret_change_me';
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ sub: 'x', username: 'admin', roles: ['ADMINISTRADOR_UAI'], exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const signature = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
console.log(header + '.' + payload + '.' + signature);
