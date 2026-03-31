// =============================================================
// Ads Routes - مساحات الإعلانات
// =============================================================
'use strict';

const express = require('express');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/activityService');
const router = express.Router();

router.use(authenticate);

// GET /api/admin/ads
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ads_config ORDER BY platform, placement');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/ads/:id
router.put('/:id', async (req, res) => {
  try {
    const { ad_unit_id, is_active, config_json } = req.body;

    const result = await db.query(
      `UPDATE ads_config SET
        ad_unit_id = COALESCE($1, ad_unit_id),
        is_active = COALESCE($2, is_active),
        config_json = COALESCE($3, config_json),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [ad_unit_id, is_active, config_json ? JSON.stringify(config_json) : null, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'الإعلان غير موجود' });

    await logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'UPDATE_ADS', entityType: 'ads', entityId: req.params.id,
      description: `عدّل ${req.user.full_name} إعدادات الإعلان: ${result.rows[0].placement}`,
      ipAddress: req.ip,
    });

    await cache.delPattern('ads:*');
    res.json({ success: true, ad: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
