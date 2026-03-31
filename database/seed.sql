-- =============================================
-- 🪙 الليرة الآن - Seed Data (بيانات أولية)
-- =============================================

-- Default Admin User (Password: LiraNow@2026)
-- Hash generated with bcrypt rounds=12
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@liranow.sy', '$2b$12$placeholder_will_be_set_by_backend', 'مدير النظام', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- Initial Currencies (عملات أولية)
-- =============================================
INSERT INTO currencies (code, name_ar, name_en, symbol, flag_emoji, buy_price, sell_price, display_order, source) VALUES
('USD', 'الدولار الأمريكي', 'US Dollar', '$', '🇺🇸', 13500, 13600, 1, 'manual'),
('EUR', 'اليورو الأوروبي', 'Euro', '€', '🇪🇺', 14800, 14950, 2, 'manual'),
('TRY', 'الليرة التركية', 'Turkish Lira', '₺', '🇹🇷', 380, 395, 3, 'manual'),
('SAR', 'الريال السعودي', 'Saudi Riyal', '﷼', '🇸🇦', 3600, 3650, 4, 'manual'),
('AED', 'الدرهم الإماراتي', 'UAE Dirham', 'د.إ', '🇦🇪', 3670, 3700, 5, 'manual'),
('GBP', 'الجنيه الإسترليني', 'British Pound', '£', '🇬🇧', 17200, 17400, 6, 'manual'),
('KWD', 'الدينار الكويتي', 'Kuwaiti Dinar', 'د.ك', '🇰🇼', 44000, 44500, 7, 'manual'),
('QAR', 'الريال القطري', 'Qatari Riyal', 'ر.ق', '🇶🇦', 3700, 3750, 8, 'manual'),
('JOD', 'الدينار الأردني', 'Jordanian Dinar', 'د.أ', '🇯🇴', 19000, 19200, 9, 'manual'),
('EGP', 'الجنيه المصري', 'Egyptian Pound', 'ج.م', '🇪🇬', 270, 285, 10, 'manual'),
('CNY', 'اليوان الصيني', 'Chinese Yuan', '¥', '🇨🇳', 1850, 1900, 11, 'manual'),
('RUB', 'الروبل الروسي', 'Russian Ruble', '₽', '🇷🇺', 145, 155, 12, 'manual')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- Initial Gold Prices (أسعار الذهب)
-- =============================================
INSERT INTO gold_prices (karat_18, karat_21, karat_24, ounce_price_usd, source, notes) VALUES
(180000, 210000, 240000, 2350.00, 'manual', 'سعر افتراضي - يجب التحديث');

-- =============================================
-- Initial Silver Prices (أسعار الفضة)
-- =============================================
INSERT INTO silver_prices (price_per_gram, ounce_price_usd, source, notes) VALUES
(2500, 28.50, 'manual', 'سعر افتراضي - يجب التحديث');

-- =============================================
-- App Settings
-- =============================================
INSERT INTO app_settings (key, value, description) VALUES
('app_name', 'الليرة الآن', 'اسم التطبيق'),
('app_name_en', 'Lira Now', 'App name in English'),
('currency_base', 'SYP', 'العملة الأساسية'),
('update_interval_minutes', '5', 'فترة تحديث الأسعار بالدقائق'),
('show_gold', 'true', 'إظهار أسعار الذهب'),
('show_silver', 'true', 'إظهار أسعار الفضة'),
('telegram_channel', '', 'رابط قناة التيليغرام'),
('whatsapp_number', '', 'رقم الواتساب'),
('website_url', '', 'رابط الموقع الإلكتروني'),
('price_disclaimer', 'الأسعار للاستدلال فقط ولا تُعدّ عرضاً تجارياً ملزماً', 'إخلاء المسؤولية'),
('maintenance_mode', 'false', 'وضع الصيانة')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- Ads Configuration (مواضع الإعلانات)
-- =============================================
INSERT INTO ads_config (platform, placement, ad_unit_id, is_active, config_json) VALUES
('adsense', 'home_top_banner', NULL, false, '{"width": "728px", "height": "90px", "type": "leaderboard"}'),
('adsense', 'home_sidebar', NULL, false, '{"width": "300px", "height": "250px", "type": "medium_rectangle"}'),
('adsense', 'currency_list_banner', NULL, false, '{"width": "320px", "height": "50px", "type": "mobile_banner"}'),
('adsense', 'footer_banner', NULL, false, '{"width": "728px", "height": "90px", "type": "leaderboard"}'),
('admob', 'app_banner', NULL, false, '{"type": "banner", "size": "SMART_BANNER"}'),
('admob', 'app_interstitial', NULL, false, '{"type": "interstitial", "frequency_cap": 3}'),
('admob', 'app_rewarded', NULL, false, '{"type": "rewarded"}')
ON CONFLICT (platform, placement) DO NOTHING;

-- =============================================
-- Price Sources (مصادر الأسعار الخارجية)
-- =============================================
INSERT INTO price_sources (name, url, source_type, is_active) VALUES
('ExchangeRate-API (Free)', 'https://open.er-api.com/v6/latest/USD', 'currency', true),
('Gold-API.com', 'https://www.goldapi.io/api/XAU/USD', 'gold', false),
('Metal Price API', 'https://metals-api.com/api/latest', 'all', false)
ON CONFLICT DO NOTHING;

-- =============================================
-- Sample Activity Log Entry
-- =============================================
INSERT INTO activity_log (action, entity_type, description, user_email) VALUES
('SYSTEM_INIT', 'system', 'تم تهيئة النظام لأول مرة', 'system@liranow.sy');
