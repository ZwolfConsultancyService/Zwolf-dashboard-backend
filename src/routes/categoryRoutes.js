import express from 'express';
import {
  createCategory, getCategories, updateCategory, deleteCategory,createCategoryAsSales
} from '../controllers/categoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getCategories);
router.post('/', authorize('admin', 'manager'), createCategory);
router.put('/:id', authorize('admin', 'manager'), updateCategory);
router.delete('/:id', authorize('admin', 'manager'), deleteCategory);
router.post('/sales-create', authorize('sales'), createCategoryAsSales);
export default router;