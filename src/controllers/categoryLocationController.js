import CategoryLocation from '../models/CategoryLocation.js';
import Category from '../models/Category.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Assignment from '../models/Assignment.js';
export const createLocation = asyncHandler(async (req, res) => {
  const { category, name, parent } = req.body;

  if (!category) throw new ApiError(400, 'Category is required');
  if (!name?.trim()) throw new ApiError(400, 'Location name is required');

  const catDoc = await Category.findById(category);
  if (!catDoc) throw new ApiError(404, 'Category not found');

  let level = 0;
  if (parent) {
    const parentDoc = await CategoryLocation.findById(parent);
    if (!parentDoc) throw new ApiError(404, 'Parent location not found');
    if (parentDoc.category.toString() !== category) {
      throw new ApiError(400, 'Parent belongs to a different category');
    }
    level = parentDoc.level + 1;
  }

  const location = await CategoryLocation.create({
    category,
    name: name.trim(),
    parent: parent || null,
    level,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: location });
});

export const getLocations = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.parent !== undefined) {
    filter.parent = req.query.parent === 'null' ? null : req.query.parent;
  }

  const locations = await CategoryLocation.find(filter)
    .populate('category', 'name')
    .sort({ level: 1, name: 1 })
    .lean();

  res.json({ success: true, data: locations });
});

export const getLocationTree = asyncHandler(async (req, res) => {
  const { category } = req.query;
  if (!category) throw new ApiError(400, 'category is required');

  const locations = await CategoryLocation.find({
    category,
    isActive: true,
  })
    .sort({ name: 1 })
    .lean();

  const map = {};
  locations.forEach((l) => (map[l._id] = { ...l, children: [] }));

  const tree = [];
  locations.forEach((l) => {
    if (l.parent && map[l.parent]) map[l.parent].children.push(map[l._id]);
    else tree.push(map[l._id]);
  });

  res.json({ success: true, data: tree });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const location = await CategoryLocation.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!location) throw new ApiError(404, 'Location not found');
  res.json({ success: true, data: location });
});

export const deleteLocation = asyncHandler(async (req, res) => {
  const location = await CategoryLocation.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!location) throw new ApiError(404, 'Location not found');
  res.json({ success: true, message: 'Location deactivated' });
});
export const createLocationAsSales = asyncHandler(async (req, res) => {
  const { category, name, parent } = req.body;

  if (!category) throw new ApiError(400, 'Category is required');
  if (!name?.trim()) throw new ApiError(400, 'Location name is required');

  const catDoc = await Category.findById(category);
  if (!catDoc || !catDoc.isActive) throw new ApiError(404, 'Category not found');

  let level = 0;
  if (parent) {
    const parentDoc = await CategoryLocation.findById(parent);
    if (!parentDoc) throw new ApiError(404, 'Parent location not found');
    if (parentDoc.category.toString() !== category) {
      throw new ApiError(400, 'Parent belongs to a different category');
    }
    level = parentDoc.level + 1;
  }

  const location = await CategoryLocation.create({
    category,
    name: name.trim(),
    parent: parent || null,
    level,
    createdBy: req.user._id,
  });

  // 🔒 AUTO-CLAIM: turant is sales person ko assign
  let assignment = null;
  try {
    const existing = await Assignment.findOne({
      category,
      location: location._id,
      isActive: true,
    });
    if (!existing) {
      assignment = await Assignment.create({
        category,
        location: location._id,
        salesPerson: req.user._id,
        assignedBy: req.user._id,
      });
    }
  } catch (err) {
    // Agar unique index race condition mein fail ho, ignore — location create ho chuki hai
    if (err.code !== 11000) throw err;
  }

  const populated = await CategoryLocation.findById(location._id)
    .populate('category', 'name')
    .lean();

  res.status(201).json({
    success: true,
    data: populated,
    assignment,
    message: 'Location created and auto-assigned to you ✅',
  });
});