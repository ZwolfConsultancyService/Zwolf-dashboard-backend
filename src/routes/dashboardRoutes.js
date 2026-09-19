import express from 'express';
import {
  getManagerDashboard, getSalesDashboard, getDeveloperDashboard,
} from '../controllers/dashboardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/manager', authorize('manager'), getManagerDashboard);
router.get('/sales', authorize('sales'), getSalesDashboard);
router.get('/developer', authorize('developer'), getDeveloperDashboard);

export default router;