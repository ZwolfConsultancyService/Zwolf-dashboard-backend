import express from 'express';
import {
  createLead, getLeadStats, getMyLeadCount, getLeads,
} from '../controllers/leadController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.post('/', authorize('sales'), createLead);
router.get('/stats', getLeadStats);
router.get('/my-count', authorize('sales'), getMyLeadCount);
router.get('/', getLeads);

export default router;