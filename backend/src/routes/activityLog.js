// =============================================================
// Activity Log Routes - سجل العمليات
// =============================================================
'use strict';

const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET /api/admin/activity-log?page=1&limit=50&entity=gold&from=&to=
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const entity = req.query.entity;
    const action = req.query.action;
    const from = req.query.from;
    const to = req.query.to;
    const search = req.query.search;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (entity) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(entity);
    }
    if (action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(action);
    }
    if (from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(to);
    }
    if (search) {
      conditions.push(`description ILIKE $${paramIdx++}`);
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT al.*, u.full_name AS user_full_name
         FROM activity_log al
         LEFT JOIN users u ON al.user_id = u.id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) FROM activity_log ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      logs: dataResult.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/activity-log/stats - إحصائيات سجل العمليات
router.get('/stats', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS this_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS this_month,
        COUNT(*) AS total,
        COUNT(DISTINCT user_id) AS unique_admins
      FROM activity_log
    `);

    const actionBreakdown = await db.query(`
      SELECT action, COUNT(*) AS count
      FROM activity_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      stats: result.rows[0],
      topActions: actionBreakdown.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
