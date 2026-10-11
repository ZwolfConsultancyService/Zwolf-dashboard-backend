import express from 'express';
import {
  getClientProposals,
  getClientProposal,
} from '../controllers/proposalController.js';

import { protectClient } from '../middleware/clientAuthMiddleware.js';

const router = express.Router();

router.use(protectClient);

/* CLIENT — Only view */
router.get('/', getClientProposals);
router.get('/:id', getClientProposal);

export default router;