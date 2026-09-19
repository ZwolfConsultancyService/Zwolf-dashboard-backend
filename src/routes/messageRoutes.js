import express from 'express';
import { getMessages, sendMessage, markMessageAsRead } from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getMessages).post(sendMessage);
router.patch('/:id/read', markMessageAsRead);

export default router;