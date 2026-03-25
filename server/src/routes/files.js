/**
 * File proxy — serves uploaded files from R2 or local disk.
 * GET /api/files/:objectName  — no auth required
 *
 * If R2_PUBLIC_URL is set, redirects to CDN directly (fastest).
 * Otherwise streams from R2 or local disk through this server.
 */
const express = require('express');
const { getObject, r2Enabled } = require('../db/r2');

const router = express.Router();

router.get('/:objectName', async (req, res, next) => {
  try {
    const { objectName } = req.params;
    if (!objectName || objectName.includes('..') || objectName.includes('/')) {
      return res.status(400).json({ error: 'Invalid object name' });
    }

    // Fast path: redirect to public CDN
    if (process.env.R2_PUBLIC_URL) {
      const base = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
      return res.redirect(302, `${base}/${objectName}`);
    }

    const { stream, contentType, contentLength } = await getObject(objectName);

    if (contentType)   res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    stream.pipe(res);
    stream.on('error', next);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'File not found' });
    }
    next(err);
  }
});

module.exports = router;
