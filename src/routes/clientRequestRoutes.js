import express from "express";

import {
  sendClientRequest,
  getClientRequests,
   getMyMeetings,
} from "../controllers/clientRequestController.js";

import { protectClient } from "../middleware/clientAuthMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================================================
   CLIENT → SEND REQUEST
   
   POST /api/client-requests/send
========================================================= */

router.post("/send", protectClient, sendClientRequest);

router.get("/my-meetings", protectClient, getMyMeetings);

/* =========================================================
   MANAGER → GET ALL CLIENT REQUESTS
   
   GET /api/client-requests
========================================================= */

router.get("/", protect, getClientRequests);


export default router;