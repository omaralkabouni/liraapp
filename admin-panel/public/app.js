// =============================================================
// 🪙 الليرة الآن — Admin Panel JavaScript
// =============================================================
'use strict';

// =============================================
// CONFIG
// =============================================
const API_BASE = window.API_BASE || '/api';
let currentUser = null;
let authToken = null;
let currentPage = 'overview';
let activityCurrentPage = 1;
let allCurrencies = [];
let confirmCallback = null;

// =============================================
// INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Check saved token
  authToken = localStorage.getItem('liranow_token');
  const savedUser = localStorage.getItem('liranow_user');
  
  if (authToken && savedUser) {
    currentUser = JSON.parse(savedUser);
    showDashboard();
  } else {
    showLogin();
  }

  // Login form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// =============================================
// AUTH
// =============================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  
  err.style.display = 'none';
  document.getElementById('loginBtnText').style.display = 'none';
  document.getElementById('loginSpinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('liranow_token', authToken);
    localStorage.setItem('liranow_user', JSON.stringify(currentUser));
    
    showDashboard();
    toast('مرحباً ' + currentUser.fullName + '! 👋', 'success');
  } catch (err_) {
    err.textContent = err_.message;
    err.style.display = 'flex';
  } finally {
    document.getElementById('loginBtnText').style.display = 'inline';
    document.getElementById('loginSpinner').style.display = 'none';
    btn.disabled = false;
  }
}

function logout() {
  fetch(`${API_BASE}/admin/auth/logout`, {
    method: 'POST',
    headers: getHeaders(),
  }).catch(() => {});
  
  localStorage.removeItem('liranow_token');
  localStorage.removeItem('liranow_user');
  authToken = null;
  currentUser = null;
  
  document.getElementById('dashboard').style.display = 'none';
  showLogin();
  toast('تم تسجيل الخروج بنجاح', 'info');
}

function togglePassword() {
  const p = document.getElementById('password');
  p.type = p.type === 'password' ? 'text' : 'password';
}

// =============================================
// NAVIGATION
// =============================================
function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.body.className = 'login-page';
}

function showDashboard() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  document.body.className = '';

  // Set user info
  if (currentUser) {
    document.getElementById('sidebarName').textContent = currentUser.fullName || 'المدير';
    document.getElementById('sidebarRole').textContent = currentUser.role || 'admin';
    const initial = (currentUser.fullName || 'م')[0];
    document.getElementById('sidebarAvatar').textContent = initial;
  }

  showPage('overview');
  setInterval(updateTime, 1000);
  updateTime();
}

function showPage(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });
  
  // Remove active from all nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  // Show target page
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.style.display = 'block';
    pageEl.classList.add('active');
  }

  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    overview: 'نظرة عامة',
    currencies: 'إدارة العملات',
    gold: 'الذهب والفضة',
    activity: 'سجل العمليات',
    ads: 'مساحات الإعلانات',
    settings: 'الإعدادات',
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  currentPage = page;

  // Load data
  if (page === 'overview') loadOverview();
  else if (page === 'currencies') loadCurrencies();
  else if (page === 'gold') loadGoldSilver();
  else if (page === 'activity') loadActivityLog();
  else if (page === 'ads') loadAds();
  else if (page === 'settings') loadSettings();

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function updateTime() {
  const now = new Date();
  document.getElementById('lastUpdateTime').textContent = 
    now.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// =============================================
// API HELPERS
// =============================================
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };
}

