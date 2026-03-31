// =============================================================
// Currencies Routes - إدارة العملات
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

// Apply auth to all routes
router.use(authenticate);

// GET /api/admin/currencies
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'currencies:all';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query(
      'SELECT * FROM currencies ORDER BY display_order, code'
    );
    
    await cache.set(cacheKey, result.rows, CACHE_TTL.CURRENCIES);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/currencies - إضافة عملة جديدة
router.post('/',
  body('code').isLength({ min: 2, max: 10 }).toUpperCase(),
  body('name_ar').notEmpty(),
  body('name_en').notEmpty(),
  body('symbol').notEmpty(),
  body('buy_price').isFloat({ min: 0 }),
  body('sell_price').isFloat({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'بيانات غير صحيحة', details: errors.array() });
    }

    try {
      const { code, name_ar, name_en, symbol, flag_emoji, buy_price, sell_price, display_order, source } = req.body;
      
      const result = await db.query(
        `INSERT INTO currencies (code, name_ar, name_en, symbol, flag_emoji, buy_price, sell_price, display_order, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [code.toUpperCase(), name_ar, name_en, symbol, flag_emoji || '', buy_price, sell_price, display_order || 0, source || 'manual']
      );

      const currency = result.rows[0];

      // Record in history
      await recordPriceHistory([{
        assetType: 'currency', assetCode: currency.code,
        buyPrice: buy_price, sellPrice: sell_price, source: 'manual',
      }]);

      // Log activity
      await logActivity({
        userId: req.user.id, userEmail: req.user.email,
        action: 'ADD_CURRENCY', entityType: 'currency', entityId: currency.id,
        newValue: currency,
        description: `أضاف ${req.user.full_name} عملة جديدة: ${name_ar} (${code})`,
        ipAddress: req.ip,
      });

      await cache.delPattern('currencies:*');
      res.status(201).json({ success: true, currency });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: `العملة ${req.body.code} موجودة مسبقاً` });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/admin/currencies/:id - تعديل عملة
router.put('/:id',
  body('buy_price').optional().isFloat({ min: 0 }),
  body('sell_price').optional().isFloat({ min: 0 }),
  async (req, res) => {
    try {
      // Get old value first
      const oldResult = await db.query('SELECT * FROM currencies WHERE id = $1', [req.params.id]);
      if (oldResult.rows.length === 0) {
        return res.status(404).json({ error: 'العملة غير موجودة' });
      }
      const oldCurrency = oldResult.rows[0];

      const { name_ar, name_en, symbol, flag_emoji, buy_price, sell_price, display_order, is_active, source } = req.body;

      const result = await db.query(
        `UPDATE currencies SET
          name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          symbol = COALESCE($3, symbol),
          flag_emoji = COALESCE($4, flag_emoji),
          buy_price = COALESCE($5, buy_price),
          sell_price = COALESCE($6, sell_price),
          display_order = COALESCE($7, display_order),
          is_active = COALESCE($8, is_active),
          source = COALESCE($9, source),
          updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name_ar, name_en, symbol, flag_emoji, buy_price, sell_price, display_order, is_active, source, req.params.id]
      );

      const updated = result.rows[0];

      // Record history if price changed
      if (buy_price || sell_price) {
        await recordPriceHistory([{
          assetType: 'currency', assetCode: updated.code,
          buyPrice: updated.buy_price, sellPrice: updated.sell_price, source: 'manual',
        }]);
      }

      // Build human-readable description
      let changes = [];
      if (buy_price && buy_price !== oldCurrency.buy_price) changes.push(`سعر الشراء من ${oldCurrency.buy_price} إلى ${buy_price}`);
      if (sell_price && sell_price !== oldCurrency.sell_price) changes.push(`سعر البيع من ${oldCurrency.sell_price} إلى ${sell_price}`);
      if (is_active !== undefined) changes.push(is_active ? 'تفعيل العملة' : 'إيقاف العملة');

      await logActivity({
        userId: req.user.id, userEmail: req.user.email,
        action: 'UPDATE_CURRENCY', entityType: 'currency', entityId: req.params.id,
        oldValue: { buy_price: oldCurrency.buy_price, sell_price: oldCurrency.sell_price },
        newValue: { buy_price, sell_price },
        description: `عدّل ${req.user.full_name} عملة ${updated.name_ar} (${updated.code}): ${changes.join(', ') || 'تعديل عام'}`,
        ipAddress: req.ip,
      });

      await cache.delPattern('currencies:*');
      res.json({ success: true, currency: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/admin/currencies/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM currencies WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'العملة غير موجودة' });

    const deleted = result.rows[0];
    await logActivity({
      userId: req.user.id, userEmail: req.user.email,
      action: 'DELETE_CURRENCY', entityType: 'currency', entityId: req.params.id,
      oldValue: deleted,
      description: `حذف ${req.user.full_name} عملة: ${deleted.name_ar} (${deleted.code})`,
      ipAddress: req.ip,
    });

    await cache.delPattern('currencies:*');
    res.json({ success: true, message: 'تم حذف العملة' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
