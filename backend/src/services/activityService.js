// =============================================================
// Activity Log Service - تسجيل جميع العمليات الإدارية
// =============================================================
'use strict';

const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Log an admin action to the activity_log table
 * @param {Object} params
 * @param {string} params.userId - Admin user UUID
 * @param {string} params.userEmail - Admin user email
 * @param {string} params.action - Action code (e.g. 'UPDATE_GOLD_PRICE')
 * @param {string} params.entityType - Entity type ('gold', 'currency', 'silver', 'ads', 'settings')
 * @param {string} params.entityId - Entity ID
 * @param {Object} params.oldValue - Previous values (JSONB)
 * @param {Object} params.newValue - New values (JSONB)
 * @param {string} params.description - Human-readable Arabic description
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent string
 */
const logActivity = async ({
  userId,
  userEmail,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  description,
  ipAddress,
  userAgent,
}) => {
  try {
    await db.query(
      `INSERT INTO activity_log 
        (user_id, user_email, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId || null,
        userEmail || null,
        action,
        entityType || null,
        entityId ? String(entityId) : null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress || null,
        userAgent || null,
        description,
      ]
    );
  } catch (err) {
    // Don't throw — log failure shouldn't break the main operation
    logger.error('Failed to write activity log:', err.message);
  }
};

/**
 * Express middleware to extract request metadata for logging
 */
const activityLogger = (action, entityType, getDescription) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    res.json = function(body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const description = typeof getDescription === 'function' 
          ? getDescription(req, body)
          : getDescription;
          
        logActivity({
          userId: req.user.id,
          userEmail: req.user.email,
          action,
          entityType,
          entityId: req.params?.id || body?.id,
          oldValue: req.oldValue,   // Set by controller before calling next
          newValue: req.body,
          description,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
      return originalJson(body);
    };
    
    next();
  };
};

module.exports = { logActivity, activityLogger };