async function apiCall(method, endpoint, body = null) {
  try {
    const opts = {
      method,
      headers: getHeaders(),
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const data = await res.json();

    if (res.status === 401) {
      logout();
      throw new Error('انتهت جلسة العمل، يرجى تسجيل الدخول مجدداً');
    }

    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
  } catch (err) {
    toast('❌ ' + err.message, 'error');
    throw err;
  }
}

// =============================================
// OVERVIEW
// =============================================
async function loadOverview() {
  try {
    const [gold, silver, currencies, activityRes] = await Promise.all([
      fetch(`${API_BASE}/admin/gold`, { headers: getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/admin/silver`, { headers: getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/admin/currencies`, { headers: getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/admin/activity-log?limit=5`, { headers: getHeaders() }).then(r => r.json()),
    ]);

    // Stats
    if (gold) {
      document.getElementById('stat-gold21').textContent = formatNumber(gold.karat_21);
      document.getElementById('quick-gold18').value = gold.karat_18 || '';
      document.getElementById('quick-gold21').value = gold.karat_21 || '';
      document.getElementById('quick-gold24').value = gold.karat_24 || '';
    }

    if (silver) {
      document.getElementById('stat-silver').textContent = formatNumber(silver.price_per_gram);
      document.getElementById('quick-silver').value = silver.price_per_gram || '';
    }

    if (Array.isArray(currencies)) {
      const usd = currencies.find(c => c.code === 'USD');
      if (usd) document.getElementById('stat-usd').textContent = formatNumber(usd.buy_price);
      document.getElementById('stat-currencies-count').textContent = currencies.filter(c => c.is_active).length;
      allCurrencies = currencies;
    }

    // Recent activity
    if (activityRes && activityRes.logs) {
      renderRecentActivity(activityRes.logs);
    }

  } catch (err) {
    console.error('Overview load error:', err);
  }
}

function renderRecentActivity(logs) {
  const container = document.getElementById('recentActivity');
  if (!logs.length) {
    container.innerHTML = '<p class="text-muted text-center">لا توجد عمليات بعد</p>';
    return;
  }

  const iconMap = {
    gold: '🥇', UPDATE_GOLD_PRICE: '🥇',
    silver: '🥈', UPDATE_SILVER_PRICE: '🥈',
    currency: '💱', ADD_CURRENCY: '💱', UPDATE_CURRENCY: '💱', DELETE_CURRENCY: '💱',
    auth: '🔐', LOGIN: '🔐', LOGOUT: '🔐',
    settings: '⚙️',
    ads: '📢',
    system: '🖥️',
  };

  container.innerHTML = logs.map(log => `
    <div class="activity-item">
      <div class="activity-icon ${log.entity_type || 'system'}">
        ${iconMap[log.action] || iconMap[log.entity_type] || '📝'}
      </div>
      <div class="activity-body">
        <div class="activity-desc">${escapeHtml(log.description)}</div>
        <div class="activity-meta">
          ${log.user_email || 'النظام'} • ${formatDateTime(log.created_at)}
        </div>
      </div>
    </div>
  `).join('');
}

async function quickUpdatePrices() {
  const gold18 = parseFloat(document.getElementById('quick-gold18').value);
  const gold21 = parseFloat(document.getElementById('quick-gold21').value);
  const gold24 = parseFloat(document.getElementById('quick-gold24').value);
  const silverVal = parseFloat(document.getElementById('quick-silver').value);

  try {
    if (gold18 || gold21 || gold24) {
      await apiCall('PUT', '/admin/gold', { karat_18: gold18, karat_21: gold21, karat_24: gold24 });
    }
    if (silverVal) {
      await apiCall('PUT', '/admin/silver', { price_per_gram: silverVal });
    }
    toast('✅ تم تحديث الأسعار بنجاح!', 'success');
    loadOverview();
  } catch (_) {}
}

function refreshAllData() {
  if (currentPage === 'overview') loadOverview();
  else showPage(currentPage);
}

// =============================================
// CURRENCIES
// =============================================
async function loadCurrencies() {
  try {
    const currencies = await apiCall('GET', '/admin/currencies');
    allCurrencies = currencies;
    renderCurrencies(currencies);
  } catch (_) {}
}

function renderCurrencies(currencies) {
  const tbody = document.getElementById('currenciesBody');
  if (!currencies.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">لا توجد عملات</td></tr>';
    return;
  }

  tbody.innerHTML = currencies.map(c => `
    <tr>
      <td>
        <div class="currency-cell">
          <span class="currency-flag">${c.flag_emoji || '🏳️'}</span>
          <div class="currency-info">
            <div class="code">${escapeHtml(c.code)}</div>
            <div class="name">${escapeHtml(c.name_ar)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(c.symbol)}</td>
      <td><span class="price-value">${formatNumber(c.buy_price)}</span></td>
      <td><span class="price-value">${formatNumber(c.sell_price)}</span></td>
      <td>
        <span class="badge ${c.source === 'auto' ? 'badge-info' : 'badge-muted'}">
          ${c.source === 'auto' ? '🤖 تلقائي' : '✏️ يدوي'}
        </span>
      </td>
      <td>
        <span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">
          ${c.is_active ? '● نشط' : '○ موقوف'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="openEditCurrencyModal('${c.id}')">✏️ تعديل</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCurrency('${c.id}', '${escapeHtml(c.name_ar)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterCurrencies() {
  const q = document.getElementById('currencySearch').value.toLowerCase();
  const filtered = allCurrencies.filter(c =>
    c.code.toLowerCase().includes(q) || c.name_ar.includes(q) || c.name_en.toLowerCase().includes(q)
  );
  renderCurrencies(filtered);
}

function openAddCurrencyModal() {
  document.getElementById('currencyModalTitle').textContent = 'إضافة عملة جديدة';
  document.getElementById('currencyId').value = '';
  document.getElementById('currencyForm').reset();
  document.getElementById('currencyFormError').style.display = 'none';
  document.getElementById('currencyModal').style.display = 'flex';
}

function openEditCurrencyModal(id) {
  const currency = allCurrencies.find(c => c.id === id);
  if (!currency) return;

  document.getElementById('currencyModalTitle').textContent = 'تعديل عملة';
  document.getElementById('currencyId').value = id;
  document.getElementById('c-code').value = currency.code;
  document.getElementById('c-symbol').value = currency.symbol;
  document.getElementById('c-name_ar').value = currency.name_ar;
  document.getElementById('c-name_en').value = currency.name_en;
  document.getElementById('c-flag_emoji').value = currency.flag_emoji || '';
  document.getElementById('c-display_order').value = currency.display_order;
  document.getElementById('c-buy_price').value = currency.buy_price;
  document.getElementById('c-sell_price').value = currency.sell_price;
  document.getElementById('c-source').value = currency.source;
  document.getElementById('currencyFormError').style.display = 'none';
  document.getElementById('currencyModal').style.display = 'flex';
}

async function saveCurrency(e) {
  e.preventDefault();
  const id = document.getElementById('currencyId').value;
  const errEl = document.getElementById('currencyFormError');

  const body = {
    code: document.getElementById('c-code').value.toUpperCase(),
    symbol: document.getElementById('c-symbol').value,
    name_ar: document.getElementById('c-name_ar').value,
    name_en: document.getElementById('c-name_en').value,
    flag_emoji: document.getElementById('c-flag_emoji').value,
    display_order: parseInt(document.getElementById('c-display_order').value) || 0,
    buy_price: parseFloat(document.getElementById('c-buy_price').value),
    sell_price: parseFloat(document.getElementById('c-sell_price').value),
    source: document.getElementById('c-source').value,
  };

  try {
    if (id) {
      await apiCall('PUT', `/admin/currencies/${id}`, body);
      toast('✅ تم تعديل العملة بنجاح', 'success');
    } else {
      await apiCall('POST', `/admin/currencies`, body);
      toast('✅ تمت إضافة العملة بنجاح', 'success');
    }
    closeModal('currencyModal');
    loadCurrencies();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'flex';
  }
}

async function deleteCurrency(id, name) {
  showConfirm(
    `حذف عملة: ${name}`,
    `هل أنت متأكد من حذف عملة "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
    async () => {
      await apiCall('DELETE', `/admin/currencies/${id}`);
      toast('✅ تم حذف العملة', 'success');
      loadCurrencies();
    }
  );
}

// =============================================
// GOLD & SILVER
// =============================================
async function loadGoldSilver() {
  try {
    const [gold, silver] = await Promise.all([
      apiCall('GET', '/admin/gold'),
      apiCall('GET', '/admin/silver'),
    ]);

    if (gold) {
      document.getElementById('gold18').value = gold.karat_18;
      document.getElementById('gold21').value = gold.karat_21;
      document.getElementById('gold24').value = gold.karat_24;
      document.getElementById('goldUsd').value = gold.ounce_price_usd;
      document.getElementById('goldNotes').value = gold.notes || '';
      document.getElementById('goldLastUpdate').textContent = formatDateTime(gold.updated_at || gold.created_at);
    }

    if (silver) {
      document.getElementById('silver-gram').value = silver.price_per_gram;
      document.getElementById('silverUsd').value = silver.ounce_price_usd;
      document.getElementById('silverNotes').value = silver.notes || '';
      document.getElementById('silverLastUpdate').textContent = formatDateTime(silver.updated_at || silver.created_at);
    }
  } catch (_) {}
}

async function updateGoldPrices(e) {
  e.preventDefault();
  try {
    await apiCall('PUT', '/admin/gold', {
      karat_18: parseFloat(document.getElementById('gold18').value),
      karat_21: parseFloat(document.getElementById('gold21').value),
      karat_24: parseFloat(document.getElementById('gold24').value),
      ounce_price_usd: parseFloat(document.getElementById('goldUsd').value) || undefined,
      notes: document.getElementById('goldNotes').value || undefined,
    });
    toast('✅ تم تحديث أسعار الذهب بنجاح', 'success');
    loadGoldSilver();
  } catch (_) {}
}

async function updateSilverPrice(e) {
  e.preventDefault();
  try {
    await apiCall('PUT', '/admin/silver', {
      price_per_gram: parseFloat(document.getElementById('silver-gram').value),
      ounce_price_usd: parseFloat(document.getElementById('silverUsd').value) || undefined,
      notes: document.getElementById('silverNotes').value || undefined,
    });
    toast('✅ تم تحديث سعر الفضة بنجاح', 'success');
    loadGoldSilver();
  } catch (_) {}
}

// =============================================
// ACTIVITY LOG
// =============================================
async function loadActivityLog(page = 1) {
  activityCurrentPage = page;
  
  try {
    const entity = document.getElementById('filterEntity').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    
    const params = new URLSearchParams({ page, limit: 20 });
    if (entity) params.append('entity', entity);
    if (from) params.append('from', from);
    if (to) params.append('to', to + 'T23:59:59');

    const [res, stats] = await Promise.all([
      fetch(`${API_BASE}/admin/activity-log?${params}`, { headers: getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/admin/activity-log/stats`, { headers: getHeaders() }).then(r => r.json()),
    ]);

    // Stats
    if (stats.stats) {
      document.getElementById('act-today').textContent = stats.stats.today;
      document.getElementById('act-week').textContent = stats.stats.this_week;
      document.getElementById('act-total').textContent = stats.stats.total;
    }

    // Table
    const tbody = document.getElementById('activityBody');
    if (!res.logs || !res.logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد عمليات</td></tr>';
      document.getElementById('activityPagination').innerHTML = '';
      return;
    }

    const actionLabels = {
      LOGIN: '🔐 دخول', LOGOUT: '🚪 خروج',
      UPDATE_GOLD_PRICE: '🥇 تعديل ذهب', UPDATE_SILVER_PRICE: '🥈 تعديل فضة',
      ADD_CURRENCY: '➕ إضافة عملة', UPDATE_CURRENCY: '✏️ تعديل عملة', DELETE_CURRENCY: '🗑️ حذف عملة',
      UPDATE_SETTINGS: '⚙️ إعدادات', UPDATE_ADS: '📢 إعلانات',
      CHANGE_PASSWORD: '🔑 تغيير كلمة مرور', SYSTEM_INIT: '🖥️ تهيئة النظام',
    };

    tbody.innerHTML = res.logs.map(log => `
      <tr>
        <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${formatDateTime(log.created_at)}</td>
        <td>${escapeHtml(log.user_email || 'النظام')}</td>
        <td>${actionLabels[log.action] || log.action}</td>
        <td><span class="badge badge-muted">${log.entity_type || '—'}</span></td>
        <td style="max-width:300px">${escapeHtml(log.description)}</td>
      </tr>
    `).join('');

    // Pagination
    renderPagination('activityPagination', res.pagination, loadActivityLog);

  } catch (_) {}
}

// =============================================
// ADS
// =============================================
async function loadAds() {
  try {
    const ads = await apiCall('GET', '/admin/ads');
    const container = document.getElementById('adsContainer');
    
    const platformLabels = { adsense: 'AdSense 🌐', admob: 'AdMob 📱', custom: 'مخصص' };
    const placementLabels = {
      home_top_banner: 'بانر أعلى الصفحة الرئيسية',
      home_sidebar: 'شريط جانبي - الصفحة الرئيسية',
      currency_list_banner: 'بانر قائمة العملات',
      footer_banner: 'بانر التذييل',
      app_banner: 'بانر التطبيق',
      app_interstitial: 'إعلان بيني (Interstitial)',
      app_rewarded: 'إعلان مكافئ (Rewarded)',
    };

    container.innerHTML = ads.map(ad => `
      <div class="ad-card" id="ad-${ad.id}">
        <div class="ad-info">
          <div class="ad-platform">${platformLabels[ad.platform] || ad.platform}</div>
          <div class="ad-placement">${placementLabels[ad.placement] || ad.placement}</div>
        </div>
        <div class="ad-input-group">
          <input type="text" class="input input-sm" style="width:250px" 
                 id="ad-unit-${ad.id}" 
                 value="${escapeHtml(ad.ad_unit_id || '')}" 
                 placeholder="Ad Unit ID">
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge ${ad.is_active ? 'badge-success' : 'badge-muted'}">
            ${ad.is_active ? 'مفعّل' : 'موقوف'}
          </span>
          <button class="btn btn-sm btn-outline" onclick="saveAd('${ad.id}', ${ad.is_active})">
            ${ad.is_active ? '🔴 إيقاف' : '🟢 تفعيل'}
          </button>
          <button class="btn btn-sm btn-primary" onclick="saveAdUnit('${ad.id}')">💾</button>
        </div>
      </div>
    `).join('');
  } catch (_) {}
}

async function saveAd(id, isActive) {
  try {
    await apiCall('PUT', `/admin/ads/${id}`, { is_active: !isActive });
    toast(`✅ تم ${!isActive ? 'تفعيل' : 'إيقاف'} الإعلان`, 'success');
    loadAds();
  } catch (_) {}
}

async function saveAdUnit(id) {
  const adUnitId = document.getElementById(`ad-unit-${id}`).value;
  try {
    await apiCall('PUT', `/admin/ads/${id}`, { ad_unit_id: adUnitId });
    toast('✅ تم حفظ معرف الإعلان', 'success');
  } catch (_) {}
}

// =============================================
// SETTINGS
// =============================================
async function loadSettings() {
  try {
    const settings = await apiCall('GET', '/admin/settings');
    const keys = ['app_name', 'app_name_en', 'update_interval_minutes', 'telegram_channel', 'whatsapp_number', 'price_disclaimer'];
    keys.forEach(key => {
      const el = document.getElementById(`set-${key}`);
      if (el && settings[key] !== undefined) el.value = settings[key];
    });
  } catch (_) {}
}

async function saveSettings(e) {
  e.preventDefault();
  const keys = ['app_name', 'app_name_en', 'update_interval_minutes', 'telegram_channel', 'whatsapp_number', 'price_disclaimer'];
  const updates = {};
  keys.forEach(key => {
    const el = document.getElementById(`set-${key}`);
    if (el) updates[key] = el.value;
  });

  try {
    await apiCall('PUT', '/admin/settings', updates);
    toast('✅ تم حفظ الإعدادات بنجاح', 'success');
  } catch (_) {}
}

async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('currentPassword').value;
  const newPass = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if (newPass !== confirm) {
    toast('❌ كلمتا المرور غير متطابقتين', 'error');
    return;
  }

  try {
    await apiCall('POST', '/admin/auth/change-password', {
      currentPassword: current,
      newPassword: newPass,
    });
    toast('✅ تم تغيير كلمة المرور بنجاح', 'success');
    document.getElementById('passwordForm').reset();
  } catch (_) {}
}

// =============================================
// UI HELPERS
// =============================================
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmDialog').style.display = 'flex';
  document.getElementById('confirmBtn').onclick = async () => {
    closeModal('confirmDialog');
    if (confirmCallback) await confirmCallback();
  };
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function renderPagination(containerId, pagination, loadFn) {
  if (!pagination) return;
  const { page, pages } = pagination;
  const container = document.getElementById(containerId);
  if (pages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  if (page > 1) html += `<button onclick="${loadFn.name}(${page - 1})">السابق</button>`;
  
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="${loadFn.name}(${i})">${i}</button>`;
  }
  
  if (page < pages) html += `<button onclick="${loadFn.name}(${page + 1})">التالي</button>`;
  container.innerHTML = html;
}

// =============================================
// FORMATTERS
// =============================================
function formatNumber(n) {
  if (!n && n !== 0) return '—';
  return parseFloat(n).toLocaleString('ar-SY');
}

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('ar-SY', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
