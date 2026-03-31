// =============================================================
// Gold Routes - إدارة أسعار الذهب
// =============================================================
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/activityService');
const { recordPriceHistory } = require('../jobs/priceFetcher');
const router = express.Router();

router.use(authenticate);

// GET /api/admin/gold - أسعار الذهب الحالية
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'gold:current';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query(
      'SELECT * FROM gold_prices ORDER BY created_at DESC LIMIT 1'
    );

    const data = result.rows[0] || null;
    if (data) await cache.set(cacheKey, data, CACHE_TTL.GOLD);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/gold - تعديل سعر الذهب يدوياً
router.put('/',
  body('karat_18').optional().isFloat({ min: 0 }),
  body('karat_21').optional().isFloat({ min: 0 }),
  body('karat_24').optional().isFloat({ min: 0 }),
  body('ounce_price_usd').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'بيانات غير صحيحة', details: errors.array() });
    }

    try {
      // Get old values
      const oldResult = await db.query('SELECT * FROM gold_prices ORDER BY created_at DESC LIMIT 1');
      const old = oldResult.rows[0];

      const { karat_18, karat_21, karat_24, ounce_price_usd, notes } = req.body;

      // Insert new row (keep full history of manual changes)
      const result = await db.query(
        `INSERT INTO gold_prices (karat_18, karat_21, karat_24, ounce_price_usd, source, notes)
         VALUES (
           COALESCE($1, $2), COALESCE($3, $4), COALESCE($5, $6), COALESCE($7, $8),
           'manual', $9
         ) RETURNING *`,
        [
          karat_18, old?.karat_18 || 0,
          karat_21, old?.karat_21 || 0,
          karat_24, old?.karat_24 || 0,
          ounce_price_usd, old?.ounce_price_usd || 0,
          notes || null,
        ]
      );

      const updated = result.rows[0];

      // Record history for each karat
      const historyEntries = [];
      if (karat_18) historyEntries.push({ assetType: 'gold', assetCode: 'GOLD_18', buyPrice: karat_18, sellPrice: karat_18, source: 'manual' });
      if (karat_21) historyEntries.push({ assetType: 'gold', assetCode: 'GOLD_21', buyPrice: karat_21, sellPrice: karat_21, source: 'manual' });
      if (karat_24) historyEntries.push({ assetType: 'gold', assetCode: 'GOLD_24', buyPrice: karat_24, sellPrice: karat_24, source: 'manual' });
      await recordPriceHistory(historyEntries);

      // Build description
      const changesArr = [];
      if (karat_18 && karat_18 !== old?.karat_18) changesArr.push(`عيار 18: ${karat_18?.toLocaleString('ar')} ل.س`);
      if (karat_21 && karat_21 !== old?.karat_21) changesArr.push(`عيار 21: ${karat_21?.toLocaleString('ar')} ل.س`);
      if (karat_24 && karat_24 !== old?.karat_24) changesArr.push(`عيار 24: ${karat_24?.toLocaleString('ar')} ل.س`);

      await logActivity({
        userId: req.user.id, userEmail: req.user.email,
        action: 'UPDATE_GOLD_PRICE', entityType: 'gold',
        oldValue: old ? { karat_18: old.karat_18, karat_21: old.karat_21, karat_24: old.karat_24 } : null,
        newValue: { karat_18, karat_21, karat_24 },
        description: `عدّل ${req.user.full_name} أسعار الذهب — ${changesArr.join('، ') || 'تعديل عام'}`,
        ipAddress: req.ip,
      });

      await cache.delPattern('gold:*');
      res.json({ success: true, gold: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
