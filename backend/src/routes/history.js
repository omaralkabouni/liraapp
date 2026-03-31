// =============================================================
// History Routes - بيانات السجل التاريخي للرسوم البيانية
// =============================================================
'use strict';

const express = require('express');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET /api/admin/history?asset=USD&range=1d
router.get('/', async (req, res) => {
  try {
    const { asset = 'USD', range = '1d', asset_type = 'currency' } = req.query;
    
    // Determine time range
    const rangeMap = {
      '1h': '1 hour',
      '6h': '6 hours',
      '1d': '1 day',
      '1w': '7 days',
      '1m': '30 days',
      '3m': '90 days',
    };
    const timeRange = rangeMap[range] || '1 day';

    const cacheKey = `history:${asset}:${range}`;
    const cacheTTL = range === '1h' ? CACHE_TTL.HISTORY_1H : 
                     range === '1d' ? CACHE_TTL.HISTORY_1D :
                     range === '1w' ? CACHE_TTL.HISTORY_1W : CACHE_TTL.HISTORY_1M;
    
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Determine grouping interval for chart (fewer points = faster render)
    const groupInterval = range === '1h' ? '5 minutes' :
                          range === '6h' ? '30 minutes' :
                          range === '1d' ? '30 minutes' :
                          range === '1w' ? '6 hours' : '1 day';

    const result = await db.query(
      `SELECT
        date_trunc($1, recorded_at) AS time,
        AVG(buy_price)::NUMERIC(15,2) AS buy_price,
        AVG(sell_price)::NUMERIC(15,2) AS sell_price,
        MIN(buy_price)::NUMERIC(15,2) AS low,
        MAX(sell_price)::NUMERIC(15,2) AS high,
        COUNT(*) AS sample_count
       FROM price_history
       WHERE asset_code = $2
         AND asset_type = $3
         AND recorded_at > NOW() - INTERVAL '${timeRange}'
       GROUP BY date_trunc($1, recorded_at)
       ORDER BY time ASC`,
      [groupInterval, asset.toUpperCase(), asset_type]
    );

    const data = {
      asset,
      range,
      points: result.rows,
      count: result.rows.length,
    };

    await cache.set(cacheKey, data, cacheTTL);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
