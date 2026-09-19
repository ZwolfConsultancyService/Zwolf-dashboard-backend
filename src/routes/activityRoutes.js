import express from 'express';
import { getActivityLogs } from '../controllers/activityController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager'));
router.get('/', getActivityLogs);

export default router;