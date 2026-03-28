/**
 * Telegram Sticker Proxy — fetches sticker set metadata and image files
 * via the Telegram Bot API, caching results in memory.
 */
const express = require('express');
const router = express.Router();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_API = `https://api.telegram.org/bot${TOKEN}`;
const TG_FILE = `https://api.telegram.org/file/bot${TOKEN}`;

// ── In-memory caches ────────────────────────────────────────
const setCache = new Map();   // name → { data, ts }
const fileCache = new Map();  // file_id → { buffer, mime, ts }
const SET_TTL = 3600_000;     // 1 hour
const FILE_TTL = 3600_000;

// ── GET /api/stickers/set/:name — sticker set metadata ──────
router.get('/set/:name', async (req, res) => {
  if (!TOKEN) return res.status(503).json({ error: 'Telegram bot token not configured' });

  const { name } = req.params;
  const cached = setCache.get(name);
  if (cached && Date.now() - cached.ts < SET_TTL) return res.json(cached.data);

  try {
    const r = await fetch(`${TG_API}/getStickerSet?name=${encodeURIComponent(name)}`);
    const json = await r.json();
    if (!json.ok) return res.status(404).json({ error: json.description || 'Sticker set not found' });

    const set = json.result;
    const data = {
      name: set.name,
      title: set.title,
      sticker_type: set.sticker_type,
      stickers: set.stickers.map(s => ({
        file_id: s.file_id,
        file_unique_id: s.file_unique_id,
        width: s.width,
        height: s.height,
        is_animated: s.is_animated,
        is_video: s.is_video,
        emoji: s.emoji,
        thumb_file_id: s.thumbnail?.file_id || null,
      })),
    };
    setCache.set(name, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('[stickers] getStickerSet error:', err.message);
    res.status(502).json({ error: 'Failed to fetch sticker set' });
  }
});

// ── GET /api/stickers/file/:file_id — proxy sticker image ───
router.get('/file/:file_id', async (req, res) => {
  if (!TOKEN) return res.status(503).json({ error: 'Telegram bot token not configured' });

  const { file_id } = req.params;
  const cached = fileCache.get(file_id);
  if (cached && Date.now() - cached.ts < FILE_TTL) {
    res.set('Content-Type', cached.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  try {
    // Step 1: getFile to obtain file_path
    const fr = await fetch(`${TG_API}/getFile?file_id=${encodeURIComponent(file_id)}`);
    const fj = await fr.json();
    if (!fj.ok) return res.status(404).json({ error: 'File not found' });

    const filePath = fj.result.file_path;

    // Step 2: Download the actual file
    const dlr = await fetch(`${TG_FILE}/${filePath}`);
    if (!dlr.ok) return res.status(502).json({ error: 'Failed to download sticker' });

    const buffer = Buffer.from(await dlr.arrayBuffer());
    const mime = filePath.endsWith('.webm') ? 'video/webm'
               : filePath.endsWith('.tgs')  ? 'application/gzip'
               : 'image/webp';

    fileCache.set(file_id, { buffer, mime, ts: Date.now() });

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('[stickers] getFile error:', err.message);
    res.status(502).json({ error: 'Failed to fetch sticker file' });
  }
});

module.exports = router;
