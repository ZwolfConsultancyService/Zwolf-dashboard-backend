import express from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  toggleProductStatus,
  deleteProduct,
  getCategories,
} from '../controllers/productController.js';

import { protect } from '../middleware/authMiddleware.js';
import { protectClient } from '../middleware/clientAuthMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

/* =========================================================
   🆕 DUAL AUTH — Employee ho ya Client, dono chalega
   
   Employee token → req.user set karega
   Client token   → req.client set karega
========================================================= */

const protectAny = async (req, res, next) => {
  /* Try EMPLOYEE first */
  try {
    await new Promise((resolve, reject) => {
      protect(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (req.user) return next();
  } catch (e) {
    // employee auth failed — try client
  }

  /* Try CLIENT */
  try {
    await new Promise((resolve, reject) => {
      protectClient(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (req.client) return next();
  } catch (e) {
    // client auth failed too
  }

  /* Both failed */
  if (!req.user && !req.client) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized',
    });
  }

  return next();
};

/* =========================================================
   PUBLIC GET ROUTES (Employee + Client dono)
========================================================= */

router.get('/', protectAny, getProducts);
router.get('/categories', protectAny, getCategories);
router.get('/:id', protectAny, getProduct);

/* =========================================================
   MANAGER ONLY (Employee token)
========================================================= */

router.post('/', protect, authorize('manager'), createProduct);
router.put('/:id', protect, authorize('manager'), updateProduct);
router.patch(
  '/:id/toggle-status',
  protect,
  authorize('manager'),
  toggleProductStatus
);
router.delete('/:id', protect, authorize('manager'), deleteProduct);

export default router;