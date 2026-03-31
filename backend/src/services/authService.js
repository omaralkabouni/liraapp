// =============================================================
// Auth Service - JWT + bcrypt
// =============================================================
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Generate JWT token
 */
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Initialize admin user on first boot
 */
const initAdminUser = async () => {
  try {
    const existing = await db.query('SELECT id FROM users LIMIT 1');
    if (existing.rows.length > 0) {
      logger.info('Admin user already exists, skipping initialization');
      return;
    }

    const email = process.env.ADMIN_EMAIL || 'admin@liranow.sy';
    const password = process.env.ADMIN_PASSWORD || 'LiraNow@2026';
    const name = process.env.ADMIN_NAME || 'مدير النظام';

    const hash = await bcrypt.hash(password, 12);
    
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
      [email, hash, name]
    );

    logger.info(`✅ Admin user created: ${email}`);
  } catch (err) {
    logger.error('Failed to initialize admin user:', err);
    // Don't throw - non-critical on startup if user already exists
  }
};

/**
 * Login - verify credentials and return token
 */
const login = async (email, password) => {
  const result = await db.query(
    'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    throw { status: 401, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw { status: 403, message: 'الحساب معطّل. تواصل مع المدير الرئيسي.' };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw { status: 401, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  }

  // Update last login
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = generateToken(user.id, user.email, user.role);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  };
};

/**
 * Change password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  
  if (result.rows.length === 0) throw { status: 404, message: 'المستخدم غير موجود' };

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) throw { status: 401, message: 'كلمة المرور الحالية غير صحيحة' };

  const hash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
};

module.exports = { initAdminUser, login, changePassword, generateToken };
