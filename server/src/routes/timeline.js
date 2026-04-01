/**
 * Timeline (时间线) API — public post feed, Xiaohongshu-style
 *
 * POST   /api/timeline            — create a post (text + media + anonymous)
 * GET    /api/timeline            — paginated feed (all users)
 * GET    /api/timeline/:id        — single post detail
 * DELETE /api/timeline/:id        — delete own post
 * POST   /api/timeline/:id/like   — toggle like
 * GET    /api/timeline/:id/comments — list comments
 * POST   /api/timeline/:id/comments — add comment
 * DELETE /api/timeline/:postId/comments/:commentId — delete comment
 */
const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { getDb } = require('../db/mysql');

const router = express.Router();
router.use(authMiddleware);

// ── Init tables ────────────────────────────────────────────────────────
async function initTimelineTables() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS timeline_posts (
      id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id       VARCHAR(36)     NOT NULL,
      text_content  VARCHAR(2000)   NOT NULL DEFAULT '',
      is_anonymous  TINYINT(1)      NOT NULL DEFAULT 0,
      created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tl_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS timeline_media (
      id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      post_id     BIGINT UNSIGNED NOT NULL,
      url         TEXT            NOT NULL,
      media_type  ENUM('image','video') NOT NULL DEFAULT 'image',
      thumbnail   TEXT            DEFAULT NULL,
      duration    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
      INDEX idx_tl_media_post (post_id),
      FOREIGN KEY (post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS timeline_likes (
      id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      post_id     BIGINT UNSIGNED NOT NULL,
      user_id     VARCHAR(36)     NOT NULL,
      created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_tl_like (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS timeline_comments (
      id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      post_id       BIGINT UNSIGNED NOT NULL,
      user_id       VARCHAR(36)     NOT NULL,
      is_anonymous  TINYINT(1)      NOT NULL DEFAULT 0,
      text_content  VARCHAR(512)    NOT NULL,
      created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tl_comment_post (post_id),
      FOREIGN KEY (post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✅ Timeline tables ready');
}

module.exports = router;
module.exports.initTimelineTables = initTimelineTables;

// ── Helper: mask anonymous user info ───────────────────────────────────
function maskAnon(row, viewerId) {
  if (row.is_anonymous && row.user_id !== viewerId) {
    return { ...row, user_id: null, nickname: null, avatar: null };
  }
  return row;
}

// ── GET /  — paginated feed ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const before = req.query.before ? Number(req.query.before) : null;
    const limit = 20;

    let where = '';
    const params = [];
    if (before) { where = 'WHERE p.id < ?'; params.push(before); }

    const [posts] = await db.query(`
      SELECT p.id, p.user_id, p.text_content, p.is_anonymous, p.created_at,
             u.nickname, u.avatar,
             (SELECT COUNT(*) FROM timeline_likes WHERE post_id = p.id) AS like_count,
             (SELECT COUNT(*) FROM timeline_comments WHERE post_id = p.id) AS comment_count,
             EXISTS(SELECT 1 FROM timeline_likes WHERE post_id = p.id AND user_id = ?) AS liked
      FROM timeline_posts p
      JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.id DESC
      LIMIT ?
    `, [userId, ...params, limit]);

    // Get first media for each post (cover image)
    const postIds = posts.map(p => p.id);
    let mediaMap = {};
    if (postIds.length) {
      const [media] = await db.query(`
        SELECT post_id, url, media_type, thumbnail, duration
        FROM timeline_media
        WHERE post_id IN (?) AND sort_order = 0
      `, [postIds]);
      for (const m of media) { mediaMap[m.post_id] = m; }
    }

    // Also get total media count per post
    let mediaCountMap = {};
    if (postIds.length) {
      const [counts] = await db.query(`
        SELECT post_id, COUNT(*) AS media_count
        FROM timeline_media
        WHERE post_id IN (?)
        GROUP BY post_id
      `, [postIds]);
      for (const c of counts) { mediaCountMap[c.post_id] = c.media_count; }
    }

    const result = posts.map(p => {
      const masked = maskAnon(p, userId);
      return {
        ...masked,
        liked: !!p.liked,
        cover: mediaMap[p.id] || null,
        media_count: mediaCountMap[p.id] || 0,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /:id — single post detail ──────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const postId = req.params.id;

    const [[post]] = await db.query(`
      SELECT p.id, p.user_id, p.text_content, p.is_anonymous, p.created_at,
             u.nickname, u.avatar,
             (SELECT COUNT(*) FROM timeline_likes WHERE post_id = p.id) AS like_count,
             EXISTS(SELECT 1 FROM timeline_likes WHERE post_id = p.id AND user_id = ?) AS liked
      FROM timeline_posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
    `, [userId, postId]);

    if (!post) return res.status(404).json({ error: 'Post not found' });

    const [media] = await db.query(`
      SELECT url, media_type, thumbnail, duration, sort_order
      FROM timeline_media WHERE post_id = ? ORDER BY sort_order
    `, [postId]);

    const [comments] = await db.query(`
      SELECT c.id, c.user_id, c.is_anonymous, c.text_content, c.created_at,
             u.nickname, u.avatar
      FROM timeline_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId]);

    const masked = maskAnon(post, userId);
    masked.liked = !!post.liked;
    masked.media = media;
    masked.comments = comments.map(c => maskAnon(c, userId));

    res.json(masked);
  } catch (err) { next(err); }
});

// ── POST / — create post ───────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { text_content = '', media = [], is_anonymous = false } = req.body;

    if (!text_content.trim() && !media.length) {
      return res.status(400).json({ error: 'Post must have text or media' });
    }
    if (text_content.length > 2000) {
      return res.status(400).json({ error: 'Text exceeds 2000 characters' });
    }
    if (media.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 media items' });
    }

    const [result] = await db.query(
      'INSERT INTO timeline_posts (user_id, text_content, is_anonymous) VALUES (?, ?, ?)',
      [userId, text_content.trim(), is_anonymous ? 1 : 0]
    );
    const postId = result.insertId;

    // Insert media
    if (media.length) {
      const values = media.map((m, i) => [
        postId, m.url, m.media_type || 'image', m.thumbnail || null, m.duration || 0, i,
      ]);
      await db.query(
        'INSERT INTO timeline_media (post_id, url, media_type, thumbnail, duration, sort_order) VALUES ?',
        [values]
      );
    }

    res.json({ id: postId });
  } catch (err) { next(err); }
});

// ── DELETE /:id — delete own post ──────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const [result] = await db.query(
      'DELETE FROM timeline_posts WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (!result.affectedRows) return res.status(403).json({ error: 'Forbidden' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /:id/like — toggle like ───────────────────────────────────────
router.post('/:id/like', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const postId = req.params.id;
    const [[existing]] = await db.query(
      'SELECT id FROM timeline_likes WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );
    if (existing) {
      await db.query('DELETE FROM timeline_likes WHERE id = ?', [existing.id]);
    } else {
      await db.query(
        'INSERT INTO timeline_likes (post_id, user_id) VALUES (?, ?)',
        [postId, userId]
      );
    }
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM timeline_likes WHERE post_id = ?', [postId]
    );
    res.json({ liked: !existing, like_count: cnt });
  } catch (err) { next(err); }
});

// ── GET /:id/comments — list comments ──────────────────────────────────
router.get('/:id/comments', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const [comments] = await db.query(`
      SELECT c.id, c.user_id, c.is_anonymous, c.text_content, c.created_at,
             u.nickname, u.avatar
      FROM timeline_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(comments.map(c => maskAnon(c, userId)));
  } catch (err) { next(err); }
});

// ── POST /:id/comments — add comment ──────────────────────────────────
router.post('/:id/comments', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { text, is_anonymous = false } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Empty comment' });
    if (text.length > 512) return res.status(400).json({ error: 'Comment too long' });

    const [result] = await db.query(
      'INSERT INTO timeline_comments (post_id, user_id, is_anonymous, text_content) VALUES (?, ?, ?, ?)',
      [req.params.id, userId, is_anonymous ? 1 : 0, text.trim()]
    );

    const [[row]] = await db.query(`
      SELECT c.id, c.user_id, c.is_anonymous, c.text_content, c.created_at,
             u.nickname, u.avatar
      FROM timeline_comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `, [result.insertId]);

    res.json(maskAnon(row, userId));
  } catch (err) { next(err); }
});

// ── DELETE /:postId/comments/:commentId ────────────────────────────────
router.delete('/:postId/comments/:commentId', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const [result] = await db.query(
      'DELETE FROM timeline_comments WHERE id = ? AND user_id = ?',
      [req.params.commentId, userId]
    );
    if (!result.affectedRows) return res.status(403).json({ error: 'Forbidden' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
