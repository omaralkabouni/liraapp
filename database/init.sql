-- =============================================
-- 🪙 الليرة الآن - Database Schema
-- PostgreSQL 15+
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fast text search

-- =============================================
-- USERS TABLE (Admin Users)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- CURRENCIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS currencies (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(10) UNIQUE NOT NULL,         -- e.g. USD, EUR, TRY
    name_ar      VARCHAR(100) NOT NULL,               -- الدولار الأمريكي
    name_en      VARCHAR(100) NOT NULL,               -- US Dollar
    symbol       VARCHAR(10) NOT NULL,                -- $, €, ₺
    flag_emoji   VARCHAR(10),                         -- 🇺🇸
    buy_price    NUMERIC(15, 4) NOT NULL DEFAULT 0,   -- سعر الشراء بالليرة السورية
    sell_price   NUMERIC(15, 4) NOT NULL DEFAULT 0,   -- سعر البيع بالليرة السورية
    is_active    BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,          -- ترتيب العرض
    source       VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'api')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- GOLD PRICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS gold_prices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    karat_18        NUMERIC(15, 2) NOT NULL DEFAULT 0, -- عيار 18 - سعر الغرام بالليرة
    karat_21        NUMERIC(15, 2) NOT NULL DEFAULT 0, -- عيار 21
    karat_24        NUMERIC(15, 2) NOT NULL DEFAULT 0, -- عيار 24
    ounce_price_usd NUMERIC(15, 2) NOT NULL DEFAULT 0, -- سعر الأوقية بالدولار (مرجعي)
    source          VARCHAR(50) NOT NULL DEFAULT 'manual',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- SILVER PRICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS silver_prices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    price_per_gram  NUMERIC(15, 2) NOT NULL DEFAULT 0, -- سعر الغرام بالليرة
    ounce_price_usd NUMERIC(15, 2) NOT NULL DEFAULT 0, -- سعر الأوقية بالدولار (مرجعي)
    source          VARCHAR(50) NOT NULL DEFAULT 'manual',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- PRICE HISTORY TABLE (للتحليل التاريخي والرسوم البيانية)
-- =============================================
CREATE TABLE IF NOT EXISTS price_history (
    id            BIGSERIAL PRIMARY KEY,
    asset_type    VARCHAR(20) NOT NULL CHECK (asset_type IN ('currency', 'gold', 'silver')),
    asset_code    VARCHAR(20) NOT NULL,                 -- USD, EUR, GOLD_18, GOLD_21, GOLD_24, SILVER
    buy_price     NUMERIC(15, 4),
    sell_price    NUMERIC(15, 4),
    price_usd     NUMERIC(15, 4),                       -- للذهب والفضة (سعر الدولار)
    source        VARCHAR(50) NOT NULL DEFAULT 'manual',
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- وقت التسجيل الفعلي
    
    -- Index for fast chart queries
    CONSTRAINT valid_prices CHECK (buy_price >= 0 OR sell_price >= 0)
);

-- Partition by month for better performance (optional for large datasets)
CREATE INDEX IF NOT EXISTS idx_price_history_asset_time 
    ON price_history (asset_type, asset_code, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at 
    ON price_history (recorded_at DESC);

-- =============================================
-- ACTIVITY LOG TABLE (سجل العمليات)
-- =============================================
CREATE TABLE IF NOT EXISTS activity_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email  VARCHAR(255),                           -- نحتفظ بالإيميل حتى لو حُذف المستخدم
    action      VARCHAR(100) NOT NULL,                  -- 'UPDATE_GOLD_PRICE', 'ADD_CURRENCY', etc.
    entity_type VARCHAR(50),                            -- 'gold', 'currency', 'silver', 'ads'
    entity_id   VARCHAR(100),                           -- معرف الكائن المعدَّل
    old_value   JSONB,                                  -- القيمة القديمة
    new_value   JSONB,                                  -- القيمة الجديدة
    ip_address  INET,                                   -- عنوان IP
    user_agent  TEXT,
    description TEXT NOT NULL,                          -- وصف بشري: 'قام المدير بتعديل سعر عيار 21'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log (entity_type, entity_id);

-- =============================================
-- ADS CONFIGURATION TABLE (إعدادات الإعلانات)
-- =============================================
CREATE TABLE IF NOT EXISTS ads_config (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform        VARCHAR(50) NOT NULL CHECK (platform IN ('adsense', 'admob', 'custom')),
    placement       VARCHAR(100) NOT NULL,               -- 'home_banner', 'sidebar', 'interstitial', etc.
    ad_unit_id      VARCHAR(255),                        -- Google Ad Unit ID
    is_active       BOOLEAN NOT NULL DEFAULT false,
    config_json     JSONB,                               -- إعدادات إضافية
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform, placement)
);

-- =============================================
-- APP SETTINGS TABLE (إعدادات التطبيق)
-- =============================================
CREATE TABLE IF NOT EXISTS app_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- PRICE SOURCES TABLE (مصادر الأسعار الخارجية)
-- =============================================
CREATE TABLE IF NOT EXISTS price_sources (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    url         TEXT NOT NULL,
    api_key     VARCHAR(255),
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('currency', 'gold', 'silver', 'all')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    last_fetch  TIMESTAMPTZ,
    fetch_count BIGINT NOT NULL DEFAULT 0,
    error_count BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- TRIGGERS: Auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_currencies_updated_at 
    BEFORE UPDATE ON currencies 
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_gold_updated_at 
    BEFORE UPDATE ON gold_prices 
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_silver_updated_at 
    BEFORE UPDATE ON silver_prices 
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================
-- VIEWS: Useful aggregated views
-- =============================================

-- View: Latest prices for each currency
CREATE OR REPLACE VIEW v_latest_currency_prices AS
SELECT 
    c.*,
    ph.buy_price AS prev_buy_price,
    ph.sell_price AS prev_sell_price,
    ph.recorded_at AS prev_recorded_at,
    CASE 
        WHEN ph.buy_price IS NOT NULL AND ph.buy_price != 0 
        THEN ROUND(((c.buy_price - ph.buy_price) / ph.buy_price * 100)::NUMERIC, 2)
        ELSE 0
    END AS buy_change_pct
FROM currencies c
LEFT JOIN LATERAL (
    SELECT buy_price, sell_price, recorded_at
    FROM price_history
    WHERE asset_type = 'currency' AND asset_code = c.code
    ORDER BY recorded_at DESC
    OFFSET 1 LIMIT 1
) ph ON true
WHERE c.is_active = true
ORDER BY c.display_order;

-- View: Dashboard summary
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT 
    (SELECT COUNT(*) FROM currencies WHERE is_active = true) AS active_currencies,
    (SELECT COUNT(*) FROM activity_log WHERE created_at > NOW() - INTERVAL '24 hours') AS actions_today,
    (SELECT MAX(recorded_at) FROM price_history) AS last_price_update,
    (SELECT karat_21 FROM gold_prices ORDER BY created_at DESC LIMIT 1) AS gold_21_price,
    (SELECT price_per_gram FROM silver_prices ORDER BY created_at DESC LIMIT 1) AS silver_price;
