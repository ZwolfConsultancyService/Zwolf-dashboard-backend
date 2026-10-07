import express from 'express';
import {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getNotifications);
router.post('/', authorize('manager'), createNotification);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

/* 🆕 DELETE */
router.delete('/:id', authorize('manager'), deleteNotification);

export default router;