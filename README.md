# 🪙 الليرة الآن — Lira Now

**نظام متكامل لعرض وإدارة أسعار الصرف والذهب والفضة في سوريا**

---

## 🏗️ هيكل المشروع

```
lira-now/
├── 📄 PROJECT_STATE.md        ← ذاكرة المشروع (يُحدَّث دائماً)
├── 📄 docker-compose.yml      ← ربط جميع الخدمات
├── 📄 .env.example            ← متغيرات البيئة (نسخ إلى .env)
├── 📄 deploy.sh               ← سكريبت النشر على VPS
├── 🗄️ database/
│   ├── init.sql               ← هيكل قاعدة البيانات
│   └── seed.sql               ← بيانات أولية
├── 🚀 backend/                ← Node.js + Express API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js             ← نقطة البداية
│       ├── config/
│       │   ├── database.js    ← PostgreSQL Pool
│       │   ├── redis.js       ← Redis Cache
│       │   └── logger.js      ← Winston Logger
│       ├── middleware/
│       │   └── auth.js        ← JWT Authentication
│       ├── routes/
│       │   ├── public.js      ← APIs عامة (للتطبيق والموقع)
│       │   ├── auth.js        ← تسجيل الدخول
│       │   ├── currencies.js  ← إدارة العملات
│       │   ├── gold.js        ← أسعار الذهب
│       │   ├── silver.js      ← أسعار الفضة
│       │   ├── history.js     ← التاريخية (للرسوم البيانية)
│       │   ├── activityLog.js ← سجل العمليات
│       │   ├── ads.js         ← إعدادات الإعلانات
│       │   └── settings.js    ← إعدادات التطبيق
│       ├── services/
│       │   ├── authService.js     ← bcrypt + JWT
│       │   └── activityService.js ← تسجيل العمليات
│       └── jobs/
│           └── priceFetcher.js    ← Cron Job كل 5 دقائق
├── 🎛️ admin-panel/            ← لوحة التحكم الإدارية
│   ├── Dockerfile
│   ├── nginx-admin.conf
│   └── public/
│       ├── index.html         ← واجهة HTML
│       ├── style.css          ← Dark Theme
│       └── app.js             ← JavaScript
└── 🌐 nginx/                  ← Reverse Proxy
    ├── nginx.conf
    └── conf.d/
        └── default.conf
```

---

## 🚀 الإعداد السريع

### 1. على الـ VPS (Linux)
```bash
# استنسخ المشروع
git clone https://github.com/YOUR_USERNAME/liranow.git /opt/liranow
cd /opt/liranow

# انسخ وعدّل ملف البيئة
cp .env.example .env
nano .env  # عدّل كلمات المرور والمفاتيح!

# شغّل سكريبت النشر
chmod +x deploy.sh
./deploy.sh
```

### 2. للتطوير المحلي
```bash
# شغّل فقط قاعدة البيانات و Redis
docker-compose up -d postgres redis

# ثبّت المكتبات وشغّل الـ API
cd backend
npm install
npm run dev

# افتح Admin Panel على المتصفح
# ملاحظة: عدّل API_BASE في app.js إلى http://localhost:3001
```

---

## 📡 API Endpoints

### عامة (بدون مصادقة)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/v1/prices` | **جميع الأسعار دفعة واحدة** (للتطبيق) |
| GET | `/api/v1/currencies` | قائمة العملات مع التغيير |
| GET | `/api/v1/gold` | أسعار الذهب (18، 21، 24) |
| GET | `/api/v1/silver` | سعر الفضة |
| GET | `/api/v1/chart?asset=USD&range=1d` | بيانات الرسوم البيانية |
| GET | `/api/v1/ads?platform=adsense` | إعلانات نشطة |
| GET | `/health` | حالة الخدمات |

### إدارية (JWT مطلوب)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/admin/auth/login` | تسجيل الدخول |
| GET | `/api/admin/auth/me` | بيانات المستخدم الحالي |
| GET | `/api/admin/currencies` | كل العملات |
| POST | `/api/admin/currencies` | إضافة عملة |
| PUT | `/api/admin/currencies/:id` | تعديل عملة |
| DELETE | `/api/admin/currencies/:id` | حذف عملة |
| GET | `/api/admin/gold` | أسعار الذهب الحالية |
| PUT | `/api/admin/gold` | تعديل أسعار الذهب |
| GET | `/api/admin/silver` | سعر الفضة الحالي |
| PUT | `/api/admin/silver` | تعديل سعر الفضة |
| GET | `/api/admin/history?asset=USD&range=1d` | السجل التاريخي |
| GET | `/api/admin/activity-log` | سجل العمليات |
| GET | `/api/admin/activity-log/stats` | إحصائيات العمليات |
| GET | `/api/admin/ads` | إعدادات الإعلانات |
| PUT | `/api/admin/ads/:id` | تعديل إعلان |
| GET | `/api/admin/settings` | إعدادات التطبيق |
| PUT | `/api/admin/settings` | تحديث الإعدادات |

---

## 🔒 الأمان

- **JWT Authentication** — صلاحية 7 أيام
- **bcrypt** — تشفير كلمات المرور (12 rounds)
- **Rate Limiting** — 100 طلب/15 دقيقة، 10 محاولات دخول/15 دقيقة
- **Helmet.js** — Security headers
- **HTTPS** — Let's Encrypt SSL
- **CORS** — قائمة بيضاء محكومة

---

## 📊 قاعدة البيانات

### الجداول الرئيسية:
| الجدول | الوصف |
|--------|-------|
| `users` | مستخدمو لوحة التحكم |
| `currencies` | العملات مع أسعار الشراء والبيع |
| `gold_prices` | أسعار الذهب (18، 21، 24 عيار) |
| `silver_prices` | أسعار الفضة |
| `price_history` | سجل تاريخي لجميع الأسعار |
| `activity_log` | سجل عمليات المدير |
| `ads_config` | إعدادات الإعلانات |
| `app_settings` | إعدادات التطبيق العامة |
| `price_sources` | مصادر الأسعار الخارجية |

---

## ⏰ Cron Jobs

| التوقيت | المهمة |
|---------|--------|
| كل 5 دقائق | جلب أسعار العملات تلقائياً |
| كل 5 دقائق | جلب أسعار الذهب والفضة (يتطلب API Key) |
| يومياً 3 صباحاً | حذف السجل التاريخي الأقدم من 90 يوماً |

---

## 🛠️ الخطوات التالية

- [ ] **Next.js Web App** — موقع عرض الأسعار مع TradingView Charts
- [ ] **Flutter App** — تطبيق iOS/Android مع AdMob
- [ ] **WebSocket** — تحديثات فورية
- [ ] **Push Notifications** — إشعارات تغير الأسعار
- [ ] **SSL Setup** — تفعيل Let's Encrypt على الدومين

---

## 📞 التواصل والدعم

- Admin Panel: `https://YOUR_DOMAIN/admin/`
- API Base: `https://YOUR_DOMAIN/api/v1/`

---

*آخر تحديث: 2026-04-01 | الإصدار: 1.0.0*
