/**
 * Cloudflare R2 storage helper (S3-compatible API)
 *
 * Required env vars:
 *   R2_ACCOUNT_ID        — Cloudflare account ID
 *   R2_ACCESS_KEY_ID     — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret key
 *   R2_BUCKET            — bucket name (default: paperphone)
 *
 * Optional:
 *   R2_PUBLIC_URL        — if set, GET /api/files/:name redirects to CDN
 *                          e.g. https://pub-xxx.r2.dev
 */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const BUCKET = process.env.R2_BUCKET || 'paperphone';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

let _client = null;

function r2Enabled() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

function getClient() {
  if (!_client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return _client;
}

/**
 * Upload a buffer to R2 (or disk as fallback).
 */
async function putObject(objectName, buffer, mimetype) {
  if (r2Enabled()) {
    await getClient().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectName,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } else {
    // Disk fallback
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, objectName), buffer);
  }
}

/**
 * Stream an object for proxying via /api/files/:objectName.
 * Returns { stream, contentType, contentLength } for R2,
 * or serves directly from disk.
 */
async function getObject(objectName) {
  if (r2Enabled()) {
    // If a public CDN URL is set, callers should redirect instead of proxying
    const res = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: objectName }));
    return { stream: res.Body, contentType: res.ContentType, contentLength: res.ContentLength };
  } else {
    // Disk fallback
    const filePath = path.join(UPLOAD_DIR, objectName);
    if (!fs.existsSync(filePath)) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    const stat = fs.statSync(filePath);
    return { stream: fs.createReadStream(filePath), contentType: null, contentLength: stat.size };
  }
}

module.exports = { putObject, getObject, r2Enabled, BUCKET };
