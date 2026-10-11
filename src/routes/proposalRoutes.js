import express from 'express';
import {
  createProposal,
  getProposals,
  getProposal,
  updateProposal,
  approveProposal,
  deleteProposal,
} from '../controllers/proposalController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

/* =========================================================
   MANAGER + SALES ROUTES
========================================================= */

router.post(
  '/',
  authorize('manager', 'sales'),
  createProposal
);

router.get(
  '/',
  authorize('manager', 'sales'),
  getProposals
);

router.put(
  '/:id',
  authorize('manager', 'sales'),
  updateProposal
);

router.patch(
  '/:id/approve',
  authorize('manager', 'sales'),
  approveProposal
);

router.delete(
  '/:id',
  authorize('manager', 'sales'),
  deleteProposal
);

/* SINGLE — must be LAST */
router.get('/:id', getProposal);

export default router;