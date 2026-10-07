import Product from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

/* =========================================================
   GET ALL PRODUCTS (Public — Client/Sales/Manager sab dekh sakte hain)
   
   GET /api/products
   GET /api/products?category=CRM&search=crm&activeOnly=true
========================================================= */

export const getProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  /* Active only by default (client/sales) */
  if (req.user?.role !== 'manager' || req.query.activeOnly === 'true') {
    filter.isActive = true;
  }

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      {
        shortDescription: {
          $regex: req.query.search,
          $options: 'i',
        },
      },
      {
        description: {
          $regex: req.query.search,
          $options: 'i',
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    Product.find(filter)
      .populate('createdBy', 'name role')
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET SINGLE PRODUCT
   
   GET /api/products/:id
========================================================= */

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate(
    'createdBy',
    'name role'
  );

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  /* Non-managers can't see inactive products */
  if (!product.isActive && req.user?.role !== 'manager') {
    throw new ApiError(404, 'Product not found');
  }

  res.json({ success: true, data: product });
});

/* =========================================================
   CREATE PRODUCT (Manager only)
   
   POST /api/products
========================================================= */

export const createProduct = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    createdBy: req.user._id,
  };

  /* Sanitize numbers */
  if (payload.startingPrice !== undefined) {
    const n = Number(payload.startingPrice);
    payload.startingPrice = isNaN(n) || n < 0 ? 0 : n;
  }

  if (payload.order !== undefined) {
    const n = Number(payload.order);
    payload.order = isNaN(n) ? 0 : n;
  }

  /* Sanitize arrays */
  if (!Array.isArray(payload.features)) {
    payload.features = [];
  }

  if (!Array.isArray(payload.technology)) {
    payload.technology = [];
  }

  const product = await Product.create(payload);

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Product',
    description: `Created product ${product.name}`,
    referenceId: product._id,
  });

  res.status(201).json({
    success: true,
    data: product,
  });
});

/* =========================================================
   UPDATE PRODUCT (Manager only)
   
   PUT /api/products/:id
========================================================= */

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  const allowed = [
    'name',
    'category',
    'shortDescription',
    'description',
    'startingPrice',
    'priceType',
    'features',
    'technology',
    'image',
    'thumbnail',
    'deliveryTime',
    'isActive',
    'order',
  ];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      /* Number fields */
      if (field === 'startingPrice' || field === 'order') {
        const n = Number(req.body[field]);
        product[field] = isNaN(n) ? 0 : n;
      }
      /* Array fields */
      else if (field === 'features' || field === 'technology') {
        product[field] = Array.isArray(req.body[field])
          ? req.body[field]
          : [];
      }
      /* Others */
      else {
        product[field] = req.body[field];
      }
    }
  });

  await product.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Product',
    description: `Updated product ${product.name}`,
    referenceId: product._id,
  });

  res.json({
    success: true,
    data: product,
  });
});

/* =========================================================
   TOGGLE PRODUCT STATUS (Manager only)
   
   PATCH /api/products/:id/toggle-status
========================================================= */

export const toggleProductStatus = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  product.isActive = !product.isActive;
  await product.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Product',
    description: `${product.isActive ? 'Enabled' : 'Disabled'} product ${product.name}`,
    referenceId: product._id,
  });

  res.json({
    success: true,
    data: product,
  });
});

/* =========================================================
   DELETE PRODUCT (Manager only)
   
   DELETE /api/products/:id
========================================================= */

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  await product.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Product',
    description: `Deleted product ${product.name}`,
    referenceId: product._id,
  });

  res.json({
    success: true,
    message: 'Product deleted successfully',
  });
});

/* =========================================================
   GET CATEGORIES (for filter dropdowns)
   
   GET /api/products/categories
========================================================= */

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct('category', {
    isActive: true,
  });

  res.json({
    success: true,
    data: categories,
  });
});