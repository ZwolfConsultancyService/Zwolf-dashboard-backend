import express from 'express';
import {
  getGuides,
  createGuide,
  updateGuide,
  deleteGuide,
} from '../controllers/guideController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getGuides);
router.post('/', authorize('manager'), createGuide);
router.put('/:id', authorize('manager'), updateGuide);
router.delete('/:id', authorize('manager'), deleteGuide);

export default router;