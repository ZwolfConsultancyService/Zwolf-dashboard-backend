import Category from '../models/Category.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Assignment from '../models/Assignment.js';       // 🆕
import CategoryLocation from '../models/CategoryLocation.js';
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Category name required');

  const exists = await Category.findOne({ name: name.trim() });
  if (exists) throw new ApiError(409, 'Category already exists');

  const category = await Category.create({
    name: name.trim(),
    description: description?.trim() || '',
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: category });
});

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: categories });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!category) throw new ApiError(404, 'Category not found');
  res.json({ success: true, data: category });
});


export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  category.isActive = false;
  await category.save();

  // 🆕 Cascade: uski locations ko inactive kar
  await CategoryLocation.updateMany(
    { category: category._id },
    { isActive: false }
  );

  // 🆕 Cascade: uski assignments ko inactive kar
  await Assignment.updateMany(
    { category: category._id },
    { isActive: false }
  );

  res.json({
    success: true,
    message: 'Category + its locations + assignments deactivated',
  });
});
/* =====================================================
   SALES: Create category + auto-assign to self
===================================================== */
export const createCategoryAsSales = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Category name required');

  const exists = await Category.findOne({ name: name.trim() });
  if (exists) throw new ApiError(409, 'Category already exists');

  const category = await Category.create({
    name: name.trim(),
    description: description?.trim() || '',
    createdBy: req.user._id,
  });

  // Auto-assign category to self — but assignment needs location.
  // So we return category, and sales person will add location next.
  // Actual assignment happens when location is created.

  res.status(201).json({
    success: true,
    data: category,
    message: 'Category created. Ab iske andar locations add karo.',
  });
});