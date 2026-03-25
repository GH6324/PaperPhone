const Minio = require('minio');

let minioClient;

function getMinioClient() {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
  }
  return minioClient;
}

const BUCKET = process.env.MINIO_BUCKET || 'paperphone';

async function ensureBucket() {
  const mc = getMinioClient();
  const exists = await mc.bucketExists(BUCKET);
  if (!exists) {
    await mc.makeBucket(BUCKET, 'us-east-1');
    // Set public read policy
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      }],
    });
    await mc.setBucketPolicy(BUCKET, policy);
    console.log(`✅ MinIO bucket '${BUCKET}' created`);
  } else {
    console.log(`✅ MinIO bucket '${BUCKET}' ready`);
  }
}

async function uploadFile(objectName, buffer, mimetype) {
  const mc = getMinioClient();
  await mc.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': mimetype });
  // Return a URL served through the app server so it works regardless of MinIO's
  // network topology (internal service on Zeabur, Docker, etc.)
  return `/api/files/${objectName}`;
}

module.exports = { getMinioClient, ensureBucket, uploadFile, BUCKET };
