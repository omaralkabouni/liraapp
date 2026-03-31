// =============================================================
// Settings Routes - إعدادات التطبيق
// =============================================================
'use strict';

const express = require('express');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/activityService');
const router = express.Router();

router.use(authenticate);

// GET /api/admin/settings
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'settings:all';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query('SELECT * FROM app_settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    
    await cache.set(cacheKey, settings, CACHE_TTL.SETTINGS);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings - تحديث إعداد أو أكثر
router.put('/', async (req, res) => {
  try {
    const updates = req.body; // { key: value, key2: value2, ... }
    
    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }

    await logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'UPDATE_SETTINGS', entityType: 'settings',
      newValue: updates,
      description: `عدّل ${req.user.full_name} إعدادات التطبيق: ${Object.keys(updates).join(', ')}`,
      ipAddress: req.ip,
    });

    await cache.delPattern('settings:*');
    res.json({ success: true, message: 'تم تحديث الإعدادات' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settings/dashboard-summary
router.get('/dashboard-summary', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM v_dashboard_summary');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
