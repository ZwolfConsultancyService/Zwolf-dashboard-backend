import express from 'express';
import {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  getLeave,
  reviewLeave,
  cancelLeave,
  deleteLeave,
  getLeaveBalance,
} from '../controllers/leaveController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

/* =========================================================
   EMPLOYEE ROUTES
========================================================= */

router.post('/', applyLeave);
router.get('/my', getMyLeaves);
router.get('/balance', getLeaveBalance);
router.patch('/:id/cancel', cancelLeave);

/* =========================================================
   MANAGER ROUTES
========================================================= */

router.get('/', authorize('manager'), getAllLeaves);
router.patch('/:id/review', authorize('manager'), reviewLeave);
router.delete('/:id', authorize('manager'), deleteLeave);

/* =========================================================
   SINGLE (must be LAST)
========================================================= */

router.get('/:id', getLeave);

export default router;