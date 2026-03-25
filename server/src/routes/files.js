/**
 * File proxy — serves uploaded files from MinIO through the app server.
 * This is needed because MinIO runs as an internal service in production
 * (Zeabur, Docker) and is not directly reachable from browsers.
 *
 * GET /api/files/:objectName  — no auth required (files are semi-public by URL)
 */
const express = require('express');
const { getMinioClient, BUCKET } = require('../db/minio');

const router = express.Router();

router.get('/:objectName', async (req, res, next) => {
  try {
    const { objectName } = req.params;
    if (!objectName || objectName.includes('..') || objectName.includes('/')) {
      return res.status(400).json({ error: 'Invalid object name' });
    }

    const mc = getMinioClient();

    // Get object stat for Content-Type and size
    let stat;
    try {
      stat = await mc.statObject(BUCKET, objectName);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', stat.metaData['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = await mc.getObject(BUCKET, objectName);
    stream.pipe(res);
    stream.on('error', next);
  } catch (err) { next(err); }
});

module.exports = router;
