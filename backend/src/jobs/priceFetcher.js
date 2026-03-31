// =============================================================
// 🕐 Price Fetcher - Cron Job (كل 5 دقائق)
// جلب الأسعار من مصادر خارجية تلقائياً
// =============================================================
'use strict';

const cron = require('node-cron');
const axios = require('axios');
const db = require('../config/database');
const { cache, CACHE_TTL } = require('../config/redis');
const logger = require('../config/logger');

// =============================================
// Fetch Currency Rates from External API
// =============================================
const fetchCurrencyRates = async () => {
  try {
    // Using ExchangeRate-API (free tier: 1500 req/month)
    // Base: USD, converted to SYP rates
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    
    let rates = null;

    if (apiKey) {
      // Paid API with key
      const response = await axios.get(
        `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
        { timeout: 10000 }
      );
      rates = response.data.conversion_rates;
    } else {
      // Free open API (no key needed)
      const response = await axios.get(
        'https://open.er-api.com/v6/latest/USD',
        { timeout: 10000 }
      );
      rates = response.data.rates;
    }

    if (!rates) throw new Error('No rates data received');

    // Get current USD/SYP rate from our database (manually set by admin)
    const sypResult = await db.query(
      'SELECT buy_price, sell_price FROM currencies WHERE code = $1',
      ['USD']
    );

    if (sypResult.rows.length === 0) {
      logger.warn('USD rate not found in database, skipping currency update');
      return;
    }

    const usdBuy = parseFloat(sypResult.rows[0].buy_price);
    const usdSell = parseFloat(sypResult.rows[0].sell_price);

    // Update currencies that have 'auto' source
    const currenciesResult = await db.query(
      "SELECT id, code FROM currencies WHERE source = 'auto' AND is_active = true"
    );

    const historyEntries = [];
    
    for (const currency of currenciesResult.rows) {
      if (!rates[currency.code]) continue;

      const rateVsUsd = rates[currency.code]; // e.g. EUR rate vs USD
      
      // Convert to SYP: if 1 USD = X EUR, then 1 EUR = (usdRate / rateVsUsd) SYP
      const buyPrice = Math.round((usdBuy / rateVsUsd) * 100) / 100;
      const sellPrice = Math.round((usdSell / rateVsUsd) * 100) / 100;

      await db.query(
        `UPDATE currencies SET buy_price = $1, sell_price = $2, updated_at = NOW() 
         WHERE id = $3`,
        [buyPrice, sellPrice, currency.id]
      );

      historyEntries.push({
        assetType: 'currency',
        assetCode: currency.code,
        buyPrice,
        sellPrice,
        source: 'auto',
      });
    }

    // Record history
    if (historyEntries.length > 0) {
      await recordPriceHistory(historyEntries);
    }

    // Invalidate cache
    await cache.delPattern('prices:*');
    await cache.delPattern('currencies:*');

    logger.info(`✅ Currency rates updated: ${historyEntries.length} currencies`);
    
    // Update source last fetch
    await db.query(
      `UPDATE price_sources SET last_fetch = NOW(), fetch_count = fetch_count + 1 
       WHERE source_type IN ('currency', 'all') AND is_active = true`
    );

  } catch (err) {
    logger.error('Currency fetch error:', err.message);
    await db.query(
      `UPDATE price_sources SET error_count = error_count + 1 
       WHERE source_type IN ('currency', 'all') AND is_active = true`
    );
  }
};

// =============================================
// Fetch Gold/Silver Prices
// =============================================
const fetchMetalPrices = async () => {
  try {
    const goldApiKey = process.env.GOLD_API_KEY;
    if (!goldApiKey) {
      logger.debug('No Gold API key configured, skipping metal price fetch');
      return;
    }

    // Fetch gold price (XAU)
    const goldResponse = await axios.get('https://www.goldapi.io/api/XAU/USD', {
      headers: { 'x-access-token': goldApiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    const goldOunceUsd = parseFloat(goldResponse.data.price);
    const silverResponse = await axios.get('https://www.goldapi.io/api/XAG/USD', {
      headers: { 'x-access-token': goldApiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    const silverOunceUsd = parseFloat(silverResponse.data.price);

    // Get USD/SYP rate
    const sypResult = await db.query(
      'SELECT sell_price FROM currencies WHERE code = $1',
      ['USD']
    );
    if (sypResult.rows.length === 0) return;

    const usdToSyp = parseFloat(sypResult.rows[0].sell_price);

    // Gold calculations: 1 troy ounce = 31.1035 grams
    const TROY_OUNCE_GRAMS = 31.1035;
    const goldGramUsd = goldOunceUsd / TROY_OUNCE_GRAMS;

    const karat24 = Math.round(goldGramUsd * usdToSyp);
    const karat21 = Math.round(karat24 * (21 / 24));
    const karat18 = Math.round(karat24 * (18 / 24));

    // Silver
    const silverGramUsd = silverOunceUsd / TROY_OUNCE_GRAMS;
    const silverGramSyp = Math.round(silverGramUsd * usdToSyp);

    // Update gold prices
    await db.query(
      `INSERT INTO gold_prices (karat_18, karat_21, karat_24, ounce_price_usd, source)
       VALUES ($1, $2, $3, $4, 'auto')`,
      [karat18, karat21, karat24, goldOunceUsd]
    );

    // Update silver prices
    await db.query(
      `INSERT INTO silver_prices (price_per_gram, ounce_price_usd, source)
       VALUES ($1, $2, 'auto')`,
      [silverGramSyp, silverOunceUsd]
    );

    // Record history
    await recordPriceHistory([
      { assetType: 'gold', assetCode: 'GOLD_24', buyPrice: karat24, sellPrice: karat24, priceUsd: goldOunceUsd, source: 'auto' },
      { assetType: 'gold', assetCode: 'GOLD_21', buyPrice: karat21, sellPrice: karat21, priceUsd: goldOunceUsd, source: 'auto' },
      { assetType: 'gold', assetCode: 'GOLD_18', buyPrice: karat18, sellPrice: karat18, priceUsd: goldOunceUsd, source: 'auto' },
      { assetType: 'silver', assetCode: 'SILVER', buyPrice: silverGramSyp, sellPrice: silverGramSyp, priceUsd: silverOunceUsd, source: 'auto' },
    ]);

    // Invalidate cache
    await cache.delPattern('gold:*');
    await cache.delPattern('silver:*');

    logger.info(`✅ Metal prices updated: Gold=$${goldOunceUsd}/oz, Silver=$${silverOunceUsd}/oz`);
    
  } catch (err) {
    logger.error('Metal price fetch error:', err.message);
  }
};

// =============================================
// Record Price History
// =============================================
const recordPriceHistory = async (entries) => {
  if (!entries || entries.length === 0) return;

  const values = entries.map(e => [
    e.assetType,
    e.assetCode,
    e.buyPrice || null,
    e.sellPrice || null,
    e.priceUsd || null,
    e.source || 'auto',
  ]);

  for (const vals of values) {
    await db.query(
      `INSERT INTO price_history (asset_type, asset_code, buy_price, sell_price, price_usd, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      vals
    );
  }
};

// =============================================
// Cleanup old price history (keep 90 days)
// =============================================
const cleanupOldHistory = async () => {
  try {
    const result = await db.query(
      `DELETE FROM price_history WHERE recorded_at < NOW() - INTERVAL '90 days'`
    );
    if (result.rowCount > 0) {
      logger.info(`🗑️ Cleaned up ${result.rowCount} old price history records`);
    }
  } catch (err) {
    logger.error('History cleanup error:', err.message);
  }
};

// =============================================
// Start Cron Jobs
// =============================================
const startPriceFetcher = () => {
  const intervalMinutes = parseInt(process.env.PRICE_FETCH_INTERVAL_MINUTES) || 5;
  
  // Price fetcher: every N minutes
  cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    logger.debug(`Running price fetch job (every ${intervalMinutes} min)...`);
    await fetchCurrencyRates();
    await fetchMetalPrices();
  }, {
    scheduled: true,
    timezone: 'Asia/Damascus',
  });

  // History cleanup: every day at 3 AM Damascus time
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running daily history cleanup...');
    await cleanupOldHistory();
  }, {
    scheduled: true,
    timezone: 'Asia/Damascus',
  });

  logger.info(`✅ Price fetcher scheduled: every ${intervalMinutes} minutes`);
  
  // Run immediately on startup
  setTimeout(async () => {
    logger.info('Running initial price fetch on startup...');
    await fetchCurrencyRates();
    await fetchMetalPrices();
  }, 5000); // Wait 5s for DB to be fully ready
};

module.exports = { startPriceFetcher, fetchCurrencyRates, fetchMetalPrices, recordPriceHistory };
