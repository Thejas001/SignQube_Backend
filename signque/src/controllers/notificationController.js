'use strict';

const notificationService = require('../services/notificationService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const data = await notificationService.listForUser({
    userId: req.user.id,
    unreadOnly: req.query.unread === true,
  });
  return ok(res, data, 'OK');
});

const markRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markRead({ id: req.params.id, userId: req.user.id });
  return ok(res, data, 'Marked as read');
});

const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user.id);
  return ok(res, data, 'All marked as read');
});

module.exports = { list, markRead, markAllRead };
