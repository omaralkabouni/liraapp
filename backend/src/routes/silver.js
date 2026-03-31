// =============================================================
// Silver Routes - إدارة أسعار الفضة
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

// GET /api/admin/silver
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'silver:current';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query('SELECT * FROM silver_prices ORDER BY created_at DESC LIMIT 1');
    const data = result.rows[0] || null;
    if (data) await cache.set(cacheKey, data, CACHE_TTL.SILVER);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/silver
router.put('/',
  body('price_per_gram').isFloat({ min: 0 }),
  body('ounce_price_usd').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'بيانات غير صحيحة' });

    try {
      const oldResult = await db.query('SELECT * FROM silver_prices ORDER BY created_at DESC LIMIT 1');
      const old = oldResult.rows[0];

      const { price_per_gram, ounce_price_usd, notes } = req.body;

      const result = await db.query(
        `INSERT INTO silver_prices (price_per_gram, ounce_price_usd, source, notes)
         VALUES ($1, COALESCE($2, $3), 'manual', $4) RETURNING *`,
        [price_per_gram, ounce_price_usd, old?.ounce_price_usd || 0, notes || null]
      );

      await recordPriceHistory([{
        assetType: 'silver', assetCode: 'SILVER',
        buyPrice: price_per_gram, sellPrice: price_per_gram, source: 'manual',
      }]);

      await logActivity({
        userId: req.user.id, userEmail: req.user.email,
        action: 'UPDATE_SILVER_PRICE', entityType: 'silver',
        oldValue: old ? { price_per_gram: old.price_per_gram } : null,
        newValue: { price_per_gram },
        description: `عدّل ${req.user.full_name} سعر الفضة من ${old?.price_per_gram || 0} إلى ${price_per_gram} ل.س/غرام`,
        ipAddress: req.ip,
      });

      await cache.delPattern('silver:*');
      res.json({ success: true, silver: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
