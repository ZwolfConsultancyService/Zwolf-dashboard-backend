import Message from '../models/Message.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

export const getMessages = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { $or: [{ sender: req.user._id }, { recipient: req.user._id }] };

  if (req.query.withUser) {
    filter.$or = [
      { sender: req.user._id, recipient: req.query.withUser },
      { sender: req.query.withUser, recipient: req.user._id },
    ];
  }

  const [data, total] = await Promise.all([
    Message.find(filter)
      .populate('sender', 'name role')
      .populate('recipient', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Message.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const { recipient, message } = req.body;
  if (!recipient || !message) throw new ApiError(400, 'Recipient and message required');

  const recipientUser = await User.findById(recipient);
  if (!recipientUser) throw new ApiError(404, 'Recipient not found');

  const msg = await Message.create({ sender: req.user._id, recipient, message });
  const populated = await msg.populate([
    { path: 'sender', select: 'name role' },
    { path: 'recipient', select: 'name role' },
  ]);

  res.status(201).json({ success: true, data: populated });
});

export const markMessageAsRead = asyncHandler(async (req, res) => {
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new ApiError(404, 'Message not found');
  if (!msg.recipient.equals(req.user._id)) throw new ApiError(403, 'Not authorized');

  msg.isRead = true;
  await msg.save();
  res.json({ success: true, data: msg });
});