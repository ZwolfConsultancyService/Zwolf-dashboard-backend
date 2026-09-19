import express from 'express';
import {
  getDetails,
  createDetail,
  getDetail,
  updateDetail,
  deleteDetail,
} from '../controllers/detailController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router
  .route('/')
  .get(getDetails)
  .post(authorize('manager'), createDetail);

router
  .route('/:id')
  .get(getDetail)
  .put(authorize('manager'), updateDetail)
  .delete(authorize('manager'), deleteDetail);

export default router;