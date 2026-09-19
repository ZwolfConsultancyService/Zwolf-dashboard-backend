import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { recipients: req.user._id };

  const [data, total] = await Promise.all([
    Notification.find(filter)
      .populate('sender', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  const unreadCount = await Notification.countDocuments({
    recipients: req.user._id,
    readBy: { $ne: req.user._id },
  });

  res.json({
    success: true,
    unreadCount,
    ...paginatedResponse(data, total, page, limit),
  });
});

export const createNotification = asyncHandler(async (req, res) => {
  const { title, message, recipientType, recipients: explicitRecipients } = req.body;

  let recipients = [];

  if (recipientType === 'Everyone') {
    recipients = (await User.find({ isActive: true }).select('_id')).map((u) => u._id);
  } else if (recipientType === 'Sales') {
    recipients = (await User.find({ role: 'sales', isActive: true }).select('_id')).map((u) => u._id);
  } else if (recipientType === 'Developers') {
    recipients = (await User.find({ role: 'developer', isActive: true }).select('_id')).map((u) => u._id);
  } else if (recipientType === 'Specific') {
    if (!explicitRecipients || !explicitRecipients.length) {
      throw new ApiError(400, 'At least one recipient is required');
    }
    recipients = explicitRecipients;
  } else {
    throw new ApiError(400, 'Invalid recipientType');
  }

  const notification = await Notification.create({
    title, message, sender: req.user._id, recipientType, recipients,
  });

  await logActivity({
    user: req.user._id, action: 'SEND', module: 'Notification',
    description: `Sent notification to ${recipientType}: ${title}`,
    referenceId: notification._id,
  });

  res.status(201).json({ success: true, data: notification });
});

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

export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipients: req.user._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});