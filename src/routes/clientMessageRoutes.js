import express from "express";

import {
  getClientConversations,
  getOrCreateClientConversation,
  getClientMessages,
  sendClientMessage,
  markClientConversationAsRead,
  editClientMessage,
  deleteClientMessage,
  uploadClientMessageAttachment,
} from "../controllers/clientMessageController.js";

import { protectClient } from "../middleware/clientAuthMiddleware.js";

import uploadMessageFile from "../middleware/messageUploadMiddleware.js";

const router = express.Router();

router.use(protectClient);

/* =========================================================
   CLIENT CONVERSATIONS
========================================================= */

router.get(
  "/conversations",
  getClientConversations
);

router.post(
  "/conversations",
  getOrCreateClientConversation
);

/* =========================================================
   CLIENT MESSAGES
========================================================= */

router.get(
  "/conversations/:conversationId",
  getClientMessages
);

router.post(
  "/",
  sendClientMessage
);

/* =========================================================
   CLIENT READ
========================================================= */

router.patch(
  "/conversations/:conversationId/read",
  markClientConversationAsRead
);

/* =========================================================
   CLIENT EDIT / DELETE
========================================================= */

router.patch(
  "/:id",
  editClientMessage
);

router.delete(
  "/:id",
  deleteClientMessage
);

/* =========================================================
   CLIENT ATTACHMENT
========================================================= */

router.post(
  "/upload",
  uploadMessageFile.single("file"),
  uploadClientMessageAttachment
);

export default router;