import Detail from '../models/Detail.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

// @desc    Get all details (filtered by role)
// @route   GET /api/details
export const getDetails = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { isActive: true };

  // Managers see all
  if (req.user.role !== 'manager') {
    filter.$or = [
      { targetType: 'everyone' },
      {
        targetType:
          req.user.role === 'developer' ? 'developers' : req.user.role,
      },
      { targetType: 'specific', specificRecipients: req.user._id },
    ];
  }

  // Optional filter by project
  if (req.query.project) {
    filter.project = req.query.project;
  }

  const [data, total] = await Promise.all([
    Detail.find(filter)
      .populate('createdBy', 'name role')
      .populate('project', 'projectName status progress')
      .populate('specificRecipients', 'name email role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Detail.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

// @desc    Create detail (manager only)
// @route   POST /api/details
export const createDetail = asyncHandler(async (req, res) => {
  const {
    title,
    details,
    project = null,
    targetType = 'developers',
    specificRecipients = [],
  } = req.body;

  if (!title || !details) {
    throw new ApiError(400, 'Title and details are required');
  }

  if (
    targetType === 'specific' &&
    (!specificRecipients || specificRecipients.length === 0)
  ) {
    throw new ApiError(
      400,
      'Please select at least one recipient for specific detail'
    );
  }

  const detail = await Detail.create({
    title,
    details,
    project: project || null,
    targetType,
    specificRecipients: targetType === 'specific' ? specificRecipients : [],
    createdBy: req.user._id,
  });

  const populated = await detail.populate([
    { path: 'createdBy', select: 'name role' },
    { path: 'project', select: 'projectName status progress' },
    { path: 'specificRecipients', select: 'name email role' },
  ]);

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Detail',
    description: `Created detail "${title}" for ${targetType}`,
    referenceId: detail._id,
  });

  res.status(201).json({ success: true, data: populated });
});

// @desc    Get single detail
// @route   GET /api/details/:id
export const getDetail = asyncHandler(async (req, res) => {
  const detail = await Detail.findById(req.params.id)
    .populate('createdBy', 'name role')
    .populate('project', 'projectName status progress client')
    .populate('specificRecipients', 'name email role');

  if (!detail) throw new ApiError(404, 'Detail not found');

  if (req.user.role !== 'manager') {
    const allowed =
      detail.targetType === 'everyone' ||
      detail.targetType ===
        (req.user.role === 'developer' ? 'developers' : req.user.role) ||
      (detail.targetType === 'specific' &&
        detail.specificRecipients.some((r) => r._id.equals(req.user._id)));

    if (!allowed) throw new ApiError(403, 'Not authorized to view this detail');
  }

  res.json({ success: true, data: detail });
});

// @desc    Update detail (manager only)
// @route   PUT /api/details/:id
export const updateDetail = asyncHandler(async (req, res) => {
  const detail = await Detail.findById(req.params.id);
  if (!detail) throw new ApiError(404, 'Detail not found');

  ['title', 'details', 'targetType', 'isActive', 'project'].forEach((f) => {
    if (req.body[f] !== undefined) detail[f] = req.body[f] || null;
  });

  if (req.body.specificRecipients !== undefined) {
    detail.specificRecipients =
      detail.targetType === 'specific' ? req.body.specificRecipients : [];
  }

  await detail.save();

  const populated = await detail.populate([
    { path: 'createdBy', select: 'name role' },
    { path: 'project', select: 'projectName status progress' },
    { path: 'specificRecipients', select: 'name email role' },
  ]);

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Detail',
    description: `Updated detail "${detail.title}"`,
    referenceId: detail._id,
  });

  res.json({ success: true, data: populated });
});

// @desc    Delete detail (manager only)
// @route   DELETE /api/details/:id
export const deleteDetail = asyncHandler(async (req, res) => {
  const detail = await Detail.findById(req.params.id);
  if (!detail) throw new ApiError(404, 'Detail not found');

  await detail.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Detail',
    description: `Deleted detail "${detail.title}"`,
    referenceId: detail._id,
  });

  res.json({ success: true, message: 'Detail deleted' });
});