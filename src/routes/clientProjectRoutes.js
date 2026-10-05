import express from 'express';

import {
  getClientProjects,
  getClientProject,
  getClientProjectSummary,
  getClientPaymentsBreakdown,
} from '../controllers/clientProjectController.js';

import { protectClient } from '../middleware/clientAuthMiddleware.js';

const router = express.Router();

router.use(protectClient);

router.get(
  '/payments/breakdown',
  getClientPaymentsBreakdown
);

router.get(
  '/summary',
  getClientProjectSummary
);

router.get(
  '/',
  getClientProjects
);

router.get(
  '/:id',
  getClientProject
);

export default router;