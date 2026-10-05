import express from 'express';

import {
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  markConversationAsRead,
  editMessage,
  deleteMessage,
  uploadMessageAttachment,
   clearConversationMessages
} from '../controllers/messageController.js';

import { protect } from '../middleware/authMiddleware.js';
import uploadMessageFile from '../middleware/messageUploadMiddleware.js';

const router = express.Router();

router.use(protect);

/*
|--------------------------------------------------------------------------
| Conversations
|--------------------------------------------------------------------------
*/

// Get logged-in user's conversations
router.get(
  '/conversations',
  getConversations
);

// Create / get existing employee or client conversation
router.post(
  '/conversations',
  getOrCreateConversation
);

/*
|--------------------------------------------------------------------------
| Messages
|--------------------------------------------------------------------------
*/

// Get messages of selected conversation
router.get(
  '/conversations/:conversationId',
  getMessages
);

// Send message
router.post(
  '/',
  sendMessage
);

/*
|--------------------------------------------------------------------------
| Upload
|--------------------------------------------------------------------------
*/

router.post(
  '/upload',
  uploadMessageFile.single('file'),
  uploadMessageAttachment
);

/*
|--------------------------------------------------------------------------
| Mark as read
|--------------------------------------------------------------------------
*/

router.patch(
  '/conversations/:conversationId/read',
  markConversationAsRead
);
router.delete(
    '/conversations/:conversationId/clear',
    clearConversationMessages
);

/*
|--------------------------------------------------------------------------
| Message actions
|--------------------------------------------------------------------------
*/

// Edit own message
router.patch(
  '/:id',
  editMessage
);

// Soft delete own message
router.delete(
  '/:id',
  deleteMessage
);

export default router;