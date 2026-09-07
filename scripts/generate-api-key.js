import crypto from 'node:crypto';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/generate-api-key.js <id>');
  process.exit(1);
}

const key = crypto.randomBytes(32).toString('base64url');
const hash = crypto.createHash('sha256').update(key).digest('hex');
console.log(`Bearer token: ${key}`);
console.log(JSON.stringify({ id, hash, scopes: ['models', 'chat'] }));
