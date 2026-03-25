const { createClient } = require('redis');

let client;

async function connectRedis({ retries = 10, delay = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASS || undefined,
    });

    client.on('error', err => console.error('Redis error:', err));

    try {
      await client.connect();
      console.log('✅ Redis connected');
      return client;
    } catch (err) {
      await client.quit().catch(() => {});
      if (attempt === retries) throw err;
      console.warn(`⏳ Redis not ready (attempt ${attempt}/${retries}), retrying in ${delay / 1000}s… [${err.message}]`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function getRedis() {
  if (!client) throw new Error('Redis not initialized. Call connectRedis() first.');
  return client;
}

module.exports = { connectRedis, getRedis };
