import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { loginValidator } from '../validators/authValidator.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, try again later' },
});

router.post('/login', loginLimiter, loginValidator, validate, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;