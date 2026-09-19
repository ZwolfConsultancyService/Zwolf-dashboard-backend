import express from 'express';
import {
  getNotifications, createNotification, markAsRead, markAllAsRead,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getNotifications).post(authorize('manager'), createNotification);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;