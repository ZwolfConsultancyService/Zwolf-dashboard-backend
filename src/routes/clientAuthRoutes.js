import express from 'express';
import rateLimit from 'express-rate-limit';

import {
  clientLogin,
  getClientDashboard,
} from '../controllers/clientAuthController.js';
import { protectClient } from "../middleware/clientAuthMiddleware.js";
const router = express.Router();

const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,

  message: {
    success: false,
    message:
      'Too many login attempts, try again later',
  },
});

router.post(
  '/login',
  clientLoginLimiter,
  clientLogin
);
router.get(
  '/dashboard',
  protectClient,
  getClientDashboard
);

export default router;