/**
 * Upload route — stores files in Cloudflare R2 (S3-compatible)
 * Always returns a server-relative URL /api/files/:objectName
 * so that files.js can proxy from R2 (or disk fallback) on demand.
 *
 * POST /api/upload
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middlewares/auth');
const { putObject } = require('../db/r2');

const router = express.Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/', 'audio/', 'video/', 'application/'];
    const ok = allowed.some(t => file.mimetype.startsWith(t));
    cb(ok ? null : new Error('File type not allowed'), ok);
  },
});

// POST /api/upload
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const ext = path.extname(req.file.originalname) || '';
    const objectName = `${uuidv4()}${ext}`;

    await putObject(objectName, req.file.buffer, req.file.mimetype);

    // If a public CDN URL is configured, return it directly (stored in DB, no proxy needed)
    const base = process.env.R2_PUBLIC_URL;
    const url = base
      ? `${base.replace(/\/$/, '')}/${objectName}`
      : `/api/files/${objectName}`;

    res.json({ url, name: req.file.originalname, size: req.file.size, type: req.file.mimetype });
  } catch (err) { next(err); }
});

module.exports = router;
