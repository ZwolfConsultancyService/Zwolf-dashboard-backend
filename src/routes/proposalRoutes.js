import express from 'express';
import multer from 'multer';
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

// 🆕 Multer setup (Memory storage me file aayegi taaki controller usko cloud pe bhej sake)
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

/* =========================================================
   MANAGER + SALES ROUTES
========================================================= */

// 🆕 upload.single('pdf') add kiya taaki file receive ho sake
router.post(
  '/',
  authorize('manager', 'sales'),
  upload.single('pdf'),
  createProposal
);

router.get(
  '/',
  authorize('manager', 'sales'),
  getProposals
);

// 🆕 update me bhi multer laga diya (agar future me pdf change karni ho)
router.put(
  '/:id',
  authorize('manager', 'sales'),
  upload.single('pdf'),
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