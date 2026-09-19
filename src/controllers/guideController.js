import Guide from '../models/Guide.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

// @desc  Get guides (filtered by user role)
// @route GET /api/guides
export const getGuides = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { isActive: true };

  // Managers see all, others see only guides for their role + everyone
  if (req.user.role !== 'manager') {
    filter.targetRole = { $in: [req.user.role, 'everyone'] };
  }

  const [data, total] = await Promise.all([
    Guide.find(filter)
      .populate('createdBy', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Guide.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

// @desc  Create guide (manager only)
// @route POST /api/guides
export const createGuide = asyncHandler(async (req, res) => {
  const { title, description, targetRole = 'developer' } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Title and description are required');
  }

  const guide = await Guide.create({
    title,
    description,
    targetRole,
    createdBy: req.user._id,
  });

  const populated = await guide.populate('createdBy', 'name role');

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Guide',
    description: `Created guide "${title}" for ${targetRole}`,
    referenceId: guide._id,
  });

  res.status(201).json({ success: true, data: populated });
});

// @desc  Update guide (manager only)
// @route PUT /api/guides/:id
export const updateGuide = asyncHandler(async (req, res) => {
  const guide = await Guide.findById(req.params.id);
  if (!guide) throw new ApiError(404, 'Guide not found');

  ['title', 'description', 'targetRole', 'isActive'].forEach((f) => {
    if (req.body[f] !== undefined) guide[f] = req.body[f];
  });

  await guide.save();
  res.json({ success: true, data: guide });
});

// @desc  Delete guide (manager only)
// @route DELETE /api/guides/:id
export const deleteGuide = asyncHandler(async (req, res) => {
  const guide = await Guide.findById(req.params.id);
  if (!guide) throw new ApiError(404, 'Guide not found');

  await guide.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Guide',
    description: `Deleted guide "${guide.title}"`,
    referenceId: guide._id,
  });

  res.json({ success: true, message: 'Guide deleted' });
});