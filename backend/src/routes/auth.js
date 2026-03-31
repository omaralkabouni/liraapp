// =============================================================
// Auth Routes
// =============================================================
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { login, changePassword } = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/activityService');
const router = express.Router();

// POST /api/admin/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'بيانات غير صحيحة', details: errors.array() });
    }

    try {
      const { email, password } = req.body;
      const result = await login(email, password);

      await logActivity({
        userId: result.user.id,
        userEmail: result.user.email,
        action: 'LOGIN',
        entityType: 'auth',
        description: `قام ${result.user.fullName} بتسجيل الدخول`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// GET /api/admin/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/admin/auth/change-password
router.post('/change-password', authenticate,
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'بيانات غير صحيحة' });
    }

    try {
      await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
      
      await logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'CHANGE_PASSWORD',
        entityType: 'auth',
        description: `قام ${req.user.full_name} بتغيير كلمة المرور`,
        ipAddress: req.ip,
      });

      res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/admin/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  await logActivity({
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'LOGOUT',
    entityType: 'auth',
    description: `قام ${req.user.full_name} بتسجيل الخروج`,
    ipAddress: req.ip,
  });
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

module.exports = router;
