import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { emitToUser, isUserOnline } from '../../socket.js';
import { sendPushToEmployee } from '../utils/pushNotification.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

/* =========================================================
   AUTO-CLEANUP SETTINGS
========================================================= */

const CLEANUP_DAYS = 1; // Notifications older than 1 day auto-delete

/* =========================================================
   GET NOTIFICATIONS
   
   ✅ Sirf last 30 din ki notifications
   ✅ Latest first sort
   ✅ Old auto-filter ho jaayengi
========================================================= */

export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  /* 🆕 Only last 30 days */
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_DAYS);

  const filter = {
    recipients: req.user._id,
    createdAt: { $gte: cutoffDate },
  };

  const [data, total] = await Promise.all([
    Notification.find(filter)
      .populate('sender', 'name role')
      .sort('-createdAt')          // ✅ Latest first
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  /* Unread count (last 30 days only) */
  const unreadCount = await Notification.countDocuments({
    recipients: req.user._id,
    readBy: { $ne: req.user._id },
    createdAt: { $gte: cutoffDate },
  });

  res.json({
    success: true,
    unreadCount,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   CREATE NOTIFICATION
   
   ✅ Notification create
   ✅ EMIT to all recipients (socket + push)
   ✅ Auto-delete old notifications
========================================================= */

export const createNotification = asyncHandler(async (req, res) => {
  const { title, message, recipientType, recipients: explicitRecipients } = req.body;

  let recipients = [];

  if (recipientType === 'Everyone') {
    recipients = (await User.find({ isActive: true }).select('_id')).map(
      (u) => u._id
    );
  } else if (recipientType === 'Sales') {
    recipients = (
      await User.find({ role: 'sales', isActive: true }).select('_id')
    ).map((u) => u._id);
  } else if (recipientType === 'Developers') {
    recipients = (
      await User.find({ role: 'developer', isActive: true }).select('_id')
    ).map((u) => u._id);
  } else if (recipientType === 'Specific') {
    if (!explicitRecipients || !explicitRecipients.length) {
      throw new ApiError(400, 'At least one recipient is required');
    }
    recipients = explicitRecipients;
  } else {
    throw new ApiError(400, 'Invalid recipientType');
  }

  const notification = await Notification.create({
    title,
    message,
    sender: req.user._id,
    recipientType,
    recipients,
  });

  /* =========================================================
     🔔 EMIT TO ALL RECIPIENTS (Socket + Push)
  ========================================================= */

  for (const recipientId of recipients) {
    try {
      const recipientIdStr = String(recipientId);
      const online = isUserOnline(recipientIdStr);

      /* Socket emit — always */
      emitToUser(recipientIdStr, 'new-notification', {
        _id: notification._id,
        title,
        message,
        type: 'manual',
        url: '/notifications',
        createdAt: notification.createdAt,
        sender: req.user._id,
      });

      /* Push — only if offline */
      if (!online) {
        await sendPushToEmployee(recipientIdStr, {
          title,
          body: message,
          url: '/notifications',
          tag: `notif-manual-${notification._id}`,
        }).catch((e) =>
          console.error('manual notif push err:', e)
        );
      }
    } catch (emitErr) {
      console.error('emit notification err:', emitErr);
    }
  }

  /* =========================================================
     🧹 AUTO-DELETE OLD NOTIFICATIONS
  ========================================================= */

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_DAYS);

    const deleteResult = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    if (deleteResult.deletedCount > 0) {
      console.log(
        `🧹 Auto-cleaned ${deleteResult.deletedCount} old notifications`
      );
    }
  } catch (cleanupErr) {
    console.error('Notification auto-cleanup error:', cleanupErr);
  }

  await logActivity({
    user: req.user._id,
    action: 'SEND',
    module: 'Notification',
    description: `Sent notification to ${recipientType}: ${title}`,
    referenceId: notification._id,
  });
/* 🔔 DEBUG */
console.log('========== NOTIFICATION DEBUG ==========');
console.log('Recipients Count:', recipients.length);
console.log(
  'Recipients IDs:',
  recipients.map((r) => String(r))
);
console.log('Notification ID:', String(notification._id));
console.log('========================================');
  res.status(201).json({ success: true, data: notification });
});

/* =========================================================
   MARK AS READ
========================================================= */

export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw new ApiError(404, 'Notification not found');

  if (!notification.recipients.some((r) => r.equals(req.user._id))) {
    throw new ApiError(403, 'Not authorized');
  }

  if (!notification.readBy.some((r) => r.equals(req.user._id))) {
    notification.readBy.push(req.user._id);
    await notification.save();
  }

  res.json({ success: true, data: notification });
});

/* =========================================================
   MARK ALL AS READ
========================================================= */

export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipients: req.user._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});

/* =========================================================
   🆕 DELETE NOTIFICATION (Manager)
   
   Manager koi bhi notification delete kar sakta hai
========================================================= */

export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  await notification.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Notification',
    description: `Deleted notification "${notification.title}"`,
    referenceId: notification._id,
  });

  res.json({
    success: true,
    message: 'Notification deleted successfully',
  });
});