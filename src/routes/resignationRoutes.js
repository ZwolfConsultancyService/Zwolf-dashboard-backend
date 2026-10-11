import express from 'express';
import {
  applyResignation,
  getMyResignation,
  getAllResignations,
  getResignation,
  reviewResignation,
  withdrawResignation,
  deleteResignation,
} from '../controllers/resignationController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

/* =========================================================
   EMPLOYEE ROUTES
========================================================= */

router.post('/', applyResignation);
router.get('/my', getMyResignation);
router.patch('/:id/withdraw', withdrawResignation);

/* =========================================================
   MANAGER ROUTES
========================================================= */

router.get('/', authorize('manager'), getAllResignations);
router.patch(
  '/:id/review',
  authorize('manager'),
  reviewResignation
);
router.delete('/:id', authorize('manager'), deleteResignation);

/* =========================================================
   SINGLE (must be LAST)
========================================================= */

router.get('/:id', getResignation);

export default router;