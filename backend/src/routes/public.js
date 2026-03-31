// =============================================================
// Public Routes - للتطبيق والموقع (لا تتطلب مصادقة)
// =============================================================
'use strict';

const express = require('express');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const router = express.Router();

// GET /api/v1/prices - جميع الأسعار دفعة واحدة (للتطبيق)
router.get('/prices', async (req, res) => {
  try {
    const cacheKey = 'public:all_prices';
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const [currencies, gold, silver] = await Promise.all([
      db.query('SELECT * FROM v_latest_currency_prices'),
      db.query('SELECT * FROM gold_prices ORDER BY created_at DESC LIMIT 1'),
      db.query('SELECT * FROM silver_prices ORDER BY created_at DESC LIMIT 1'),
    ]);

    const settings = await db.query(
     "SELECT key, value FROM app_settings WHERE key IN ('price_disclaimer', 'app_name', 'update_interval_minutes')"
    );
    
    const settingsObj = {};
    settings.rows.forEach(r => { settingsObj[r.key] = r.value; });

    const data = {
      currencies: currencies.rows,
      gold: gold.rows[0] || null,
      silver: silver.rows[0] || null,
      settings: settingsObj,
      lastUpdated: new Date().toISOString(),
      cached: false,
    };

    await cache.set(cacheKey, data, CACHE_TTL.CURRENCIES);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/currencies - العملات فقط
router.get('/currencies', async (req, res) => {
  try {
    const cacheKey = 'public:currencies';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query('SELECT * FROM v_latest_currency_prices');
    await cache.set(cacheKey, result.rows, CACHE_TTL.CURRENCIES);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/gold - أسعار الذهب
router.get('/gold', async (req, res) => {
  try {
    const cacheKey = 'public:gold';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query('SELECT * FROM gold_prices ORDER BY created_at DESC LIMIT 1');
    const data = result.rows[0] || null;
    if (data) await cache.set(cacheKey, data, CACHE_TTL.GOLD);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/silver - أسعار الفضة
router.get('/silver', async (req, res) => {
  try {
    const cacheKey = 'public:silver';
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

// GET /api/v1/chart?asset=USD&range=1d - بيانات الرسوم البيانية (عامة)
router.get('/chart', async (req, res) => {
  try {
    const { asset = 'USD', range = '1d', asset_type = 'currency' } = req.query;

    const cacheKey = `public:chart:${asset}:${range}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rangeMap = {
      '1h': '1 hour', '6h': '6 hours', '1d': '1 day',
      '1w': '7 days', '1m': '30 days', '3m': '90 days',
    };
    const timeRange = rangeMap[range] || '1 day';
    const groupInterval = range === '1h' ? '5 minutes' :
                          range === '6h' ? '30 minutes' :
                          range === '1d' ? '30 minutes' :
                          range === '1w' ? '6 hours' : '1 day';

    const result = await db.query(
      `SELECT
        date_trunc($1, recorded_at) AS time,
        AVG(buy_price)::NUMERIC(15,2) AS open,
        MAX(sell_price)::NUMERIC(15,2) AS high,
        MIN(buy_price)::NUMERIC(15,2) AS low,
        AVG((buy_price + sell_price) / 2)::NUMERIC(15,2) AS close
       FROM price_history
       WHERE asset_code = $2
         AND asset_type = $3
         AND recorded_at > NOW() - INTERVAL '${timeRange}'
       GROUP BY date_trunc($1, recorded_at)
       ORDER BY time ASC`,
      [groupInterval, asset.toUpperCase(), asset_type]
    );

    const data = { asset, range, candles: result.rows };
    const cacheTTL = range === '1h' ? 60 : range === '1d' ? 300 : 900;
    await cache.set(cacheKey, data, cacheTTL);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/ads - مواضع الإعلانات النشطة
router.get('/ads', async (req, res) => {
  try {
    const cacheKey = 'public:ads';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const { platform } = req.query;
    let query = 'SELECT * FROM ads_config WHERE is_active = true';
    const params = [];
    if (platform) {
      query += ' AND platform = $1';
      params.push(platform);
    }
    
    const result = await db.query(query, params);
    await cache.set(cacheKey, result.rows, CACHE_TTL.ADS);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
